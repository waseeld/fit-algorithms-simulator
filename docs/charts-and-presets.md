# Charts and Benchmark Presets (Team 3 - Student 1: Ahmed Algarrah)

This page documents `public/js/charts.js` and `public/js/presets.js`. Its content is meant to be merged into the main README after the integration.

## Charts module interface

`public/js/charts.js` exposes `window.SimulationCharts`. It draws on `<canvas>` elements with no external library and follows the page text colour, so it works on light and dark themes.

| Method | Purpose |
| --- | --- |
| `renderUtilizationChart(canvasId, results)` | Bar chart of memory utilization (%) for each algorithm; the best value is marked |
| `renderFragmentationChart(canvasId, results)` | Grouped bars of internal and external fragmentation (KB) |
| `renderComparison(utilId, fragId, results)` | Draws both charts |
| `prepareResults(results)` | Cleans the results (used by the charts and tests) |

`results` is the output of `MemoryAnalyzer.simulateAll()`: an array of metrics objects (or an object keyed by algorithm name). Fields used: `algorithmName`, `memoryUtilization`, `usedMemory`, `totalMemory`, `internalFragmentation`, `externalFragmentation`. Utilization may be a percentage or a fraction. If there are no results, the canvas shows "No results yet". Render functions never throw; they return `{ ok: false, reason }` on problems.

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

## Tests

Run `npm test` (or `node --test tests/`). Files: `tests/charts.test.js`, `tests/presets.test.js`, `tests/integration.test.js`, `tests/engine.test.js`.

Canvas size: a chart canvas that is inside a hidden tab has no size yet, so `charts.js` waits and decides on the first render after the canvas becomes visible. A canvas sized by CSS is redrawn at its current width every time a render function is called (the app does this on tab change and on window resize); a canvas sized by its `width`/`height` attributes keeps that size.
