"use strict";

// Tests for Team 1's engine (memory.js, algorithms.js, analyzer.js).
// The algorithms are compared with a small independent reference written
// here, and the numbers quoted in the Chapter 5 tab are checked against the
// real engine so the text can never drift away from what the app computes.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load() {
    const sandbox = { console };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    for (const name of ["memory", "algorithms", "analyzer"]) {
        const file = path.join(__dirname, "..", "public", "js", name + ".js");
        vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: name + ".js" });
    }
    return sandbox;
}

const { MemoryAnalyzer: Analyzer, MemoryModels: Models, Algorithms } = load();

// Arrays made inside the vm sandbox have another Array prototype, which
// deepStrictEqual rejects, so values are copied into plain objects first.
const plain = (value) => JSON.parse(JSON.stringify(value));

const byName = (results) => Object.fromEntries(results.map((r) => [r.name, r.metrics]));

// ---------------------------------------------------------------------------
// Independent reference simulator
// ---------------------------------------------------------------------------

function reference(blockSizes, processSizes, mode, algorithm) {
    const holes = blockSizes.map((size) => ({ size, used: null }));
    let placed = 0;
    let scans = 0;
    for (const need of processSizes) {
        const free = holes.map((hole, index) => ({ hole, index })).filter((x) => x.hole.used === null);
        let chosen = -1;
        if (algorithm === "first") {
            for (const { hole, index } of free) {
                scans++;
                if (hole.size >= need) { chosen = index; break; }
            }
        } else {
            scans += free.length;
            let bestLeft = null;
            for (const { hole, index } of free) {
                if (hole.size < need) continue;
                const left = hole.size - need;
                if (bestLeft === null || (algorithm === "best" ? left < bestLeft : left > bestLeft)) {
                    bestLeft = left;
                    chosen = index;
                }
            }
        }
        if (chosen < 0) continue;
        placed++;
        const hole = holes[chosen];
        const left = hole.size - need;
        hole.used = need;
        if (mode === "dynamic" && left > 0) {
            hole.size = need;
            holes.splice(chosen + 1, 0, { size: left, used: null });
        }
    }
    const free = holes.filter((h) => h.used === null).map((h) => h.size);
    const freeTotal = free.reduce((a, b) => a + b, 0);
    return {
        placed,
        scans,
        total: holes.reduce((a, h) => a + h.size, 0),
        used: holes.reduce((a, h) => a + (h.used || 0), 0),
        internal: holes.filter((h) => h.used !== null).reduce((a, h) => a + h.size - h.used, 0),
        external: freeTotal - (free.length ? Math.max(...free) : 0)
    };
}

// Small deterministic random generator so a failure can be reproduced.
function makeRandom(seed) {
    let state = seed;
    return () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
}

test("all three algorithms match the independent reference on random workloads", () => {
    const random = makeRandom(2026);
    const int = (low, high) => low + Math.floor(random() * (high - low + 1));
    const keys = ["first", "best", "worst"];

    for (let round = 0; round < 400; round++) {
        const blocks = Array.from({ length: int(1, 10) }, () => int(1, 10) * 50);
        const procs = Array.from({ length: int(1, 12) }, () => int(1, 12) * 25 + int(0, 1) * 7);
        const mode = random() < 0.5 ? "fixed" : "dynamic";
        const osReserved = random() < 0.3 ? int(1, 5) * 64 : 0;
        const results = Analyzer.simulateAll(blocks, procs, mode, osReserved);

        results.forEach((result, index) => {
            const expected = reference(blocks, procs, mode, keys[index]);
            const m = result.metrics;
            const label = `${result.name} ${mode} blocks=${blocks} procs=${procs}`;
            assert.equal(m.allocatedCount, expected.placed, label);
            assert.equal(m.totalScans, expected.scans, label);
            assert.equal(m.totalMemory, expected.total, label);
            assert.equal(m.usedMemory, expected.used, label);
            assert.equal(m.internalFragmentation, expected.internal, label);
            assert.equal(m.externalFragmentation, expected.external, label);

            // Memory is never created or lost, addresses are contiguous, ids are unique.
            let address = 0;
            for (const block of result.blocks) {
                assert.equal(block.start, address, label + " (address gap)");
                address += block.size;
            }
            assert.equal(address, expected.total + osReserved, label + " (size not conserved)");
            assert.equal(new Set(result.blocks.map((b) => b.id)).size, result.blocks.length, label + " (duplicate ids)");
        });
    }
});

// ---------------------------------------------------------------------------
// Exact fits
// ---------------------------------------------------------------------------

test("exact fits are counted by the hole that was used, not by the split block", () => {
    // Dynamic mode splits every hole to the process size, so comparing the
    // block with the process would call every allocation an exact fit.
    const classic = Analyzer.simulateAll([100, 500, 200, 300, 600], [212, 417, 112, 426], "dynamic", 0);
    for (const result of classic) {
        assert.equal(result.metrics.exactFitsCount, 0, result.name);
    }

    // Chapter 5 Exercise 2 (dynamic): only P4 fills a 120 KB hole completely.
    const ex2 = byName(Analyzer.simulateAll([50, 100, 200, 350], [45, 50, 80, 120, 200], "dynamic", 0));
    assert.equal(ex2["First Fit"].exactFitsCount, 1);
    assert.equal(ex2["Best Fit"].exactFitsCount, 1);
    assert.equal(ex2["First Fit"].unusableHolesCount, 1);

    // A process that really matches a partition is an exact fit in both modes.
    for (const mode of ["fixed", "dynamic"]) {
        const [first] = Analyzer.simulateAll([100, 300], [100], mode, 0);
        assert.equal(first.metrics.exactFitsCount, 1, mode);
    }
});

// ---------------------------------------------------------------------------
// Invalid input
// ---------------------------------------------------------------------------

test("processes with a zero, negative or non-numeric size are rejected", () => {
    for (const mode of ["fixed", "dynamic"]) {
        const [first] = Analyzer.simulateAll([100, 200], [0, -5, NaN, 50], mode, 0);
        assert.equal(first.metrics.allocatedCount, 1, mode);
        assert.deepEqual(plain(first.metrics.failedProcesses), ["P1", "P2", "P3"], mode);
        assert.match(first.steps[0].message, /invalid size/);
        // Memory must not grow because of a negative request.
        assert.equal(first.blocks.reduce((sum, b) => sum + b.size, 0), 300, mode);
    }
});

// ---------------------------------------------------------------------------
// Compaction
// ---------------------------------------------------------------------------

test("compaction keeps the OS first, keeps every process and merges all holes", () => {
    const [first] = Analyzer.simulateAll([100, 500, 200, 300, 600], [212, 417, 112], "dynamic", 64);
    const before = first.blocks.reduce((sum, b) => sum + b.size, 0);
    const { compactedBlocks, totalFreeMerged } = Models.performCompaction(first.blocks);

    assert.equal(compactedBlocks[0].isOS, true);
    assert.equal(compactedBlocks.reduce((sum, b) => sum + b.size, 0), before);
    assert.equal(compactedBlocks.filter((b) => b.isFree).length, 1);
    assert.equal(compactedBlocks[compactedBlocks.length - 1].isFree, true);
    assert.equal(compactedBlocks[compactedBlocks.length - 1].size, totalFreeMerged);
    assert.equal(compactedBlocks.filter((b) => b.process).length, 3);
    let address = 0;
    for (const block of compactedBlocks) {
        assert.equal(block.start, address);
        address += block.size;
    }
});

test("compaction lets the process that failed fit (compaction-demo preset)", () => {
    const blocks = [200, 150, 180, 120, 250];
    const procs = [130, 90, 110, 70, 160, 300];
    const [first] = Analyzer.simulateAll(blocks, procs, "dynamic", 0);
    assert.deepEqual(plain(first.metrics.failedProcesses), ["P6"]);

    const { compactedBlocks } = Models.performCompaction(first.blocks);
    const rerun = new Algorithms.FirstFit().runSimulation(compactedBlocks, Models.buildProcesses([300]), "dynamic");
    assert.equal(rerun.steps[0].status, "ALLOCATED");
});

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

test("rankAlgorithms reports algorithms with the same memory result", () => {
    // First Fit and Best Fit place everything with the same fragmentation and
    // differ only in scans, so First Fit wins on speed. Worst Fit wastes more
    // memory inside its partitions, so it is not equivalent.
    const results = Analyzer.simulateAll([100, 200, 300, 400, 500], [90, 190, 290, 95], "fixed", 0);
    const ranking = Analyzer.rankAlgorithms(results);
    assert.equal(ranking.best, "First Fit");
    assert.deepEqual(plain(ranking.ties), []);
    assert.deepEqual(plain(ranking.equivalent), ["Best Fit"]);
});

test("rankAlgorithms handles empty and unplaceable workloads without throwing", () => {
    assert.equal(Analyzer.rankAlgorithms([]), null);
    const empty = Analyzer.rankAlgorithms(Analyzer.simulateAll([], [], "fixed", 0));
    assert.equal(empty.bestMetrics.totalProcesses, 0);
    const none = Analyzer.rankAlgorithms(Analyzer.simulateAll([10], [500], "fixed", 0));
    assert.equal(none.bestMetrics.allocatedCount, 0);
});

// ---------------------------------------------------------------------------
// Numbers quoted in the Chapter 5 tab of index.html
// ---------------------------------------------------------------------------

test("Chapter 5 Exercise 1 numbers (fixed and dynamic)", () => {
    const blocks = [100, 500, 200, 300, 600];
    const procs = [212, 417, 112, 426];
    const fixed = byName(Analyzer.simulateAll(blocks, procs, "fixed", 0));
    assert.deepEqual([fixed["First Fit"].allocatedCount, fixed["Best Fit"].allocatedCount, fixed["Worst Fit"].allocatedCount], [3, 4, 3]);
    assert.deepEqual([fixed["First Fit"].internalFragmentation, fixed["Best Fit"].internalFragmentation, fixed["Worst Fit"].internalFragmentation], [559, 433, 659]);

    const dynamic = byName(Analyzer.simulateAll(blocks, procs, "dynamic", 0));
    assert.deepEqual([dynamic["First Fit"].externalFragmentation, dynamic["Best Fit"].externalFragmentation, dynamic["Worst Fit"].externalFragmentation], [659, 359, 659]);
    assert.equal(dynamic["First Fit"].internalFragmentation, 0);
});

test("Chapter 5 Exercise 2 numbers", () => {
    const blocks = [50, 100, 200, 350];
    const procs = [45, 50, 80, 120, 200];
    for (const mode of ["fixed", "dynamic"]) {
        const m = byName(Analyzer.simulateAll(blocks, procs, mode, 0));
        const counts = [m["First Fit"].allocatedCount, m["Best Fit"].allocatedCount, m["Worst Fit"].allocatedCount];
        assert.deepEqual(counts, mode === "fixed" ? [4, 4, 3] : [5, 5, 4], mode);
        if (mode === "fixed") {
            for (const name of Object.keys(m)) assert.equal(m[name].exactFitsCount, 0, name);
        }
    }
});

test("Chapter 5 Exercise 3 numbers: sorting does not change First or Best Fit, it helps Worst Fit", () => {
    const blocks = [300, 100, 350, 600, 200];
    const original = [115, 500, 210, 90, 430];
    const sorted = [...original].sort((a, b) => b - a);
    for (const mode of ["fixed", "dynamic"]) {
        const before = byName(Analyzer.simulateAll(blocks, original, mode, 0));
        const after = byName(Analyzer.simulateAll(blocks, sorted, mode, 0));
        assert.equal(before["First Fit"].allocatedCount, 4, mode);
        assert.equal(after["First Fit"].allocatedCount, 4, mode);
        assert.equal(before["Best Fit"].allocatedCount, 4, mode);
        assert.equal(after["Best Fit"].allocatedCount, 4, mode);
        assert.equal(before["Worst Fit"].allocatedCount, 3, mode);
        assert.equal(after["Worst Fit"].allocatedCount, 4, mode);
    }
});
