"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Charts = require("../public/js/charts.js");

// A fake <canvas> that records what was drawn.
function createCanvas(width = 600, height = 320) {
    const calls = { fillText: [], fillRect: [], clear: 0 };
    const ctx = {
        setTransform() {},
        clearRect() { calls.clear++; },
        fillRect(x, y, w, h) { calls.fillRect.push({ x, y, w, h, fill: ctx.fillStyle }); },
        fillText(text) { calls.fillText.push(String(text)); },
        measureText(text) { return { width: String(text).length * 6 }; },
        beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
        save() {}, restore() {}, translate() {}, rotate() {}
    };
    const canvas = {
        width,
        height,
        style: {},
        dataset: {},
        getContext: () => ctx
    };
    return { canvas, calls };
}

function sample() {
    return [
        { algorithmName: "First Fit", memoryUtilization: 43.6,
          internalFragmentation: 559, externalFragmentation: 100 },
        { algorithmName: "Best Fit", memoryUtilization: 68.6,
          internalFragmentation: 433, externalFragmentation: 0 },
        { algorithmName: "Worst Fit", memoryUtilization: 43.6,
          internalFragmentation: 659, externalFragmentation: 100 }
    ];
}

test("prepareResults accepts an array and orders First, Best, Worst Fit", () => {
    const rows = Charts.prepareResults([sample()[2], sample()[0], sample()[1]]);
    assert.deepEqual(rows.map((r) => r.name), ["First Fit", "Best Fit", "Worst Fit"]);
});

test("prepareResults accepts an object keyed by algorithm name", () => {
    const rows = Charts.prepareResults({
        "Worst Fit": { memoryUtilization: 10 },
        "First Fit": { memoryUtilization: 20 }
    });
    assert.deepEqual(rows.map((r) => r.name), ["First Fit", "Worst Fit"]);
});

test("prepareResults accepts an object with a results array", () => {
    assert.equal(Charts.prepareResults({ results: sample() }).length, 3);
});

test("a utilization fraction is converted to a percentage", () => {
    const [row] = Charts.prepareResults([{ algorithmName: "Best Fit", memoryUtilization: 0.686 }]);
    assert.ok(Math.abs(row.utilization - 68.6) < 1e-9);
});

test("utilization is derived from used and total memory when missing", () => {
    const [row] = Charts.prepareResults([{ algorithmName: "Best Fit", usedMemory: 50, totalMemory: 200 }]);
    assert.equal(row.utilization, 25);
});

test("bad or missing numbers become 0 and values stay in range", () => {
    const rows = Charts.prepareResults([
        { algorithmName: "First Fit", memoryUtilization: "abc", internalFragmentation: -5 },
        { algorithmName: "Best Fit", memoryUtilization: 250 }
    ]);
    assert.equal(rows[0].utilization, 0);
    assert.equal(rows[0].internal, 0);
    assert.equal(rows[1].utilization, 100);
});

test("prepareResults ignores junk input", () => {
    assert.deepEqual(Charts.prepareResults(null), []);
    assert.deepEqual(Charts.prepareResults(undefined), []);
    assert.deepEqual(Charts.prepareResults(42), []);
    assert.deepEqual(Charts.prepareResults([null, "x", 3]), []);
});

test("utilization chart draws one bar per algorithm with percent labels", () => {
    const { canvas, calls } = createCanvas();
    const out = Charts.renderUtilizationChart(canvas, sample());
    assert.equal(out.ok, true);
    assert.equal(out.bars.length, 3);
    assert.ok(calls.fillText.includes("Memory Utilization by Algorithm"));
    assert.ok(calls.fillText.includes("68.6%"));
    assert.ok(calls.fillText.includes("43.6%"));
});

test("the best utilization is marked, ties are both marked", () => {
    const { canvas, calls } = createCanvas();
    Charts.renderUtilizationChart(canvas, sample());
    assert.equal(calls.fillText.filter((t) => t === "Best").length, 1);

    const tied = createCanvas();
    Charts.renderUtilizationChart(tied.canvas, [
        { algorithmName: "First Fit", memoryUtilization: 50 },
        { algorithmName: "Best Fit", memoryUtilization: 50 }
    ]);
    assert.equal(tied.calls.fillText.filter((t) => t === "Best").length, 2);
});

test("a chart where every value is 0 does not mark anything as best", () => {
    const { canvas, calls } = createCanvas();
    Charts.renderUtilizationChart(canvas, [
        { algorithmName: "First Fit", memoryUtilization: 0 },
        { algorithmName: "Best Fit", memoryUtilization: 0 }
    ]);
    assert.equal(calls.fillText.filter((t) => t === "Best").length, 0);
});

test("fragmentation chart draws internal and external bars", () => {
    const { canvas, calls } = createCanvas();
    const out = Charts.renderFragmentationChart(canvas, sample());
    assert.equal(out.ok, true);
    assert.equal(out.bars.length, 6);
    assert.ok(calls.fillText.includes("Fragmentation by Algorithm"));
    assert.ok(calls.fillText.includes("Internal fragmentation"));
    assert.ok(calls.fillText.includes("External fragmentation"));
    assert.ok(calls.fillText.includes("659"));
});

test("bar heights follow the values", () => {
    const { canvas } = createCanvas();
    const out = Charts.renderFragmentationChart(canvas, sample());
    const byLabel = (group, label) => out.bars.find((b) => b.group === group && b.label === label);
    assert.ok(byLabel("Worst Fit", "Internal").value > byLabel("Best Fit", "Internal").value);
    assert.equal(byLabel("Best Fit", "External").value, 0);
});

test("empty results draw a friendly message instead of failing", () => {
    for (const render of [Charts.renderUtilizationChart, Charts.renderFragmentationChart]) {
        const { canvas, calls } = createCanvas();
        const out = render(canvas, []);
        assert.equal(out.ok, false);
        assert.equal(out.reason, "no-data");
        assert.ok(calls.fillText.some((t) => t.startsWith("No results yet")));
    }
});

test("a missing canvas returns an error object instead of throwing", () => {
    const out = Charts.renderUtilizationChart("no-such-canvas", sample());
    assert.equal(out.ok, false);
    assert.equal(out.reason, "canvas-not-found");
});

test("rendering twice does not grow the canvas", () => {
    const { canvas } = createCanvas(600, 320);
    Charts.renderUtilizationChart(canvas, sample());
    const firstWidth = canvas.width;
    Charts.renderUtilizationChart(canvas, sample());
    assert.equal(canvas.width, firstWidth);
});

test("renderComparison draws both charts", () => {
    const a = createCanvas();
    const b = createCanvas();
    const out = Charts.renderComparison(a.canvas, b.canvas, sample());
    assert.equal(out.utilization.ok, true);
    assert.equal(out.fragmentation.ok, true);
});

test("a canvas without a drawing context is handled", () => {
    const canvas = { width: 100, height: 100, style: {}, dataset: {}, getContext: () => null };
    const out = Charts.renderUtilizationChart(canvas, sample());
    assert.equal(out.ok, false);
});

test("prepareResults reads numbers nested under metrics (analyzer shape)", () => {
    const rows = Charts.prepareResults([
        { name: "Best Fit", metrics: { memoryUtilization: 68.6, internalFragmentation: 0, externalFragmentation: 10 } }
    ]);
    assert.equal(rows[0].name, "Best Fit");
    assert.equal(Math.round(rows[0].utilization * 10) / 10, 68.6);
    assert.equal(rows[0].external, 10);
});
