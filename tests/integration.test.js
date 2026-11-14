"use strict";

// End-to-end integration checks for the whole simulator.
//
// Some checks need files written by other team members (server.js from
// Team 3 Student 2, algorithms.js / analyzer.js from Team 1). A check that
// needs a file that is not finished yet is reported as SKIPPED, not as a
// pass. Once every file is merged, run `npm test` again and make sure
// nothing is skipped.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const JS_FILES = ["memory", "algorithms", "analyzer", "audio", "charts", "presets",
    "visualizer", "app"];

function readSource(name) {
    return fs.readFileSync(path.join(ROOT, "public", "js", name + ".js"), "utf8");
}

function isPlaceholder(source) {
    return source.trim().startsWith("// Work has just started");
}

function get(port, urlPath) {
    return new Promise((resolve, reject) => {
        http.get({ host: "127.0.0.1", port, path: urlPath }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
        }).on("error", reject);
    });
}

// Loads the browser scripts into a sandbox that has a fake `window`.
function loadBrowserScripts(names) {
    const sandbox = { console };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    for (const name of names) {
        vm.runInContext(readSource(name), sandbox, { filename: name + ".js" });
    }
    return sandbox;
}

function fakeCanvas() {
    const ctx = new Proxy({}, {
        get: (target, key) => key === "measureText" ? () => ({ width: 50 }) : () => {},
        set: () => true
    });
    return { width: 600, height: 320, style: {}, dataset: {}, getContext: () => ctx };
}

test("every JavaScript file in public/js is valid JavaScript", () => {
    for (const name of JS_FILES) {
        assert.doesNotThrow(() => new vm.Script(readSource(name), { filename: name + ".js" }), name);
    }
});

test("the local server serves my files and /api/info", async (t) => {
    let serverModule;
    try {
        serverModule = require("../server.js");
    } catch (error) {
        serverModule = null;
    }
    if (!serverModule || typeof serverModule.createServer !== "function") {
        t.skip("server.js is not merged yet");
        return;
    }

    const server = serverModule.createServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    try {
        for (const file of ["charts.js", "presets.js", "audio.js", "memory.js"]) {
            const response = await get(port, "/js/" + file);
            assert.equal(response.status, 200, file);
        }
        const info = await get(port, "/api/info");
        assert.equal(info.status, 200);
        assert.equal(JSON.parse(info.body).status, "ok");
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});

test("charts.js and presets.js load together without errors", () => {
    const sandbox = loadBrowserScripts(["presets", "charts"]);
    assert.equal(typeof sandbox.Presets.getAll, "function");
    assert.equal(typeof sandbox.SimulationCharts.renderComparison, "function");
});

test("Team 1 simulation results work with presets and charts", (t) => {
    const needed = ["memory", "algorithms", "analyzer"];
    if (needed.some((name) => isPlaceholder(readSource(name)))) {
        t.skip("Team 1 files (memory, algorithms, analyzer) are not merged yet");
        return;
    }

    const sandbox = loadBrowserScripts([...needed, "presets", "charts"]);
    const analyzer = sandbox.MemoryAnalyzer;
    assert.ok(analyzer && typeof analyzer.simulateAll === "function",
        "window.MemoryAnalyzer.simulateAll is missing");

    for (const preset of sandbox.Presets.getAll()) {
        const input = sandbox.Presets.toSimulationInput(preset);
        const results = analyzer.simulateAll(
            input.blockSizes, input.processSizes, input.mode, input.osReserved);
        const rows = sandbox.SimulationCharts.prepareResults(results);
        assert.equal(rows.length, 3, preset.id + ": three algorithms expected");

        const list = Array.isArray(results) ? results : Object.values(results.results || results);
        for (const item of list) {
            const name = item.algorithmName || item.name;
            assert.equal((item.metrics || item).allocatedCount, preset.expected[name], `${preset.id} / ${name}`);
        }

        const drawn = sandbox.SimulationCharts.renderComparison(fakeCanvas(), fakeCanvas(), results);
        assert.equal(drawn.utilization.ok, true, preset.id);
        assert.equal(drawn.fragmentation.ok, true, preset.id);
    }
});
