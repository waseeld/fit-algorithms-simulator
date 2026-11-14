# Memory Allocation Simulator

An educational simulator for the Operating Systems course (CCS 3361) at the Islamic University of Madinah.

## Purpose

The project aims to explain contiguous memory allocation and compare three strategies:

- **First Fit:** use the first available block that fits a process.
- **Best Fit:** use the smallest available block that fits a process.
- **Worst Fit:** use the largest available block that fits a process.

The complete application is planned to visualize allocation decisions, support fixed and dynamic memory configurations, describe internal and external fragmentation, and compare algorithm metrics. **These simulator features are still being developed by the assigned teams.**

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
| Memory models, algorithms and metrics | `memory.js`, `algorithms.js`, `analyzer.js` | Team 1 — awaiting integration |
| Application controller and visualization | `app.js`, `visualizer.js`, HTML/CSS | Team 2 — awaiting integration |
| Comparison charts | `public/js/charts.js` | Implemented and automatically tested (needs Team 1 results and Team 2 canvases) |
| Benchmark presets (example workloads) | `public/js/presets.js` | Implemented and automatically tested against a reference simulator |

A page that looks empty is expected while `public/index.html` contains only a placeholder. A successful HTTP response does **not** mean that the full graphical simulator is ready.

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

The local server supports GET and HEAD for static files under `public/`. It returns 400 for malformed URL encoding, 403 for paths attempting to escape `public/`, 404 for missing files, and 405 for unsupported methods. It also checks resolved paths to prevent serving symlinks pointing outside `public/`.

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
- `tests/integration.test.js` checks that all scripts are valid JavaScript, that the server serves them, and (once Team 1 merges) that `simulateAll` results for every preset match the expected counts and can be charted. Checks that need unfinished files are reported as skipped, not passed.
- `tests/server.test.js` starts a temporary HTTP server on a random local port and checks HTML, JavaScript, JSON API metadata, HEAD responses, invalid methods, missing files, invalid URLs, directory traversal and invalid configured ports.

**Verified on November 13, 2026 (charts, presets and integration checks, together with the server and audio tests):** all checks passed except the integration checks that wait for Team 1 files, which are skipped.

**Verified on November 12, 2026 (server and audio):** 18 checks passed, 0 failed, 0 skipped, with Node.js 26.13.0 and npm 11.20.0 on Windows.

Earlier manual browser tests also confirmed that the four sounds played and the mute toggle worked. Automated audio tests use browser API mocks, so they do not replace listening in a real browser after the final UI is integrated.

## Integration checklist (pending other teams)

- [ ] Team 1 integrates the three allocation algorithms, memory models and metrics.
- [ ] Team 2 builds the actual HTML/CSS UI, simulation controls and visualization.
- [ ] Team 2 loads `audio.js` and calls sound methods in response to actual UI events.
- [x] Team 3 Student 1 delivered `charts.js` and `presets.js` (unit-tested). Final integration is pending Team 1 and Team 2.
- [ ] Re-run `npm test` after integration.
- [ ] Complete manual end-to-end scenarios, including successful/failed allocation, compaction, chart comparisons and step-by-step controls.
- [ ] Record screenshots/results for the final report and presentation.

Do not claim these integration checks have passed until the dependent modules are actually implemented and tested.

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
  integration.test.js
  presets.test.js
  server.test.js
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
