/**
 * Contiguous Memory Allocation Algorithms.
 *
 * The allocator works with the MemoryModels classes supplied by memory.js.
 * Fixed mode keeps the selected partition size, so the unused space is
 * internal fragmentation. Dynamic mode splits a selected hole and creates a
 * new free block for the leftover space.
 */

class MemoryAllocator {
    constructor(name) {
        this.name = name;
    }

    evaluateHole(block, process) {
        const leftover = block.size - process.size;
        return new MemoryModels.CandidateEvaluation(
            block.id,
            block.label,
            block.size,
            leftover >= 0,
            leftover,
            false
        );
    }

    chooseBlock() {
        throw new Error('chooseBlock(process, blocks) must be implemented by a concrete allocator');
    }

    runSimulation(initialBlocks, initialProcesses, mode = 'fixed') {
        const blocks = initialBlocks.map(block => block.clone());
        const processes = initialProcesses.map(process => process.clone());
        const steps = [];
        const allocationMode = String(mode).toLowerCase() === 'dynamic' ? 'dynamic' : 'fixed';
        let nextBlockId = Math.max(0, ...blocks.map(block => Number(block.id) || 0)) + 1;

        processes.forEach((process, index) => {
            const decision = this.chooseBlock(process, blocks);
            const candidates = decision.candidates || [];

            if (decision.chosenIndex === null || decision.chosenIndex === undefined) {
                process.isAllocated = false;
                process.allocatedBlockId = null;
                steps.push(new MemoryModels.AllocationStep({
                    stepNumber: index + 1,
                    process,
                    status: 'FAILED',
                    message: `${process.name} (${process.size} KB) failed to allocate: no free hole >= ${process.size} KB`,
                    candidates,
                    snapshot: blocks
                }));
                return;
            }

            const chosenIndex = decision.chosenIndex;
            const targetBlock = blocks[chosenIndex];
            const originalBlockSize = targetBlock.size;
            const leftover = originalBlockSize - process.size;

            targetBlock.process = process.clone();
            process.isAllocated = true;
            process.allocatedBlockId = targetBlock.id;

            candidates.forEach(candidate => {
                if (candidate.blockId === targetBlock.id) candidate.chosen = true;
            });

            let splitLabel = '';
            if (allocationMode === 'dynamic' && leftover > 0) {
                targetBlock.size = process.size;
                const newHole = new MemoryModels.MemoryBlock({
                    id: nextBlockId++,
                    size: leftover,
                    label: `${targetBlock.label}'`
                });
                blocks.splice(chosenIndex + 1, 0, newHole);
                splitLabel = newHole.label;
                MemoryModels.assignAddresses(blocks);
            }

            steps.push(new MemoryModels.AllocationStep({
                stepNumber: index + 1,
                process,
                chosenBlockId: targetBlock.id,
                chosenLabel: targetBlock.label,
                status: 'ALLOCATED',
                message: `${process.name} (${process.size} KB) -> ${targetBlock.label} (${originalBlockSize} KB) | Leftover: ${leftover} KB`,
                leftover,
                splitLabel,
                candidates,
                snapshot: blocks
            }));
        });

        // Fixed mode does not change block sizes, but address assignment is
        // cheap and keeps the result valid for callers that supplied custom
        // blocks without addresses.
        MemoryModels.assignAddresses(blocks);
        return { finalBlocks: blocks, finalProcesses: processes, steps };
    }
}

class FirstFit extends MemoryAllocator {
    constructor() {
        super('First Fit');
    }

    chooseBlock(process, blocks) {
        const candidates = [];
        for (let index = 0; index < blocks.length; index += 1) {
            const block = blocks[index];
            if (!block.isFree) continue;
            const evaluation = this.evaluateHole(block, process);
            candidates.push(evaluation);
            if (evaluation.fits) return { chosenIndex: index, candidates };
        }
        return { chosenIndex: null, candidates };
    }
}

class BestFit extends MemoryAllocator {
    constructor() {
        super('Best Fit');
    }

    chooseBlock(process, blocks) {
        const candidates = [];
        let chosenIndex = null;
        let smallestLeftover = Infinity;

        blocks.forEach((block, index) => {
            if (!block.isFree) return;
            const evaluation = this.evaluateHole(block, process);
            candidates.push(evaluation);
            // Strict comparison preserves the first block on an equal tie.
            if (evaluation.fits && evaluation.leftover < smallestLeftover) {
                smallestLeftover = evaluation.leftover;
                chosenIndex = index;
            }
        });

        return { chosenIndex, candidates };
    }
}

class WorstFit extends MemoryAllocator {
    constructor() {
        super('Worst Fit');
    }

    chooseBlock(process, blocks) {
        const candidates = [];
        let chosenIndex = null;
        let largestLeftover = -Infinity;

        blocks.forEach((block, index) => {
            if (!block.isFree) return;
            const evaluation = this.evaluateHole(block, process);
            candidates.push(evaluation);
            // Strict comparison preserves the first block on an equal tie.
            if (evaluation.fits && evaluation.leftover > largestLeftover) {
                largestLeftover = evaluation.leftover;
                chosenIndex = index;
            }
        });

        return { chosenIndex, candidates };
    }
}

window.Algorithms = {
    MemoryAllocator,
    FirstFit,
    BestFit,
    WorstFit,
    getAllocator(name) {
        const normalized = String(name || '').toLowerCase();
        if (normalized.includes('best')) return new BestFit();
        if (normalized.includes('worst')) return new WorstFit();
        return new FirstFit();
    }
};
