/**
 * Metrics and comparison engine for contiguous memory allocation.
 */

class SimulationMetrics {
    constructor(values) {
        Object.assign(this, values);
    }
}

class MemoryAnalyzer {
    static calculateMetrics(algorithmName, blocks, processes, steps = []) {
        const userBlocks = blocks.filter(block => !block.isOS);
        const totalMemory = userBlocks.reduce((sum, block) => sum + block.size, 0);
        const allocatedBlocks = userBlocks.filter(block => block.process !== null);
        const freeHoles = userBlocks.filter(block => block.isFree).map(block => block.size);

        const usedMemory = allocatedBlocks.reduce((sum, block) => sum + block.process.size, 0);
        const internalFragmentation = allocatedBlocks.reduce(
            (sum, block) => sum + block.internalFragmentation,
            0
        );
        const totalFreeMemory = freeHoles.reduce((sum, size) => sum + size, 0);
        const largestFreeHole = freeHoles.length ? Math.max(...freeHoles) : 0;
        const externalFragmentation = Math.max(0, totalFreeMemory - largestFreeHole);
        const memoryUtilization = totalMemory > 0 ? (usedMemory / totalMemory) * 100 : 0;

        const allocatedProcesses = processes.filter(process => process.isAllocated).map(process => process.name);
        const failedProcesses = processes.filter(process => !process.isAllocated).map(process => process.name);
        const totalScans = steps.reduce(
            (sum, step) => sum + (Array.isArray(step.candidates) ? step.candidates.length : 0),
            0
        );

        // An exact fit is a process occupying a block with no leftover.
        const exactFitsCount = allocatedBlocks.filter(
            block => block.size === block.process.size
        ).length;
        // The UI uses 50 KB as its small-hole diagnostic threshold.
        const unusableHolesCount = freeHoles.filter(size => size > 0 && size < 50).length;

        return new SimulationMetrics({
            algorithmName,
            totalMemory,
            usedMemory,
            totalFreeMemory,
            largestFreeHole,
            internalFragmentation,
            externalFragmentation,
            memoryUtilization,
            totalProcesses: processes.length,
            allocatedCount: allocatedProcesses.length,
            failedCount: failedProcesses.length,
            allocatedProcesses,
            failedProcesses,
            totalScans,
            exactFitsCount,
            unusableHolesCount
        });
    }

    static simulateAll(blockSizes, processSizes, mode = 'fixed', osReserved = 0) {
        return [
            new Algorithms.FirstFit(),
            new Algorithms.BestFit(),
            new Algorithms.WorstFit()
        ].map(allocator => {
            const initialBlocks = MemoryModels.buildInitialMemory(blockSizes, osReserved);
            const initialProcesses = MemoryModels.buildProcesses(processSizes);
            const simulation = allocator.runSimulation(initialBlocks, initialProcesses, mode);
            const metrics = this.calculateMetrics(
                allocator.name,
                simulation.finalBlocks,
                simulation.finalProcesses,
                simulation.steps
            );

            return {
                name: allocator.name,
                blocks: simulation.finalBlocks,
                processes: simulation.finalProcesses,
                steps: simulation.steps,
                metrics
            };
        });
    }

    static rankAlgorithms(results) {
        if (!Array.isArray(results) || results.length === 0) return null;

        const sorted = results
            .map((result, originalIndex) => ({ result, originalIndex }))
            .sort((left, right) => {
                const a = left.result.metrics;
                const b = right.result.metrics;

                return (b.allocatedCount - a.allocatedCount) ||
                    (b.memoryUtilization - a.memoryUtilization) ||
                    (a.internalFragmentation - b.internalFragmentation) ||
                    (a.externalFragmentation - b.externalFragmentation) ||
                    (a.totalScans - b.totalScans) ||
                    (left.originalIndex - right.originalIndex);
            })
            .map(entry => entry.result);

        const bestMetrics = sorted[0].metrics;
        const isTie = metrics =>
            metrics.allocatedCount === bestMetrics.allocatedCount &&
            Math.abs(metrics.memoryUtilization - bestMetrics.memoryUtilization) < 0.01 &&
            metrics.internalFragmentation === bestMetrics.internalFragmentation &&
            metrics.externalFragmentation === bestMetrics.externalFragmentation &&
            metrics.totalScans === bestMetrics.totalScans;

        return {
            best: sorted[0].name,
            bestMetrics,
            ranking: sorted.map(result => result.name),
            ties: sorted.slice(1).filter(result => isTie(result.metrics)).map(result => result.name)
        };
    }
}

window.SimulationMetrics = SimulationMetrics;
window.MemoryAnalyzer = MemoryAnalyzer;
