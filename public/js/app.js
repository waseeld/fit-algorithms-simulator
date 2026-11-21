/**
 * Main Application Controller (app.js) - Refined Light Minimalist Edition
 * Coordinates UI views, simulation state, animations, sound effects, and exports.
 */

// Presets come from presets.js (window.Presets), which keeps its list private.
// Each preset: { id, name, description, mode, osReserved, blocks, processes }.
const PRESETS = window.Presets.getAll();

const ALGO_RULES = {
    'First Fit': 'First Fit: allocate the first hole that is big enough.',
    'Best Fit': 'Best Fit: allocate the smallest hole that is big enough.',
    'Worst Fit': 'Worst Fit: allocate the largest available hole.'
};

// Limits for the Setup form (all sizes are whole numbers of KB).
const LIMITS = {
    block: { min: 10, max: 100000 },
    proc: { min: 5, max: 100000 },
    os: { min: 0, max: 100000 },
    maxItems: 30
};

// The speed slider value is the speed (right = faster). The play timer needs
// a delay in ms, so the delay is the slider total minus the slider value.
const SPEED_SLIDER_TOTAL = 2000;

// Reads a size typed by the user. Returns { ok: true, value } or
// { ok: false, error } with a message that can be shown on screen.
function parseSize(raw, limits, label) {
    const text = String(raw === undefined || raw === null ? '' : raw).trim();
    if (text === '') {
        return { ok: false, error: `Enter a ${label} size in KB.` };
    }
    const value = Number(text);
    if (!Number.isInteger(value)) {
        return { ok: false, error: `The ${label} size must be a whole number of KB.` };
    }
    if (value < limits.min || value > limits.max) {
        return {
            ok: false,
            error: `The ${label} size must be between ${limits.min} and ${limits.max.toLocaleString()} KB.`
        };
    }
    return { ok: true, value };
}

class AppController {
    constructor() {
        this.currentTab = 'setup';
        this.currentMode = 'fixed'; // 'fixed' or 'dynamic'
        this.activeAlgo = 'First Fit';
        this.osReserved = 0;
        this.activePresetId = PRESETS[0].id;

        // Current workload
        this.blocks = [...PRESETS[0].blocks];
        this.processes = [...PRESETS[0].processes];
        this.currentMode = PRESETS[0].mode || 'fixed';
        this.osReserved = PRESETS[0].osReserved || 0;

        // Simulation state
        this.steps = [];
        this.currentStepIdx = -1;
        this.isPlaying = false;
        this.playTimer = null;
        this.playbackSpeed = 800; // ms, replaced by the slider value in bindEvents
        this.compactedFromStep = null; // first step that was re-run after a compaction

        // Comparison state
        this.lastComparison = null;
        this.resizeTimer = null;
        this.countAnimations = {};

        // Visualizers
        this.setupVisualizer = new MemoryVisualizer('setup-preview-map', 'setup-preview-ruler');
        this.simVisualizer = new MemoryVisualizer('sim-live-map', 'sim-live-ruler');
        this.resultsVisualizer = new MemoryVisualizer('results-final-map', 'results-final-ruler');

        this.init();
    }

    init() {
        this.syncModeControls();
        this.bindEvents();
        this.bindKeyboardShortcuts();
        this.renderPresetCards();
        this.renderSetupWorkload();
        this.updateCompactButton();
        this.runComparison();
    }

    bindEvents() {
        // Segmented Navigation Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.dataset.tab;
                this.switchTab(targetTab);
                soundFX.playClick();
            });
        });

        // Sound Switcher
        const soundToggle = document.getElementById('btn-sound-toggle');
        if (soundToggle) {
            soundToggle.addEventListener('click', () => {
                const isEnabled = soundFX.toggle();
                const iconEl = document.getElementById('sound-icon');
                const statusEl = document.getElementById('lbl-sound-status');
                if (iconEl) iconEl.innerText = isEnabled ? '🔊' : '🔇';
                if (statusEl) statusEl.innerText = isEnabled ? 'Sound: ON' : 'Sound: OFF';
                if (isEnabled) soundFX.playClick();
            });
        }

        // Mode Radio Selector (Fixed vs Dynamic)
        const radioFixed = document.getElementById('radio-mode-fixed');
        const radioDynamic = document.getElementById('radio-mode-dynamic');
        if (radioFixed && radioDynamic) {
            radioFixed.addEventListener('change', () => {
                if (radioFixed.checked) this.setMode('fixed');
            });
            radioDynamic.addEventListener('change', () => {
                if (radioDynamic.checked) this.setMode('dynamic');
            });
        }

        // OS Reserved
        const osInput = document.getElementById('input-os-reserved');
        if (osInput) {
            osInput.addEventListener('input', (e) => {
                const parsed = parseSize(e.target.value === '' ? '0' : e.target.value, LIMITS.os, 'OS');
                if (!parsed.ok) {
                    this.showSetupMessage(parsed.error);
                    return;
                }
                this.showSetupMessage('');
                this.osReserved = parsed.value;
                this.activePresetId = 'custom';
                this.renderPresetCards();
                this.renderSetupWorkload();
            });
            // When the field loses focus, show the value that is really in use.
            osInput.addEventListener('change', () => {
                osInput.value = this.osReserved;
                this.showSetupMessage('');
            });
        }

        // Add Block / Add Process (button click or Enter key)
        const btnAddBlock = document.getElementById('btn-add-block');
        if (btnAddBlock) {
            btnAddBlock.addEventListener('click', () => this.addItem('block'));
        }
        const btnAddProc = document.getElementById('btn-add-proc');
        if (btnAddProc) {
            btnAddProc.addEventListener('click', () => this.addItem('proc'));
        }
        [['input-block-size', 'block'], ['input-proc-size', 'proc']].forEach(([id, kind]) => {
            const field = document.getElementById(id);
            if (field) {
                field.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.addItem(kind);
                    }
                });
            }
        });

        // Randomize
        const btnRandom = document.getElementById('btn-randomize');
        if (btnRandom) {
            btnRandom.addEventListener('click', () => {
                const bCount = Math.floor(Math.random() * 3) + 4;
                const pCount = Math.floor(Math.random() * 3) + 4;
                this.blocks = Array.from({ length: bCount }, () => Math.floor(Math.random() * 6 + 1) * 100);
                this.processes = Array.from({ length: pCount }, () => Math.floor(Math.random() * 5 + 1) * 80 + 20);
                this.activePresetId = 'custom';
                this.showSetupMessage('');
                this.renderPresetCards();
                this.renderSetupWorkload();
                soundFX.playClick();
            });
        }

        // Clear All
        const btnClear = document.getElementById('btn-clear-all');
        if (btnClear) {
            btnClear.addEventListener('click', () => {
                this.blocks = [];
                this.processes = [];
                this.activePresetId = 'custom';
                this.showSetupMessage('');
                this.renderPresetCards();
                this.renderSetupWorkload();
                soundFX.playClick();
            });
        }

        // Sort Processes Descending (Chapter 5 Slide 9 Q3 Test)
        const btnSort = document.getElementById('btn-sort-procs-desc');
        if (btnSort) {
            btnSort.addEventListener('click', () => {
                this.processes.sort((a, b) => b - a);
                this.activePresetId = 'custom';
                this.renderPresetCards();
                this.renderSetupWorkload();
                soundFX.playClick();
            });
        }

        // Start Simulation Hero Button
        const btnStartSim = document.getElementById('btn-start-sim');
        if (btnStartSim) {
            btnStartSim.addEventListener('click', () => {
                if (this.blocks.length === 0 || this.processes.length === 0) {
                    this.showSetupMessage('Add at least one memory partition and one process first.');
                    return;
                }
                this.showSetupMessage('');
                this.switchTab('sim');
                soundFX.playClick();
            });
        }

        // Simulation Algorithm Selector
        const algoSelect = document.getElementById('sim-algo-select');
        if (algoSelect) {
            algoSelect.addEventListener('change', (e) => {
                this.activeAlgo = e.target.value;
                this.prepareSimulation();
                soundFX.playClick();
            });
        }

        // Step Controls
        const btnNext = document.getElementById('btn-sim-next');
        const btnPrev = document.getElementById('btn-sim-prev');
        const btnPlay = document.getElementById('btn-sim-play');
        const btnReset = document.getElementById('btn-sim-reset');
        if (btnNext) btnNext.addEventListener('click', () => this.stepForward());
        if (btnPrev) btnPrev.addEventListener('click', () => this.stepBackward());
        if (btnPlay) btnPlay.addEventListener('click', () => this.togglePlay());
        if (btnReset) btnReset.addEventListener('click', () => this.resetSim());

        // Compaction Button (Slide 10-11)
        const btnCompact = document.getElementById('btn-sim-compact');
        if (btnCompact) {
            btnCompact.addEventListener('click', () => this.triggerCompaction());
        }

        // Playback Speed Slider (right = faster)
        const speedSlider = document.getElementById('sim-speed-slider');
        if (speedSlider) {
            this.playbackSpeed = SPEED_SLIDER_TOTAL - parseInt(speedSlider.value, 10);
            speedSlider.addEventListener('input', (e) => {
                this.playbackSpeed = SPEED_SLIDER_TOTAL - parseInt(e.target.value, 10);
                if (this.isPlaying) {
                    clearInterval(this.playTimer);
                    this.playTimer = setInterval(() => this.stepForward(), this.playbackSpeed);
                }
            });
        }

        // Export Buttons
        const btnPdf = document.getElementById('btn-export-pdf');
        const btnCsv = document.getElementById('btn-export-csv');
        const btnJson = document.getElementById('btn-export-json');
        if (btnPdf) btnPdf.addEventListener('click', () => this.exportPDF());
        if (btnCsv) btnCsv.addEventListener('click', () => this.exportCSV());
        if (btnJson) btnJson.addEventListener('click', () => this.exportJSON());

        // The charts are drawn at the size of their canvas, so redraw them
        // when the window size changes.
        window.addEventListener('resize', () => {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => {
                if (this.currentTab === 'compare') this.renderCharts();
            }, 150);
        });
    }

    bindKeyboardShortcuts() {
        window.addEventListener('keydown', (e) => {
            // Never take over browser shortcuts such as Ctrl+C, Ctrl+R or Cmd+C.
            if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;

            const target = e.target;
            const tag = target && target.tagName;
            // Typing in a field or moving a slider: the keys belong to the field.
            if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' ||
                (target && target.isContentEditable)) {
                return;
            }
            // Space and Enter already activate a focused button or card.
            const role = target && target.getAttribute ? target.getAttribute('role') : null;
            if ((tag === 'BUTTON' || tag === 'A' || role === 'button') &&
                (e.code === 'Space' || e.code === 'Enter')) {
                return;
            }

            // Simulation shortcuts only work while the simulation tab is open.
            const onSim = this.currentTab === 'sim';

            switch (e.code) {
                case 'Space':
                    if (!onSim) return;
                    e.preventDefault();
                    this.togglePlay();
                    break;
                case 'ArrowRight':
                    if (!onSim) return;
                    e.preventDefault();
                    this.stepForward();
                    break;
                case 'ArrowLeft':
                    if (!onSim) return;
                    e.preventDefault();
                    this.stepBackward();
                    break;
                case 'KeyC':
                    if (!onSim) return;
                    e.preventDefault();
                    this.triggerCompaction();
                    break;
                case 'KeyR':
                    if (!onSim) return;
                    e.preventDefault();
                    this.resetSim();
                    break;
                case 'Digit1': this.switchTab('setup'); break;
                case 'Digit2': this.switchTab('sim'); break;
                case 'Digit3': this.switchTab('results'); break;
                case 'Digit4': this.switchTab('compare'); break;
                case 'Digit5': this.switchTab('chapter5'); break;
            }
        });
    }

    switchTab(tabId) {
        const previousTab = this.currentTab;
        this.currentTab = tabId;
        document.querySelectorAll('.tab-btn').forEach(btn => {
            const isActive = btn.dataset.tab === tabId;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', String(isActive));
        });
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.toggle('active', pane.id === `tab-${tabId}`);
        });

        // The playback timer must not keep running (and beeping) on other tabs.
        if (tabId !== 'sim') this.pauseSim();

        if (tabId === 'sim') {
            // Opening the tab starts a fresh run; choosing it again keeps the progress.
            if (previousTab !== 'sim' || this.steps.length === 0) this.prepareSimulation();
        } else if (tabId === 'results') {
            this.renderResults();
        } else if (tabId === 'compare') {
            this.runComparison();
        }
    }

    // Shows a short validation message under the Setup form ('' clears it).
    showSetupMessage(text) {
        const el = document.getElementById('setup-message');
        if (el) el.textContent = text || '';
    }

    setMode(mode) {
        this.currentMode = mode;
        // The loaded preset was designed for its own mode, so it is now a custom setup.
        this.activePresetId = 'custom';
        this.renderPresetCards();
        this.renderSetupWorkload();
        this.updateCompactButton();
        soundFX.playClick();
    }

    // Adds one partition ('block') or one process ('proc') from the Setup form.
    addItem(kind) {
        const isBlock = kind === 'block';
        const input = document.getElementById(isBlock ? 'input-block-size' : 'input-proc-size');
        const list = isBlock ? this.blocks : this.processes;
        const noun = isBlock ? 'partition' : 'process';

        if (list.length >= LIMITS.maxItems) {
            this.showSetupMessage(`At most ${LIMITS.maxItems} ${noun}s are allowed.`);
            return;
        }
        const parsed = parseSize(input ? input.value : '', isBlock ? LIMITS.block : LIMITS.proc, noun);
        if (!parsed.ok) {
            this.showSetupMessage(parsed.error);
            return;
        }

        list.push(parsed.value);
        this.activePresetId = 'custom';
        this.showSetupMessage('');
        this.renderPresetCards();
        this.renderSetupWorkload();
        soundFX.playClick();
    }

    renderPresetCards() {
        const container = document.getElementById('presets-cards-container');
        if (!container) return;

        container.innerHTML = '';
        PRESETS.forEach((p, presetIdx) => {
            const isActive = this.activePresetId === p.id;
            const card = document.createElement('div');
            card.className = `preset-card-item ${isActive ? 'active' : ''}`;
            card.dataset.presetId = p.id;
            card.setAttribute('role', 'button');
            card.setAttribute('aria-pressed', String(isActive));
            card.tabIndex = 0;
            if (p.description) card.title = p.description;
            const badgeText = `#${presetIdx + 1} · ${(p.mode || 'fixed').toUpperCase()}`;
            const title = p.name;
            const blocksStr = p.blocks.join(', ');
            const procsStr = p.processes.join(', ');

            card.innerHTML = `
                <span class="preset-badge">${badgeText}</span>
                <div class="preset-title">${title}</div>
                <div class="preset-meta">
                    <div>Blocks: [${blocksStr}] KB</div>
                    <div>Procs:  [${procsStr}] KB</div>
                </div>
            `;

            const choosePreset = (fromKeyboard) => {
                this.activePresetId = p.id;
                this.blocks = [...p.blocks];
                this.processes = [...p.processes];
                this.currentMode = p.mode || 'fixed';
                this.osReserved = p.osReserved || 0;
                this.showSetupMessage('');
                this.syncModeControls();
                this.updateCompactButton();

                this.renderPresetCards();
                this.renderSetupWorkload();
                soundFX.playClick();

                // Rebuilding the cards drops the focus; give it back for keyboard users.
                if (fromKeyboard) {
                    const again = container.querySelector(`[data-preset-id="${p.id}"]`);
                    if (again) again.focus();
                }
            };

            card.addEventListener('click', () => choosePreset(false));
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    choosePreset(true);
                }
            });

            container.appendChild(card);
        });
    }

    // Keep the mode radios and OS-reserved input in sync with the current state.
    syncModeControls() {
        const radioFixed = document.getElementById('radio-mode-fixed');
        const radioDynamic = document.getElementById('radio-mode-dynamic');
        if (radioFixed && radioDynamic) {
            radioFixed.checked = (this.currentMode === 'fixed');
            radioDynamic.checked = (this.currentMode === 'dynamic');
        }
        const osInput = document.getElementById('input-os-reserved');
        if (osInput) osInput.value = this.osReserved;
    }

    renderSetupWorkload() {
        // Render blocks chips
        const blocksList = document.getElementById('blocks-chip-list');
        if (blocksList) {
            blocksList.innerHTML = '';
            this.blocks.forEach((sz, idx) => {
                const chip = document.createElement('div');
                chip.className = 'item-chip block-chip';
                chip.innerHTML = `
                    <span>B${idx + 1}: <strong>${sz}k</strong></span>
                    <button class="btn-chip-remove" title="Remove" aria-label="Remove partition B${idx + 1}">&times;</button>
                `;
                chip.querySelector('.btn-chip-remove').addEventListener('click', () => {
                    this.blocks.splice(idx, 1);
                    this.activePresetId = 'custom';
                    this.renderPresetCards();
                    this.renderSetupWorkload();
                    soundFX.playClick();
                });
                blocksList.appendChild(chip);
            });
        }

        // Render processes chips
        const procsList = document.getElementById('procs-chip-list');
        if (procsList) {
            procsList.innerHTML = '';
            this.processes.forEach((sz, idx) => {
                const chip = document.createElement('div');
                chip.className = 'item-chip proc-chip';
                chip.innerHTML = `
                    <span>P${idx + 1}: <strong>${sz}k</strong></span>
                    <button class="btn-chip-remove" title="Remove" aria-label="Remove process P${idx + 1}">&times;</button>
                `;
                chip.querySelector('.btn-chip-remove').addEventListener('click', () => {
                    this.processes.splice(idx, 1);
                    this.activePresetId = 'custom';
                    this.renderPresetCards();
                    this.renderSetupWorkload();
                    soundFX.playClick();
                });
                procsList.appendChild(chip);
            });
        }

        // Total physical memory = every partition plus the OS area.
        const totalMem = this.blocks.reduce((a, b) => a + b, 0) + this.osReserved;
        const totalDem = this.processes.reduce((a, b) => a + b, 0);

        const lblTotalMem = document.getElementById('lbl-total-mem');
        const lblTotalDem = document.getElementById('lbl-total-demand');
        if (lblTotalMem) lblTotalMem.innerText = `${totalMem.toLocaleString()} KB`;
        if (lblTotalDem) lblTotalDem.innerText = `${totalDem.toLocaleString()} KB`;

        this.updateSetupPreview();
    }

    updateSetupPreview() {
        const previewBlocks = MemoryModels.buildInitialMemory(this.blocks, this.osReserved);
        this.setupVisualizer.render(previewBlocks);
    }

    // Compaction merges free holes, so it only makes sense with dynamic partitions.
    updateCompactButton() {
        const btn = document.getElementById('btn-sim-compact');
        if (!btn) return;
        const dynamic = this.currentMode === 'dynamic';
        btn.disabled = !dynamic;
        btn.title = dynamic
            ? 'Compact memory: merge all free holes into one (shortcut C)'
            : 'Compaction needs dynamic partitions. Fixed partitions cannot be merged.';
    }

    prepareSimulation() {
        this.pauseSim();
        const allocator = Algorithms.getAllocator(this.activeAlgo);
        const initBlocks = MemoryModels.buildInitialMemory(this.blocks, this.osReserved);
        const initProcs = MemoryModels.buildProcesses(this.processes);

        const sim = allocator.runSimulation(initBlocks, initProcs, this.currentMode);
        this.steps = sim.steps;
        this.currentStepIdx = -1;
        this.compactedFromStep = null;
        this.updateCompactButton();

        // Render initial clear state
        this.simVisualizer.render(initBlocks);
        this.renderQueuePills(-1);
        this.updateStepCounter();
        this.clearCandidateTable();

        const decisionEl = document.getElementById('sim-decision-text');
        if (decisionEl) {
            decisionEl.innerHTML = `
                <div style="font-weight:700; color:var(--text-primary); margin-bottom:4px;">
                    ${ALGO_RULES[this.activeAlgo] || this.activeAlgo}
                </div>
                <div style="color:var(--text-secondary); font-size:13px;">
                    Ready. Click <strong>Run All ▶</strong> or <strong>⏭ Next Step</strong> to observe allocation.
                </div>
            `;
        }
    }

    stepForward() {
        if (this.currentStepIdx + 1 < this.steps.length) {
            this.currentStepIdx++;
            this.applyStep(this.currentStepIdx);
            // Reaching the last step ends playback right away.
            if (this.currentStepIdx + 1 >= this.steps.length) this.pauseSim();
        } else {
            this.pauseSim();
        }
    }

    stepBackward() {
        if (this.currentStepIdx > 0) {
            this.currentStepIdx--;
            this.applyStep(this.currentStepIdx);
        } else if (this.currentStepIdx === 0) {
            this.prepareSimulation();
        }
    }

    applyStep(stepIdx) {
        const step = this.steps[stepIdx];

        // Sound effect
        if (step.status === 'ALLOCATED') {
            soundFX.playAllocate();
        } else {
            soundFX.playFail();
        }

        // Render Memory Map with candidate badges & animations
        this.simVisualizer.render(step.snapshot, step.chosenBlockId, step.candidates);

        // Update Queue Pills
        this.renderQueuePills(stepIdx);

        // Update Candidate Table
        this.renderCandidateTable(step.candidates);

        // Update Decision Rationale Box
        this.renderDecisionRationale(step);

        this.updateStepCounter();
    }

    renderQueuePills(currentIdx) {
        const container = document.getElementById('sim-queue-carousel');
        if (!container) return;
        container.innerHTML = '';

        this.processes.forEach((sz, idx) => {
            const pill = document.createElement('div');
            pill.className = 'queue-proc-pill';

            if (idx === currentIdx) {
                pill.classList.add('active');
            } else if (idx < currentIdx) {
                const s = this.steps[idx];
                pill.classList.add(s && s.status === 'ALLOCATED' ? 'allocated' : 'failed');
            }

            pill.innerHTML = `<span>P${idx + 1} (${sz}k)</span>`;
            container.appendChild(pill);
        });
    }

    renderCandidateTable(candidates) {
        const tbody = document.getElementById('eval-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        candidates.forEach(c => {
            const tr = document.createElement('tr');
            const verdictText = c.chosen ? 'Chosen' : (c.fits ? 'Fits' : 'Too small');
            const verdictClass = c.chosen ? 'chosen' : (c.fits ? 'fits' : 'small');

            // A hole that is too small has no leftover, so show a dash, not a negative number.
            tr.innerHTML = `
                <td><strong>${c.label}</strong></td>
                <td>${c.blockSize} KB</td>
                <td>${c.fits ? 'Yes' : 'No'}</td>
                <td>${c.fits ? `${c.leftover} KB` : '-'}</td>
                <td><span class="verdict-tag ${verdictClass}">${verdictText}</span></td>
            `;
            tbody.appendChild(tr);
        });
    }

    renderDecisionRationale(step) {
        const textEl = document.getElementById('sim-decision-text');
        if (!textEl) return;
        const p = step.process;
        let explanation = '';

        // The first step that runs after a compaction says so.
        const compactionNote = (this.compactedFromStep !== null && this.compactedFromStep === this.currentStepIdx)
            ? `<div style="color:var(--purple); font-weight:700; font-size:12px; margin-bottom:4px;">⚡ Placed in the compacted memory</div>`
            : '';

        if (step.status === 'ALLOCATED') {
            if (this.activeAlgo === 'First Fit') {
                explanation = `First Fit scanned holes in address order and stopped at the first one that fits ${p.size} KB: <strong>${step.chosenLabel}</strong>.`;
            } else if (this.activeAlgo === 'Best Fit') {
                explanation = `Best Fit checked all ${step.candidates.length} free holes and picked <strong>${step.chosenLabel}</strong>, which leaves the smallest leftover (${step.leftover} KB).`;
            } else {
                explanation = `Worst Fit checked all ${step.candidates.length} free holes and picked <strong>${step.chosenLabel}</strong>, which leaves the largest leftover (${step.leftover} KB).`;
            }

            let modelNote;
            if (this.currentMode === 'dynamic') {
                modelNote = step.splitLabel
                    ? `Dynamic mode: the hole is split — ${p.size} KB goes to the process and a new free hole ${step.splitLabel} of ${step.leftover} KB is created.`
                    : `Dynamic mode: exact fit — no leftover hole is created.`;
            } else {
                modelNote = `Fixed mode: the whole ${p.size + step.leftover} KB partition is given to the process — ${step.leftover} KB is internal fragmentation.`;
            }

            textEl.innerHTML = `
                ${compactionNote}
                <div style="color:var(--success); font-weight:800; font-size:14px; margin-bottom:4px;">
                    ✓ Allocated: ${p.name} (${p.size} KB) &rarr; ${step.chosenLabel}
                </div>
                <div style="color:var(--text-primary);">${explanation}</div>
                <div style="margin-top:6px; font-size:12px; color:var(--text-secondary); background:var(--bg-surface); padding:6px 10px; border-radius:6px; border:1px solid var(--border-subtle);">
                    ${modelNote}
                </div>
            `;
        } else {
            const freeSizes = step.candidates.map(c => c.blockSize);
            const totalFree = freeSizes.reduce((a, b) => a + b, 0);
            const largestFree = freeSizes.length > 0 ? Math.max(...freeSizes) : 0;

            let failMsg = `${p.name} (${p.size} KB) could not be allocated: the largest free hole is only ${largestFree} KB.`;
            if (totalFree >= p.size) {
                failMsg += `<br/><strong style="color:var(--danger);">External fragmentation: ${totalFree} KB is free in total (≥ ${p.size} KB), but it is not contiguous.</strong>`;
                if (this.currentMode === 'dynamic') {
                    failMsg += `<br/>Press <strong>⚡ Compact</strong> (or C) to merge the free holes and retry.`;
                }
            }

            textEl.innerHTML = `
                ${compactionNote}
                <div style="color:var(--danger); font-weight:800; font-size:14px; margin-bottom:4px;">
                    ✗ Allocation failed: ${p.name} (${p.size} KB)
                </div>
                <div style="color:var(--text-primary);">${failMsg}</div>
            `;
        }
    }

    clearCandidateTable() {
        const tbody = document.getElementById('eval-table-body');
        if (tbody) tbody.innerHTML = '';
    }

    updateStepCounter() {
        const el = document.getElementById('lbl-step-counter');
        if (el) {
            el.innerText = `Step ${this.currentStepIdx + 1} / ${this.steps.length}`;
        }
    }

    togglePlay() {
        if (!this.isPlaying) {
            if (this.currentStepIdx + 1 >= this.steps.length) {
                this.prepareSimulation();
            }
            this.isPlaying = true;
            this.updatePlayButtonUI(true);
            this.playTimer = setInterval(() => this.stepForward(), this.playbackSpeed);
        } else {
            this.pauseSim();
        }
    }

    pauseSim() {
        this.isPlaying = false;
        clearInterval(this.playTimer);
        this.updatePlayButtonUI(false);
    }

    updatePlayButtonUI(playing) {
        const icon = document.getElementById('play-btn-icon');
        const text = document.getElementById('lbl-play-text');
        if (icon) icon.innerText = playing ? '⏸' : '▶';
        if (text) text.innerText = playing ? 'Pause' : 'Run All';
    }

    resetSim() {
        this.prepareSimulation();
        soundFX.playClick();
    }

    // Shows a short message in the rationale box (used when nothing can be compacted).
    showRationaleNote(html) {
        const textEl = document.getElementById('sim-decision-text');
        if (textEl) {
            textEl.innerHTML = `<div style="color:var(--purple); font-weight:700; font-size:13px;">${html}</div>`;
        }
    }

    // Compaction moves every allocated block to the start of memory and merges
    // all free holes into one. The processes that have not been placed yet (and
    // the one that just failed) are then run again on the compacted memory.
    triggerCompaction() {
        if (this.steps.length === 0) return;

        if (this.currentMode !== 'dynamic') {
            this.showRationaleNote('⚡ Compaction is only available with dynamic partitions. Fixed partitions have a fixed size and cannot be merged.');
            return;
        }

        this.pauseSim();
        const idx = this.currentStepIdx;
        const currentBlocks = idx >= 0 && this.steps[idx]
            ? this.steps[idx].snapshot
            : MemoryModels.buildInitialMemory(this.blocks, this.osReserved);

        // Nothing to do when there are no holes, or the only hole is already at the end.
        const holeCount = currentBlocks.filter(b => b.isFree).length;
        const lastIsFree = currentBlocks.length > 0 && currentBlocks[currentBlocks.length - 1].isFree;
        if (holeCount === 0 || (holeCount === 1 && lastIsFree)) {
            this.showRationaleNote('⚡ Memory is already compact: there is no free hole in the middle of memory to merge.');
            return;
        }

        soundFX.playCompact();
        const result = MemoryModels.performCompaction(currentBlocks);

        // Run again from the failed process (or from the next one) on the compacted memory.
        const failedNow = idx >= 0 && this.steps[idx].status === 'FAILED';
        const startIdx = failedNow ? idx : idx + 1;
        const pending = MemoryModels.buildProcesses(this.processes).slice(startIdx);
        let nextText = '';
        if (pending.length > 0) {
            const allocator = Algorithms.getAllocator(this.activeAlgo);
            const rerun = allocator.runSimulation(result.compactedBlocks, pending, this.currentMode);
            rerun.steps.forEach((s, k) => { s.stepNumber = startIdx + k + 1; });
            this.steps = this.steps.slice(0, startIdx).concat(rerun.steps);
            this.currentStepIdx = startIdx - 1;
            this.compactedFromStep = startIdx;
            nextText = ` Press <strong>Next Step</strong> to ${failedNow ? 'retry' : 'continue with'} ${pending[0].name} (${pending[0].size} KB) in the compacted memory.`;
        }

        // Re-render memory map with compaction animation
        this.simVisualizer.render(result.compactedBlocks, null, [], true);
        this.clearCandidateTable();
        this.renderQueuePills(this.currentStepIdx);
        this.updateStepCounter();

        // Mark the coalesced hole with shimmer sweep animation (inside the simulation map only)
        setTimeout(() => {
            const coalescedEl = document.querySelector('#sim-live-map .memory-block-card.block-free');
            if (coalescedEl) coalescedEl.classList.add('coalesced-hole-glow');
        }, 100);

        // Update rationale card
        const textEl = document.getElementById('sim-decision-text');
        if (textEl) {
            textEl.innerHTML = `
                <div style="color:var(--purple); font-weight:800; font-size:14px; margin-bottom:4px;">
                    ⚡ [Memory Compaction performed - Slides 10-11]
                </div>
                <div style="color:var(--text-primary); font-size:13px;">
                    ${holeCount} free holes were merged into one contiguous hole of ${result.totalFreeMerged} KB.${nextText}
                </div>
            `;
        }
    }

    // Number counting animation for KPI cards
    animateValue(id, start, end, duration, decimals = 0, suffix = '') {
        const obj = document.getElementById(id);
        if (!obj) return;
        // Stop an older animation on the same card so two loops never fight.
        if (this.countAnimations[id]) window.cancelAnimationFrame(this.countAnimations[id]);

        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const current = (progress * (end - start) + start);
            obj.innerText = `${current.toFixed(decimals)}${suffix}`;
            if (progress < 1) {
                this.countAnimations[id] = window.requestAnimationFrame(step);
            } else {
                delete this.countAnimations[id];
            }
        };
        this.countAnimations[id] = window.requestAnimationFrame(step);
    }

    renderResults() {
        const allocator = Algorithms.getAllocator(this.activeAlgo);
        const initBlocks = MemoryModels.buildInitialMemory(this.blocks, this.osReserved);
        const initProcs = MemoryModels.buildProcesses(this.processes);

        const sim = allocator.runSimulation(initBlocks, initProcs, this.currentMode);
        const metrics = MemoryAnalyzer.calculateMetrics(this.activeAlgo, sim.finalBlocks, sim.finalProcesses, sim.steps);
        const dynamic = this.currentMode === 'dynamic';

        // Animate KPI numbers
        this.animateValue('kpi-val-util', 0, metrics.memoryUtilization, 600, 1, '%');
        this.animateValue('kpi-val-internal', 0, metrics.internalFragmentation, 600, 0, ' KB');
        this.animateValue('kpi-val-external', 0, metrics.externalFragmentation, 600, 0, ' KB');

        const capUtil = document.getElementById('kpi-cap-util');
        if (capUtil) capUtil.innerText = `${metrics.usedMemory} / ${metrics.totalMemory} KB used`;

        const kpiAllocated = document.getElementById('kpi-val-allocated');
        if (kpiAllocated) kpiAllocated.innerText = `${metrics.allocatedCount} / ${metrics.totalProcesses}`;

        // Diagnostic Badges for Q2
        const badgeExact = document.getElementById('badge-exact-fits');
        const badgeUnusable = document.getElementById('badge-unusable-holes');
        if (badgeExact) badgeExact.innerText = `Exact Fits: ${metrics.exactFitsCount}`;
        if (badgeUnusable) badgeUnusable.innerText = `Unusable Small Holes: ${metrics.unusableHolesCount}`;

        // Final memory map
        this.resultsVisualizer.render(sim.finalBlocks);

        // Allocation breakdown table. The last two columns mean different things
        // in the two modes, so the headers follow the mode.
        const thPartition = document.getElementById('th-partition');
        const thLeftover = document.getElementById('th-leftover');
        if (thPartition) thPartition.innerText = dynamic ? 'Hole Size (before split)' : 'Partition Size';
        if (thLeftover) thLeftover.innerText = dynamic ? 'Leftover (new free hole)' : 'Wasted (internal frag.)';

        const tbody = document.getElementById('results-table-body');
        if (tbody) {
            tbody.innerHTML = '';
            sim.finalProcesses.forEach(p => {
                const tr = document.createElement('tr');
                const step = sim.steps.find(s => s.process.pid === p.pid);
                const statusColor = p.isAllocated ? 'var(--success)' : 'var(--danger)';

                tr.innerHTML = `
                    <td><strong>${p.name}</strong></td>
                    <td>${p.size} KB</td>
                    <td>${p.isAllocated ? step.chosenLabel : '-'}</td>
                    <td>${p.isAllocated ? `${p.size + step.leftover} KB` : '-'}</td>
                    <td>${p.isAllocated ? `${step.leftover} KB` : '-'}</td>
                    <td><strong style="color:${statusColor};">${p.isAllocated ? 'Allocated' : 'Failed'}</strong></td>
                `;
                tbody.appendChild(tr);
            });
        }

        // Mathematical Proof Breakdown (Formula substitution from Chapter 5)
        const freeHoles = sim.finalBlocks.filter(b => b.isFree).map(b => b.size);
        const osLine = this.osReserved > 0
            ? `\n   (The ${this.osReserved} KB reserved for the OS is not counted.)`
            : '';
        const internalNote = dynamic
            ? 'Dynamic mode: every hole is split to the exact process size, so this is always 0'
            : 'Sum of leftover spaces trapped inside allocated partitions';
        const mathProof = `
================================================================================
CHAPTER 5 MEMORY MANAGEMENT FORMULAS & NUMERICAL PROOF
================================================================================

1. MEMORY UTILIZATION:
   Formula:  (Used Memory / Total User Memory) × 100%
   Math:     (${metrics.usedMemory} KB / ${metrics.totalMemory} KB) × 100%${osLine}
   Result:   = ${metrics.memoryUtilization.toFixed(2)}%

2. INTERNAL FRAGMENTATION (Slide 10):
   Formula:  Σ (Allocated Block Size - Process Size)
   Math:     ${internalNote}
   Result:   = ${metrics.internalFragmentation} KB

3. EXTERNAL FRAGMENTATION (Slide 10):
   Formula:  Total Free Memory - Largest Free Hole
   Holes:    [${freeHoles.join(', ') || 'None'}] KB (Total Free: ${metrics.totalFreeMemory} KB)
   Math:     ${metrics.totalFreeMemory} KB - ${metrics.largestFreeHole} KB
   Result:   = ${metrics.externalFragmentation} KB
        `;
        const proofEl = document.getElementById('math-proof-content');
        if (proofEl) proofEl.innerText = mathProof.trim();
    }

    // Builds the banner text. An empty workload, or one where nothing could be
    // placed, must not be presented as a recommendation.
    renderWinnerBanner(ranking) {
        const winnerBanner = document.getElementById('winner-recommendation-box');
        if (!winnerBanner || !ranking) return;

        const bestM = ranking.bestMetrics;
        if (bestM.totalProcesses === 0 || this.blocks.length === 0) {
            winnerBanner.innerHTML = `
                <div class="winner-trophy-icon">ℹ️</div>
                <div>
                    <div class="winner-title">No workload to compare yet</div>
                    <div class="winner-desc">Add at least one memory partition and one process on the Setup tab to compare the three algorithms.</div>
                </div>
            `;
            return;
        }
        if (bestM.allocatedCount === 0) {
            winnerBanner.innerHTML = `
                <div class="winner-trophy-icon">⚠️</div>
                <div>
                    <div class="winner-title">No algorithm could allocate any process</div>
                    <div class="winner-desc">Every process is larger than every free partition, so there is nothing to recommend. Add a larger partition or reduce the process sizes.</div>
                </div>
            `;
            return;
        }

        let extra = '';
        if (ranking.ties.length > 0) {
            extra = `<br/><span style="color:var(--primary);">Tied with: ${ranking.ties.join(', ')}</span>`;
        } else if (ranking.equivalent && ranking.equivalent.length > 0) {
            extra = `<br/><span style="color:var(--primary);">Same memory result as ${ranking.equivalent.join(', ')}; ranked first because it scanned fewer holes.</span>`;
        }

        winnerBanner.innerHTML = `
            <div class="winner-trophy-icon">🏆</div>
            <div>
                <div class="winner-title">Recommended algorithm: ${ranking.best}</div>
                <div class="winner-desc">
                    Achieved top efficiency allocating <strong>${bestM.allocatedCount}/${bestM.totalProcesses}</strong> processes with <strong>${bestM.memoryUtilization.toFixed(1)}%</strong> utilization, internal fragmentation ${bestM.internalFragmentation} KB and external fragmentation ${bestM.externalFragmentation} KB.
                    ${extra}
                </div>
            </div>
        `;
    }

    runComparison() {
        const results = MemoryAnalyzer.simulateAll(this.blocks, this.processes, this.currentMode, this.osReserved);
        const ranking = MemoryAnalyzer.rankAlgorithms(results);
        this.lastComparison = results;

        // Winner Banner
        this.renderWinnerBanner(ranking);

        // Comparison Table
        const tbody = document.getElementById('compare-table-body');
        if (tbody) {
            tbody.innerHTML = '';
            results.forEach(r => {
                const m = r.metrics;
                const isWinner = ranking && r.name === ranking.best && m.allocatedCount > 0;
                const tr = document.createElement('tr');
                if (isWinner) tr.style.background = 'var(--success-subtle)';

                tr.innerHTML = `
                    <td><strong>${isWinner ? '★ ' : ''}${r.name}</strong></td>
                    <td><strong style="color:var(--success);">${m.allocatedCount}</strong> / ${m.totalProcesses}</td>
                    <td>${m.usedMemory} KB</td>
                    <td>${m.internalFragmentation} KB</td>
                    <td>${m.externalFragmentation} KB</td>
                    <td>${m.largestFreeHole} KB</td>
                    <td><strong>${m.memoryUtilization.toFixed(1)}%</strong></td>
                    <td>${m.totalScans} scans</td>
                `;
                tbody.appendChild(tr);
            });
        }

        // Render Canvas Charts (after the tab is visible, so the canvases have a size)
        setTimeout(() => this.renderCharts(), 50);
    }

    renderCharts() {
        if (!this.lastComparison) return;
        SimulationCharts.renderUtilizationChart('chart-utilization', this.lastComparison);
        SimulationCharts.renderFragmentationChart('chart-fragmentation', this.lastComparison);
    }

    exportPDF() {
        window.print();
    }

    // Saves text as a file. The link is added to the page for browsers that need it,
    // and the temporary URL is released afterwards.
    downloadFile(filename, content, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    exportCSV() {
        const results = MemoryAnalyzer.simulateAll(this.blocks, this.processes, this.currentMode, this.osReserved);
        // "Allocated" and "Total" are separate numeric columns: a value like 3/4
        // would be turned into a date by spreadsheet programs.
        let csv = 'Algorithm,AllocatedProcesses,TotalProcesses,UsedMemory_KB,InternalFrag_KB,ExternalFrag_KB,LargestHole_KB,Utilization_Pct,TotalScans\n';
        results.forEach(r => {
            const m = r.metrics;
            csv += `"${r.name}",${m.allocatedCount},${m.totalProcesses},${m.usedMemory},${m.internalFragmentation},${m.externalFragmentation},${m.largestFreeHole},${m.memoryUtilization.toFixed(2)},${m.totalScans}\n`;
        });

        this.downloadFile('memory_allocation_report.csv', csv, 'text/csv;charset=utf-8;');
    }

    exportJSON() {
        const results = MemoryAnalyzer.simulateAll(this.blocks, this.processes, this.currentMode, this.osReserved);
        const data = {
            course: 'CCS 3361 Operating Systems - Chapter 5',
            model: this.currentMode,
            osReserved: this.osReserved,
            initialBlocks: this.blocks,
            initialProcesses: this.processes,
            comparison: results.map(r => ({
                algorithm: r.name,
                metrics: r.metrics
            }))
        };
        this.downloadFile('memory_allocation_data.json', JSON.stringify(data, null, 2), 'application/json');
    }
}

// Instantiate on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new AppController();
});
