/**
 * Memory Map Visualizer (Team 2, Student 2)
 *
 * Draws the memory map: free holes, allocated blocks with their internal
 * fragmentation, the OS area, the scan highlight for the current step,
 * the address ruler, and a hover tooltip. No libraries.
 *
 * Usage (same interface the app controller expects):
 *   const map = new MemoryVisualizer("sim-live-map", "optional-ruler-id");
 *   map.render(blocks, chosenBlockId, candidates, isCompacting);
 *
 *   blocks      array of MemoryBlock (id, label, size, start, end, process,
 *               isOS, internalFragmentation)
 *   chosenBlockId  id of the block the algorithm picked (or null)
 *   candidates  array of { blockId, fits, chosen } from an AllocationStep
 *   isCompacting  true to play the compaction animation class
 *
 * It never throws: bad input shows an empty state instead.
 */
(function (root) {
    "use strict";

    var EMPTY_TEXT = "Add memory blocks to see the map";
    var MIN_WIDTH_PCT = 8.5;

    function esc(value) {
        return String(value === undefined || value === null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function num(value) {
        var n = Number(value);
        return Number.isFinite(n) ? n : 0;
    }

    function blockEnd(block) {
        return typeof block.end === "number" ? block.end : num(block.start) + num(block.size);
    }

    function fragmentation(block) {
        if (typeof block.internalFragmentation === "number") {
            return block.internalFragmentation;
        }
        return block.process ? Math.max(0, num(block.size) - num(block.process.size)) : 0;
    }

    class MemoryVisualizer {
        constructor(containerId, rulerId) {
            this.container = typeof document !== "undefined" && containerId
                ? document.getElementById(containerId) : null;
            this.ruler = typeof document !== "undefined" && rulerId
                ? document.getElementById(rulerId) : null;
            this.tooltip = this.createTooltip();
        }

        createTooltip() {
            if (typeof document === "undefined") {
                return null;
            }
            var el = document.getElementById("map-floating-tooltip");
            if (!el) {
                el = document.createElement("div");
                el.id = "map-floating-tooltip";
                el.className = "map-tooltip";
                document.body.appendChild(el);
            }
            return el;
        }

        render(blocks, highlightedBlockId, candidateList, isCompacting) {
            if (!this.container) {
                return { ok: false, reason: "container not found" };
            }
            var list = Array.isArray(blocks) ? blocks.filter(function (b) {
                return b && typeof b === "object";
            }) : [];
            var candidates = Array.isArray(candidateList) ? candidateList : [];
            var chosenId = highlightedBlockId === undefined ? null : highlightedBlockId;

            this.container.innerHTML = "";
            if (this.ruler) {
                this.ruler.innerHTML = "";
            }
            // The tile under the mouse is about to be replaced, so its
            // mouseleave will never fire: hide the tooltip here or it stays stuck.
            if (this.tooltip && this.tooltip.style) {
                this.tooltip.style.opacity = "0";
            }

            var total = list.reduce(function (sum, b) { return sum + num(b.size); }, 0);
            if (list.length === 0 || total <= 0) {
                this.container.innerHTML =
                    '<div class="map-empty" style="display:flex;align-items:center;' +
                    'justify-content:center;height:100%;color:var(--text-muted);' +
                    'font-size:13px;">' + EMPTY_TEXT + "</div>";
                return { ok: true, empty: true, blocks: 0 };
            }

            var row = document.createElement("div");
            row.className = "memory-map-row" + (isCompacting ? " compacting-anim" : "");
            row.setAttribute("role", "group");
            row.setAttribute("aria-label", "Memory map, " + list.length + " blocks, " + total + " KB total");

            for (var i = 0; i < list.length; i++) {
                row.appendChild(this.buildBlock(list[i], total, chosenId, candidates));
            }
            this.container.appendChild(row);

            if (this.ruler) {
                this.renderRuler(list, total);
            }
            return { ok: true, empty: false, blocks: list.length };
        }

        buildBlock(block, total, chosenId, candidates) {
            var size = num(block.size);
            var widthPct = Math.max(MIN_WIDTH_PCT, (size / total) * 100);
            var el = document.createElement("div");
            el.className = "memory-block-card";
            el.style.flex = widthPct + " 0 0%";
            el.dataset.blockId = block.id;

            var info = null;
            for (var i = 0; i < candidates.length; i++) {
                if (candidates[i] && candidates[i].blockId === block.id) {
                    info = candidates[i];
                    break;
                }
            }
            if (chosenId !== null && block.id === chosenId) {
                el.classList.add("block-chosen-glow");
            } else if (info) {
                el.classList.add(info.fits ? "block-scanned-fit" : "block-scanned-fail");
            }

            var label = esc(block.label || ("B" + block.id));
            if (block.isOS) {
                el.classList.add("block-os");
                el.innerHTML =
                    '<div class="block-header"><span class="block-badge os-badge">OS</span>' +
                    '<span class="block-size-tag">' + size + "k</span></div>" +
                    '<div class="block-body"><span class="block-proc-name">Kernel</span></div>';
            } else if (block.process) {
                el.classList.add("block-allocated");
                var frag = fragmentation(block);
                var procPct = size > 0
                    ? Math.min(100, Math.max(12, (num(block.process.size) / size) * 100)) : 100;
                var fragPct = 100 - procPct;
                el.innerHTML =
                    '<div class="block-header"><span class="block-badge alloc-badge">' + label +
                    '</span><span class="block-size-tag">' + size + "k</span></div>" +
                    '<div class="block-body allocated-body">' +
                    '<div class="proc-fill-bar" style="width:' + procPct + '%;">' +
                    '<span class="proc-name-label">' + esc(block.process.name) + "</span>" +
                    '<span class="proc-size-mini">(' + num(block.process.size) + "k)</span></div>" +
                    (frag > 0
                        ? '<div class="frag-fill-bar" style="width:' + fragPct + '%;">' +
                          '<span class="frag-label-mini">' + frag + "k</span></div>"
                        : "") +
                    "</div>";
            } else {
                el.classList.add("block-free");
                el.innerHTML =
                    '<div class="block-header"><span class="block-badge free-badge">' + label +
                    '</span><span class="block-size-tag">' + size + "k</span></div>" +
                    '<div class="block-body free-body"><span class="free-label-text">' +
                    "Free Hole</span></div>";
            }

            // Verdict pill: shown inside free holes only (the scan only looks at holes).
            // The chosen block already has the glow outline, so it needs no pill.
            var body = el.querySelector ? el.querySelector(".free-body") : null;
            if (info && block.process === null && body) {
                var tag = document.createElement("div");
                var kind = info.chosen ? "chosen" : (info.fits ? "fits" : "small");
                tag.className = "candidate-verdict-pill verdict-tag " + kind;
                tag.textContent = info.chosen ? "\u2713" : (info.fits ? "Fit" : "\u2717");
                body.style.flexDirection = "column";
                body.style.gap = "3px";
                body.appendChild(tag);
            }

            el.setAttribute("role", "img");
            el.setAttribute("aria-label", this.tooltipHtml(block).replace(/<br\/>/g, ", ").replace(/<[^>]+>/g, ""));
            this.attachTooltip(el, block);
            return el;
        }

        renderRuler(list, total) {
            var rulerRow = document.createElement("div");
            rulerRow.className = "ruler-row";
            // Same inner padding and gap as .memory-map-row so ticks line up with the tiles.
            rulerRow.style.padding = "0 4px";
            rulerRow.style.gap = "4px";
            list.forEach(function (b) {
                var tick = document.createElement("div");
                tick.className = "ruler-tick";
                tick.style.flex = Math.max(MIN_WIDTH_PCT, (num(b.size) / total) * 100) + " 0 0%";
                tick.innerHTML = '<span class="ruler-line"></span><span class="ruler-val">' +
                    num(b.start) + "k</span>";
                rulerRow.appendChild(tick);
            });
            var end = document.createElement("div");
            end.className = "ruler-tick end-tick";
            end.style.position = "absolute";
            end.style.right = "4px";
            end.style.top = "0";
            end.style.alignItems = "flex-end";
            end.innerHTML = '<span class="ruler-line"></span><span class="ruler-val">' +
                blockEnd(list[list.length - 1]) + "k</span>";
            rulerRow.appendChild(end);
            this.ruler.appendChild(rulerRow);
        }

        tooltipHtml(block) {
            var range = num(block.start) + "k - " + blockEnd(block) + "k";
            if (block.isOS) {
                return "<strong>OS Kernel</strong><br/>Size: " + num(block.size) +
                    " KB<br/>Address: " + range;
            }
            if (block.process) {
                var frag = fragmentation(block);
                var pct = num(block.size) > 0 ? ((frag / num(block.size)) * 100).toFixed(1) : "0.0";
                return "<strong>" + esc(block.label) + " (" + num(block.size) + " KB)</strong><br/>" +
                    "Process: <strong>" + esc(block.process.name) + " (" +
                    num(block.process.size) + " KB)</strong><br/>" +
                    "Internal fragmentation: " + frag + " KB (" + pct + "%)<br/>Address: " + range;
            }
            return "<strong>" + esc(block.label) + " (Free hole)</strong><br/>Available: " +
                num(block.size) + " KB<br/>Address: " + range;
        }

        attachTooltip(element, block) {
            var self = this;
            if (!this.tooltip) {
                return;
            }
            element.addEventListener("mouseenter", function (e) {
                self.tooltip.innerHTML = self.tooltipHtml(block);
                self.tooltip.style.opacity = "1";
                self.positionTooltip(e);
            });
            element.addEventListener("mousemove", function (e) {
                self.positionTooltip(e);
            });
            element.addEventListener("mouseleave", function () {
                self.tooltip.style.opacity = "0";
            });
        }

        positionTooltip(e) {
            this.tooltip.style.left = (e.clientX + 14) + "px";
            this.tooltip.style.top = (e.clientY + 14) + "px";
        }
    }

    root.MemoryVisualizer = MemoryVisualizer;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = MemoryVisualizer;
    }
})(typeof window !== "undefined" ? window : globalThis);
