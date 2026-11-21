# Memory Allocation Simulator

An educational simulator for the Operating Systems course (CCS 3361) at the Islamic University of Madinah.

## Purpose

The project aims to explain contiguous memory allocation and compare three strategies:

- **First Fit:** use the first available block that fits a process.
- **Best Fit:** use the smallest available block that fits a process.
- **Worst Fit:** use the largest available block that fits a process.

The application visualizes every allocation decision step by step, supports fixed and dynamic (hole-splitting) memory configurations, shows internal and external fragmentation, offers memory compaction, and compares the three algorithms with tables and charts.

## Technology

- HTML and CSS for the interface
- JavaScript for simulation logic and browser audio
- Node.js for a local HTTP server
- Node.js built-in test runner for automated tests
- Git and GitHub for collaboration

No third-party npm dependencies are required by the current local server or tests.

## Current implementation status

| Component | File | Status |
| --- | --- | --- |
| Local static HTTP server | `server.js` | Implemented and automatically tested |
| Read-only server information API | `GET /api/info` | Implemented and automatically tested |
| Sound effects and mute control | `public/js/audio.js` | Implemented and automatically tested |
| Project setup and instructions | `README.md` | Documented |
| Memory models, algorithms and metrics | `memory.js`, `algorithms.js`, `analyzer.js` | Team 1 — integrated, automatically tested against an independent reference |
| Application controller and visualization | `app.js`, `visualizer.js`, HTML/CSS | Team 2 — integrated |
| Comparison charts | `public/js/charts.js` | Implemented and automatically tested |
| Benchmark presets (example workloads) | `public/js/presets.js` | Implemented and automatically tested against a reference simulator |

The automated suite does not open a browser, so check the interface in a real browser after any change to `app.js`, `index.html` or the CSS.

## How to run locally

### Prerequisites

1. Install a supported Node.js version with npm (Node.js 26.13.0 was used for the latest verification).
2. Open the project repository folder in VS Code.
3. Open **Terminal > New Terminal**, making sure the current directory contains `package.json`.

### Commands

```powershell
npm start
```

Open **http://127.0.0.1:3000/** in your browser. To stop the server, press **Ctrl+C** in that terminal.

The server listens on **127.0.0.1** (your own computer only); it does not automatically publish the website on the internet.

### Optional port setting

The default port is 3000. On Windows PowerShell you can choose another port before starting:

```powershell
$env:PORT = "3100"
npm start
```

Then open **http://127.0.0.1:3100/**. Valid configured ports are integers from 1 through 65535. To clear the setting in that terminal afterward:

```powershell
Remove-Item Env:PORT
```

## Local server API

`GET /api/info` returns JSON with non-sensitive server information:

```json
{
  "name": "Memory Allocation Simulator",
  "version": "0.0.1",
  "status": "ok",
  "scope": "local-server",
  "plannedAlgorithms": ["First Fit", "Best Fit", "Worst Fit"]
}
```

`status: "ok"` means that **the HTTP server** is responding. It does not mean the allocation algorithms are implemented or tested. The version is read from `package.json`. The route also supports HEAD requests without a response body.

The local server supports GET and HEAD for static files under `public/`. It returns 400 for malformed URL encoding or a NUL byte in the path, 403 for paths attempting to escape `public/`, 404 for missing files, and 405 for unsupported methods. An unexpected error while handling one request returns 500 and never stops the server. It also checks resolved paths to prevent serving symlinks pointing outside `public/`.

## Using the simulator

| Tab | What it does |
| --- | --- |
| 1 Setup & Workload | Load one of nine presets or build a workload (partitions 10–100,000 KB, processes 5–100,000 KB, at most 30 of each, whole numbers only). Choose **Fixed Partitions** or **Dynamic (Hole Splitting)** and an optional OS area. |
| 2 Live Simulation | Run or step through one algorithm. **⚡ Compact** (or the **C** key, dynamic mode only) moves all processes to the start of memory and merges every free hole; the failed or pending processes are then retried on the compacted memory with **Next Step**. |
| 3 Results & Analysis | KPI cards, final memory map, per-process table and the formula substitution for the selected algorithm. Compaction is a simulation-tab action and is not part of these results. |
| 4 Algorithm Comparison | Ranking banner, comparison table and two charts. Export the table as CSV or JSON, or print the tab to PDF. |
| 5 Chapter 5 Reference | Theory summary and the three Slide 9 exercises, with numbers that match the simulator (checked by `tests/engine.test.js`). |

Keyboard shortcuts: **Space** run/pause, **←** / **→** step, **C** compact, **R** reset (simulation tab only), **1**–**5** switch tabs. Browser shortcuts such as Ctrl+C and Ctrl+R are never intercepted.

How the metrics are defined (these are the project's rules, shown in the proof box of the Results tab):

- **Memory utilization** = allocated process KB ÷ total user memory × 100. The OS area is not counted.
- **Internal fragmentation** = Σ (partition size − process size) over allocated partitions. It is always 0 in dynamic mode, where every hole is split to the exact process size.
- **External fragmentation** = total free memory − largest free hole.
- **Exact fit** = a process that fills the hole it was given with nothing left over. **Unusable small hole** = a free hole smaller than 50 KB.
- **Ranking** (best first): more processes allocated, higher utilization, lower internal fragmentation, lower external fragmentation, fewer hole scans.

The page loads the Inter and JetBrains Mono fonts from Google Fonts. Without internet the browser uses its default fonts and everything else works.

## Audio module interface

`public/js/audio.js` exposes one browser-side `window.soundFX` object:

| Method | Purpose |
| --- | --- |
| `playClick()` | Button interaction |
| `playAllocate()` | Successful allocation |
| `playFail()` | Failed allocation |
| `playCompact()` | Memory compaction |
| `toggle()` | Mute/unmute; returns the new enabled state |

The module uses the browser's Web Audio API to generate short tones without external audio files. It creates an AudioContext lazily, normally after a user interaction. The interface team will need to load `/js/audio.js` and call these methods from the relevant UI events when the application controller is ready.

## Charts module interface

`public/js/charts.js` exposes `window.SimulationCharts`. It draws on `<canvas>` elements with no external library and follows the page text colour, so it works on light and dark themes.

| Method | Purpose |
| --- | --- |
| `renderUtilizationChart(canvasId, results)` | Bar chart of memory utilization (%) for each algorithm; the best value is marked |
| `renderFragmentationChart(canvasId, results)` | Grouped bars of internal and external fragmentation (KB) |
| `renderComparison(utilId, fragId, results)` | Draws both charts |
| `prepareResults(results)` | Cleans the results (used by the charts and tests) |

`results` is the output of `MemoryAnalyzer.simulateAll()`: an array of metrics objects (or an object keyed by algorithm name). Each item may be flat or `{ name, metrics: {...} }` (the analyzer shape). Fields used: `algorithmName` (or `name`), `memoryUtilization`, `usedMemory`, `totalMemory`, `internalFragmentation`, `externalFragmentation`. Utilization may be a percentage or a fraction. If there are no results, the canvas shows "No results yet". Render functions never throw; they return `{ ok: false, reason }` on problems.

Example for the interface team:

```html
<canvas id="utilChart" width="520" height="300"></canvas>
<canvas id="fragChart" width="520" height="300"></canvas>
<script src="js/presets.js"></script>
<script src="js/charts.js"></script>
```

```js
SimulationCharts.renderComparison("utilChart", "fragChart", results);
```

## Benchmark presets interface

`public/js/presets.js` exposes `window.Presets` with nine example workloads. Each preset has `id`, `name`, `description`, `mode` (`"fixed"` or `"dynamic"`), `osReserved`, `blocks`, `processes` (sizes in KB) and `expected` (how many processes each algorithm should place).

| Preset id | What it shows |
| --- | --- |
| `classic-textbook` | Textbook example; only Best Fit places all 4 processes |
| `first-fit-advantage` | First Fit wins |
| `best-fit-advantage` | Best Fit wins (fixed partitions) |
| `worst-fit-advantage` | Worst Fit wins |
| `internal-fragmentation` | Large internal fragmentation (fixed) |
| `compaction-demo` | External fragmentation; compaction lets the last process fit |
| `stress-dynamic` | 10 blocks, 12 processes (dynamic) |
| `stress-fixed-os` | Same workload, fixed, with 128 KB for the OS |
| `everything-fits` | Quick sanity check |

| Method | Purpose |
| --- | --- |
| `getAll()`, `getIds()`, `getById(id)` | Read presets (copies, safe to edit) |
| `toSimulationInput(preset)` | Gives `{ blockSizes, processSizes, mode, osReserved }` for `MemoryAnalyzer.simulateAll` |
| `validate(preset)` | Lists problems with a preset |
| `benchmark(simulateAll)` | Runs every preset through a simulate function |

Assumption to confirm with Team 1: the mode names are `"fixed"` and `"dynamic"`.

## Automated testing

Run the complete local module test suite:

```powershell
npm test
```

The tests use only Node.js built-in modules and do not modify application files or contact GitHub. Test files:

- `tests/audio.test.js` checks method availability, lazy AudioContext setup, all four tones, muting/unmuting, suspended audio recovery and browsers without Web Audio.
- `tests/charts.test.js` checks result parsing (array, object, fraction or percent), bar labels, the "Best" marker, empty data, missing canvas and repeated rendering.
- `tests/presets.test.js` checks every preset against an independent reference simulator, that results do not depend on tie-breaking, and the helper functions.
- `tests/integration.test.js` checks that all scripts are valid JavaScript, that the server serves them, and that `simulateAll` results for every preset match the expected counts and can be charted.
- `tests/engine.test.js` compares First, Best and Worst Fit with an independent reference on 400 random workloads in both modes (counts, scans, fragmentation, address and size conservation), and checks exact-fit counting, rejection of invalid sizes, compaction, the ranking helpers and the numbers quoted in the Chapter 5 tab.
- `tests/visualizer.test.js` checks the memory map tiles, highlights, ruler, tooltips and the empty state.
- `tests/server.test.js` starts a temporary HTTP server on a random local port and checks HTML, JavaScript, JSON API metadata, HEAD responses, invalid methods, missing files, invalid URLs (including a NUL byte), directory traversal and invalid configured ports.

**Verified on November 21, 2026:** 75 tests passed, 0 failed, 0 skipped, with Node.js 22 on Linux. The charts, keyboard, compaction, input-validation, export and printing behaviour was also checked in headless Chromium.

Earlier manual browser tests also confirmed that the four sounds played and the mute toggle worked. Automated audio tests use browser API mocks, so they do not replace listening in a real browser.

## Integration checklist (pending other teams)

- [x] Team 1 integrated the three allocation algorithms, memory models and metrics.
- [x] Team 2 built the HTML/CSS UI, simulation controls and visualization.
- [x] Team 2 loads `audio.js` and plays the sounds from real UI events.
- [x] Team 3 Student 1 delivered `charts.js` and `presets.js` (unit-tested).
- [x] `npm test` passes after integration.
- [ ] Complete a manual end-to-end pass in a real browser (successful and failed allocation, compaction, chart comparison, step controls, exports) before the final demonstration.
- [ ] Record screenshots/results for the final report and presentation.

## Project files

```text
public/
  css/
    animations.css
    style.css
  js/
    algorithms.js
    analyzer.js
    app.js
    audio.js
    charts.js
    memory.js
    presets.js
    visualizer.js
  index.html
tests/
  audio.test.js
  charts.test.js
  engine.test.js
  integration.test.js
  presets.test.js
  server.test.js
  visualizer.test.js
server.js
package.json
README.md
```

## Team responsibilities

- **Team 1 — Simulation engine and analysis:** Khubaib Basri and Azzam Al-Khattabi. Memory models, algorithms, compaction and metrics.
- **Team 2 — Interface and interaction:** Wasel and Ahmed. UI controller, workflow, visualization and animation.
- **Team 3 — Comparison, support and integration:** Ahmed and Haitham. Charts, presets, audio, HTTP server, documentation and integration checks.

**Ahmed (Team 3, Student 1):** Comparison charts (`charts.js`), benchmark presets (`presets.js`), their tests, integration tests and documentation of these modules.

**Haitham (Team 3, Student 2):** Audio module, local Node.js server, project documentation and verification of these components. Full simulator integration requires the other teams' completed modules.

## Git collaboration

Work on a personal branch and open a pull request for the project lead to review. Do not directly overwrite the shared `master` branch. Testing and writing code locally does not publish it to GitHub.
