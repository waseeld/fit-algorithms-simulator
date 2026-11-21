"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

// Minimal fake DOM, enough for the visualizer (no browser needed).
function makeEl() {
    const el = {
        className: "", style: {}, dataset: {}, children: [], textContent: "",
        listeners: {},
        _html: "",
        // Setting innerHTML clears the children, like a real browser.
        get innerHTML() { return el._html; },
        set innerHTML(value) { el._html = value; el.children = []; },
        classList: { add(c) { el.className += " " + c; } },
        setAttribute(name, value) { el.attrs = el.attrs || {}; el.attrs[name] = value; },
        appendChild(child) { el.children.push(child); return child; },
        addEventListener(type, fn) { el.listeners[type] = fn; }
    };
    return el;
}
const byId = {};
global.document = {
    getElementById: (id) => byId[id] || null,
    createElement: makeEl,
    body: makeEl()
};
byId.map = makeEl();
byId.ruler = makeEl();

const MemoryVisualizer = require("../public/js/visualizer.js");

const free = { id: 1, label: "B1", size: 100, start: 0, end: 100, process: null, isOS: false };
const used = {
    id: 2, label: "B2", size: 500, start: 100, end: 600, isOS: false,
    process: { name: "P1", size: 212 }, internalFragmentation: 288
};
const os = { id: 0, label: "OS", size: 128, start: 0, end: 128, process: null, isOS: true };

test("renders one tile per block and returns ok", () => {
    const viz = new MemoryVisualizer("map", "ruler");
    const result = viz.render([free, used]);
    assert.deepEqual(result, { ok: true, empty: false, blocks: 2 });
    assert.equal(byId.map.children[0].children.length, 2);
});

test("free, allocated and OS tiles get the right classes", () => {
    const viz = new MemoryVisualizer("map");
    viz.render([free, used, os]);
    const tiles = byId.map.children[0].children;
    assert.match(tiles[0].className, /block-free/);
    assert.match(tiles[1].className, /block-allocated/);
    assert.match(tiles[2].className, /block-os/);
    assert.match(tiles[1].innerHTML, /frag-fill-bar/);
    assert.match(tiles[1].innerHTML, /288k/);
});

test("chosen block and scanned candidates are highlighted", () => {
    const viz = new MemoryVisualizer("map");
    viz.render([free, used], 2, [
        { blockId: 1, fits: false, chosen: false },
        { blockId: 2, fits: true, chosen: true }
    ]);
    const tiles = byId.map.children[0].children;
    assert.match(tiles[0].className, /block-scanned-fail/);
    assert.match(tiles[1].className, /block-chosen-glow/);
});

test("compaction adds the animation class", () => {
    new MemoryVisualizer("map").render([free], null, [], true);
    assert.match(byId.map.children[0].className, /compacting-anim/);
});

test("empty or invalid input shows the empty state and never throws", () => {
    const viz = new MemoryVisualizer("map");
    assert.equal(viz.render([]).empty, true);
    assert.equal(viz.render(null).ok, true);
    assert.equal(viz.render([null, 5]).empty, true);
    assert.match(byId.map.innerHTML, /Add memory blocks/);
});

test("a missing container returns ok:false instead of throwing", () => {
    assert.equal(new MemoryVisualizer("nope").render([free]).ok, false);
});

test("process names are escaped in tooltips", () => {
    const viz = new MemoryVisualizer("map");
    const html = viz.tooltipHtml({
        id: 3, label: "B3", size: 100, start: 0, end: 100,
        process: { name: "<img onerror=x>", size: 50 }
    });
    assert.ok(!html.includes("<img"));
    assert.match(html, /&lt;img/);
});

test("ruler shows start addresses and the total at the end", () => {
    new MemoryVisualizer("map", "ruler").render([free, used]);
    const ticks = byId.ruler.children[0].children;
    assert.equal(ticks.length, 3);
    assert.match(ticks[1].innerHTML, /100k/);
    assert.match(ticks[2].innerHTML, /600k/);
});

test("tiles and the map have accessible labels", () => {
    new MemoryVisualizer("map").render([free, used]);
    const row = byId.map.children[0];
    assert.match(row.attrs["aria-label"], /2 blocks, 600 KB total/);
    assert.match(row.children[1].attrs["aria-label"], /Process: P1 \(212 KB\)/);
});

test("rendering again hides a tooltip that was left open", () => {
    const viz = new MemoryVisualizer("map");
    viz.tooltip = { style: { opacity: "1" }, innerHTML: "" };
    viz.render([free, used]);
    assert.equal(viz.tooltip.style.opacity, "0");
});
