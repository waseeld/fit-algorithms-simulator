/*
 * Memory Allocation Simulator
 * Comparison charts
 * Team 3 - Student 1: Ahmed Algarrah (ID 451029933)
 *
 * Draws two bar charts on <canvas> elements, with no external libraries:
 *   1. Memory utilization (%) for First Fit, Best Fit and Worst Fit
 *   2. Internal and external fragmentation (KB) for each algorithm
 *
 * Public API (window.SimulationCharts):
 *   renderUtilizationChart(canvasId, results)
 *   renderFragmentationChart(canvasId, results)
 *   renderComparison(utilizationCanvasId, fragmentationCanvasId, results)
 *   prepareResults(results)   -> cleaned rows used by the charts
 *
 * `canvasId` is the id of a <canvas> element (or the element itself).
 *
 * `results` is what MemoryAnalyzer.simulateAll() produces. These shapes are
 * accepted:
 *   - an array of SimulationMetrics objects
 *   - an object keyed by algorithm name: { "First Fit": {...}, ... }
 *   - an object with a `results` array inside
 * Fields read from each SimulationMetrics object:
 *   algorithmName (or name), memoryUtilization, usedMemory, totalMemory,
 *   internalFragmentation, externalFragmentation
 * memoryUtilization may be a percentage (72.8) or a fraction (0.728).
 *
 * Every render function returns an object describing what was drawn, or
 * { ok: false, reason } when nothing could be drawn. They never throw.
 */

"use strict";

(function (root) {
    const COLORS = Object.freeze({
        "First Fit": "#0f766e",
        "Best Fit": "#4f46e5",
        "Worst Fit": "#d97706",
        fallback: "#64748b",
        internal: "#2563eb",
        external: "#ea580c"
    });

    const ALGORITHM_ORDER = ["First Fit", "Best Fit", "Worst Fit"];

    // ---------------------------------------------------------------
    // Data preparation
    // ---------------------------------------------------------------

    function toNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    }

    function toList(results) {
        if (Array.isArray(results)) {
            return results.map((item) => [item && (item.algorithmName || item.name), item]);
        }
        if (results && typeof results === "object") {
            if (Array.isArray(results.results)) {
                return toList(results.results);
            }
            return Object.keys(results).map((key) => {
                const item = results[key];
                return [(item && (item.algorithmName || item.name)) || key, item];
            });
        }
        return [];
    }

    // Team 1's analyzer returns { name, metrics: {...} }; older callers pass
    // the numbers at the top level. Accept both.
    function flatten(item) {
        if (item && typeof item === "object" && item.metrics && typeof item.metrics === "object") {
            return Object.assign({}, item, item.metrics);
        }
        return item;
    }

    function utilizationPercent(item) {
        const derivedFromSizes = toNumber(item.totalMemory) > 0
            ? (toNumber(item.usedMemory) / toNumber(item.totalMemory)) * 100
            : null;
        const given = Number(item.memoryUtilization);

        if (!Number.isFinite(given)) {
            return derivedFromSizes === null ? 0 : derivedFromSizes;
        }
        // A value of 1 or less may be a fraction (0.728) rather than a percent.
        if (given <= 1) {
            if (derivedFromSizes === null) {
                return given * 100;
            }
            const fractionError = Math.abs(derivedFromSizes - given * 100);
            const percentError = Math.abs(derivedFromSizes - given);
            return fractionError < percentError ? given * 100 : given;
        }
        return given;
    }

    // Cleans the results and orders them First, Best, Worst Fit.
    function prepareResults(results) {
        const rows = toList(results)
            .map(([name, item]) => [name, flatten(item)])
            .filter(([, item]) => item && typeof item === "object")
            .map(([name, item]) => ({
                name: String(name || "Unknown"),
                utilization: Math.min(100, Math.max(0, utilizationPercent(item))),
                internal: Math.max(0, toNumber(item.internalFragmentation)),
                external: Math.max(0, toNumber(item.externalFragmentation))
            }));

        const rank = (name) => {
            const index = ALGORITHM_ORDER.indexOf(name);
            return index === -1 ? ALGORITHM_ORDER.length : index;
        };
        return rows
            .map((row, index) => ({ row, index }))
            .sort((a, b) => rank(a.row.name) - rank(b.row.name) || a.index - b.index)
            .map(({ row }) => row);
    }

    // ---------------------------------------------------------------
    // Canvas helpers
    // ---------------------------------------------------------------

    function findCanvas(canvasOrId) {
        if (canvasOrId && typeof canvasOrId === "object" && canvasOrId.getContext) {
            return canvasOrId;
        }
        if (typeof document === "undefined") {
            return null;
        }
        return document.getElementById(canvasOrId);
    }

    // Prepares the canvas for sharp drawing on high-density screens and
    // returns the drawing context plus the logical size.
    function prepareCanvas(canvas) {
        const ratio = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
        const data = canvas.dataset || {};
        let width;
        let height;

        if (data.chartMode === "fixed") {
            // No CSS size: keep the size measured on the first render.
            width = toNumber(data.chartWidth);
            height = toNumber(data.chartHeight);
        } else {
            width = canvas.clientWidth || canvas.width || 600;
            height = canvas.clientHeight || canvas.height || 320;
            if (!data.chartMode) {
                // First render: is the size controlled by CSS or by the
                // width/height attributes?
                const cssSized = canvas.clientWidth > 0 && canvas.clientWidth !== canvas.width;
                if (canvas.dataset) {
                    canvas.dataset.chartMode = cssSized ? "css" : "fixed";
                    canvas.dataset.chartWidth = String(width);
                    canvas.dataset.chartHeight = String(height);
                }
                if (!cssSized && canvas.style) {
                    canvas.style.width = width + "px";
                    canvas.style.height = height + "px";
                }
            }
        }

        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);

        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return null;
        }
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, width, height);
        return { ctx, width, height };
    }

    // The text colour follows the page theme, so charts stay readable on
    // both light and dark backgrounds.
    function textColor(canvas) {
        try {
            if (typeof getComputedStyle === "function") {
                const color = getComputedStyle(canvas).color;
                if (color) {
                    return color;
                }
            }
        } catch (error) {
            // Fall through to the default colour.
        }
        return "#1f2937";
    }

    function niceMax(value) {
        if (value <= 0) {
            return 10;
        }
        const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
        const steps = [1, 2, 2.5, 5, 10];
        for (const step of steps) {
            if (value <= step * magnitude) {
                return step * magnitude;
            }
        }
        return 10 * magnitude;
    }

    function formatNumber(value) {
        return Number.isInteger(value) ? String(value) : value.toFixed(1);
    }

    function drawEmpty(canvas, message) {
        const prepared = prepareCanvas(canvas);
        if (!prepared) {
            return { ok: false, reason: "no-context" };
        }
        const { ctx, width, height } = prepared;
        ctx.fillStyle = textColor(canvas);
        ctx.globalAlpha = 0.7;
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(message, width / 2, height / 2);
        ctx.globalAlpha = 1;
        return { ok: false, reason: "no-data" };
    }

    // ---------------------------------------------------------------
    // Generic grouped bar chart
    // ---------------------------------------------------------------

    // groups: [{ label, bars: [{ value, color, text }] }]
    function drawBarChart(canvas, options) {
        const prepared = prepareCanvas(canvas);
        if (!prepared) {
            return { ok: false, reason: "no-context" };
        }
        const { ctx, width, height } = prepared;
        const color = textColor(canvas);

        const margin = { top: 44, right: 20, bottom: 40, left: 58 };
        const plotWidth = Math.max(10, width - margin.left - margin.right);
        const plotHeight = Math.max(10, height - margin.top - margin.bottom);
        const maxValue = options.fixedMax ||
            niceMax(Math.max(...options.groups.flatMap((g) => g.bars.map((b) => b.value))));
        const ticks = 5;

        ctx.textBaseline = "middle";

        // Title
        ctx.fillStyle = color;
        ctx.font = "bold 15px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(options.title, margin.left, 16);

        // Legend (only needed when bars inside a group have different meanings)
        if (options.legend) {
            ctx.font = "12px sans-serif";
            let x = margin.left;
            for (const item of options.legend) {
                ctx.fillStyle = item.color;
                ctx.fillRect(x, 28, 12, 12);
                ctx.fillStyle = color;
                ctx.textAlign = "left";
                ctx.fillText(item.label, x + 17, 34);
                x += 17 + ctx.measureText(item.label).width + 18;
            }
        }

        // Grid lines and y-axis labels
        ctx.font = "11px sans-serif";
        for (let i = 0; i <= ticks; i++) {
            const value = (maxValue / ticks) * i;
            const y = margin.top + plotHeight - (plotHeight * i) / ticks;
            ctx.globalAlpha = i === 0 ? 0.6 : 0.15;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(margin.left, y);
            ctx.lineTo(margin.left + plotWidth, y);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.fillStyle = color;
            ctx.textAlign = "right";
            ctx.fillText(formatNumber(value), margin.left - 8, y);
        }

        // Y-axis title
        ctx.save();
        ctx.translate(14, margin.top + plotHeight / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.font = "12px sans-serif";
        ctx.fillText(options.yTitle, 0, 0);
        ctx.restore();

        // Bars
        const groupWidth = plotWidth / options.groups.length;
        const bars = [];
        options.groups.forEach((group, groupIndex) => {
            const innerWidth = groupWidth * 0.7;
            const barWidth = Math.min(64, innerWidth / group.bars.length);
            const startX = margin.left + groupWidth * groupIndex +
                (groupWidth - barWidth * group.bars.length) / 2;

            group.bars.forEach((bar, barIndex) => {
                const barHeight = (bar.value / maxValue) * plotHeight;
                const x = startX + barWidth * barIndex;
                const y = margin.top + plotHeight - barHeight;
                ctx.fillStyle = bar.color;
                ctx.fillRect(x + 2, y, Math.max(1, barWidth - 4), barHeight);

                ctx.fillStyle = color;
                ctx.font = "bold 11px sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(bar.text, x + barWidth / 2, y - 8);
                if (bar.badge) {
                    ctx.font = "10px sans-serif";
                    ctx.fillText(bar.badge, x + barWidth / 2, y - 20);
                }
                bars.push({ group: group.label, label: bar.label || group.label, value: bar.value });
            });

            ctx.fillStyle = color;
            ctx.font = "12px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(group.label, margin.left + groupWidth * (groupIndex + 0.5),
                margin.top + plotHeight + 20);
        });

        return { ok: true, title: options.title, max: maxValue, bars };
    }

    // ---------------------------------------------------------------
    // Public charts
    // ---------------------------------------------------------------

    function renderUtilizationChart(canvasId, results) {
        const canvas = findCanvas(canvasId);
        if (!canvas) {
            return { ok: false, reason: "canvas-not-found" };
        }
        const rows = prepareResults(results);
        if (rows.length === 0) {
            return drawEmpty(canvas, "No results yet. Run the comparison first.");
        }

        const best = Math.max(...rows.map((row) => row.utilization));
        const groups = rows.map((row) => ({
            label: row.name,
            bars: [{
                label: row.name,
                value: row.utilization,
                color: COLORS[row.name] || COLORS.fallback,
                text: formatNumber(Math.round(row.utilization * 10) / 10) + "%",
                badge: rows.length > 1 && row.utilization === best && best > 0 ? "Best" : ""
            }]
        }));

        return drawBarChart(canvas, {
            title: "Memory Utilization by Algorithm",
            yTitle: "Utilization (%)",
            fixedMax: 100,
            groups
        });
    }

    function renderFragmentationChart(canvasId, results) {
        const canvas = findCanvas(canvasId);
        if (!canvas) {
            return { ok: false, reason: "canvas-not-found" };
        }
        const rows = prepareResults(results);
        if (rows.length === 0) {
            return drawEmpty(canvas, "No results yet. Run the comparison first.");
        }

        const groups = rows.map((row) => ({
            label: row.name,
            bars: [
                {
                    label: "Internal",
                    value: row.internal,
                    color: COLORS.internal,
                    text: formatNumber(row.internal)
                },
                {
                    label: "External",
                    value: row.external,
                    color: COLORS.external,
                    text: formatNumber(row.external)
                }
            ]
        }));

        return drawBarChart(canvas, {
            title: "Fragmentation by Algorithm",
            yTitle: "Fragmentation (KB)",
            legend: [
                { label: "Internal fragmentation", color: COLORS.internal },
                { label: "External fragmentation", color: COLORS.external }
            ],
            groups
        });
    }

    // Convenience: draws both charts from the same results.
    function renderComparison(utilizationCanvasId, fragmentationCanvasId, results) {
        return {
            utilization: renderUtilizationChart(utilizationCanvasId, results),
            fragmentation: renderFragmentationChart(fragmentationCanvasId, results)
        };
    }

    // Safe wrappers: a drawing problem must never break the whole page.
    function safe(fn) {
        return function () {
            try {
                return fn.apply(null, arguments);
            } catch (error) {
                if (typeof console !== "undefined") {
                    console.error("SimulationCharts error:", error);
                }
                return { ok: false, reason: "error", message: String(error && error.message) };
            }
        };
    }

    const api = {
        renderUtilizationChart: safe(renderUtilizationChart),
        renderFragmentationChart: safe(renderFragmentationChart),
        renderComparison: safe(renderComparison),
        prepareResults
    };

    root.SimulationCharts = api;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
})(typeof window !== "undefined" ? window : globalThis);
