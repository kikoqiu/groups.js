/**
 * @fileoverview Heuristic Search for Coxeter-like Generators.
 * 
 * This module attempts to reconstruct a "beautiful" generating set (Coxeter-like)
 * for a given permutation group. It prioritizes:
 * 1. Involutions (Order 2 elements).
 * 2. Sparsity (Low Hamming distance / Minimal support).
 * 3. Adjacency (Mapping point i to i+1).
 * 
 * ALGORITHM:
 * 1. Stabilizer Chain Decomposition: Break down the group into layers.
 * 2. Frontier Expansion: Greedily find generators to cover each layer's orbit.
 * 3. Safety Net: Verify if the found generators actually generate the full group.
 * 4. Minimization: Prune redundant generators, prioritizing the removal of "ugly" (high order) ones.
 */

import { globalRepo } from './permutation-repository.js';
import { PermutationSet } from './group-engine.js';
import { SchreierSimsAlgorithm } from './schreier-sims.js'; 
import { _lcm, calcApproxOrder } from './group-private-utils.js';

// ============================================================================
// Public API
// ============================================================================

/**
 * Attempts to find a set of generators that mimic a Coxeter system (strong generating set of involutions).
 * 
 * @param {PermutationSet|number[]} inputGenerators - The initial generators defining the group.
 * @param {{beamWidth:number, generations:number, forcedBase:number[]}} [options] - Configuration options.
 * @param {number} [options.beamWidth=50] - Number of candidates to keep in beam search.
 * @param {number} [options.generations=30] - Number of mixing generations.
 * @param {number[]} [options.forcedBase] - Force a specific base order.
 * @returns {PermutationSet} A new set of generators.
 */
export function findCoxeterLikeGenerators(inputGenerators, options = {}) {
    const { 
        beamWidth = 50,
        generations = 30,
        forcedBase = null
    } = options;

    const inputs = (inputGenerators instanceof PermutationSet) ? inputGenerators.indices : inputGenerators;
    
    // 0. Compute target group order for validation (Ground Truth)
    const targetSSA = SchreierSimsAlgorithm.compute(inputs);
    const targetOrder = targetSSA.order;

    // 1. Determine effective degree and base
    let maxPoint = 0;
    for (const id of inputs) {
        const perm = globalRepo.get(id);
        for (let i = perm.length - 1; i >= 0; i--) {
            if (perm[i] !== i) {
                if (i > maxPoint) maxPoint = i;
                break;
            }
        }
    }
    const degree = maxPoint + 1;
    const base = forcedBase || Array.from({ length: degree }, (_, i) => i);

    // 2. Build SSA to decompose the group structure layer by layer
    const ssa = new SchreierSimsAlgorithm(base);
    for (const id of inputs) {
        ssa.siftAndInsert(id);
    }

    // 3. Collect Candidate Generators (Greedy Frontier Expansion)
    const candidateGenerators = [];

    for (let i = 0; i < ssa.base.length; i++) {
        const currentBasePoint = ssa.base[i];
        
        // Gather strong generators for G^(i) (Stabilizer of 0..i-1)
        const subGroupGenerators = [];
        for (let k = i; k < ssa.generators.length; k++) {
            if (ssa.generators[k]) {
                for (const g of ssa.generators[k]) subGroupGenerators.push(g);
            }
        }

        if (subGroupGenerators.length === 0) continue;

        // Determine the full orbit of base[i] under G^(i)
        const fullOrbit = _computeOrbit(currentBasePoint, subGroupGenerators);
        if (fullOrbit.size === 1) continue;

        // Frontier Expansion Loop
        const levelGens = [];
        let coveredOrbit = new Set([currentBasePoint]);
        let loopSafety = 0;

        // Try to cover the entire orbit using heuristic search
        while (coveredOrbit.size < fullOrbit.size && loopSafety++ < fullOrbit.size + 10) {
            
            const unvisited = new Set();
            for (const p of fullOrbit) {
                if (!coveredOrbit.has(p)) unvisited.add(p);
            }

            // Identify best (source, target) pair to bridge the gap.
            // Priority: Adjacent points (dist=1)
            let bestTargetPair = null;
            let minDist = Infinity;

            for (const u of coveredOrbit) {
                const candidates = [u + 1, u - 1];
                let foundAdj = false;
                for (const v of candidates) {
                    if (unvisited.has(v)) {
                        bestTargetPair = { u, v };
                        minDist = 1;
                        foundAdj = true;
                        break; 
                    }
                }
                if (foundAdj) break;

                if (minDist > 1) {
                    for (const v of unvisited) {
                        const d = Math.abs(u - v);
                        if (d < minDist) {
                            minDist = d;
                            bestTargetPair = { u, v };
                        }
                    }
                }
            }

            if (!bestTargetPair) break;

            const { u: sourcePoint, v: targetPoint } = bestTargetPair;
            const singleTargetSet = new Set([targetPoint]);

            // A. Beam Search for "Nice" Generator (Involution)
            let bestGen = _beamSearchBestGenerator(
                subGroupGenerators, 
                sourcePoint, 
                singleTargetSet, 
                beamWidth, 
                generations
            );

            // B. Panic Mode: Random Walk for Involutions
            if (bestGen === -1) {
                bestGen = _randomWalkForInvolution(
                    subGroupGenerators, 
                    sourcePoint, 
                    singleTargetSet, 
                    2000 
                );
            }

            // C. Fallback: Any valid generator mapping u -> v (Even high order)
            if (bestGen === -1) {
                // Relax target to any unvisited if direct bridge failed
                bestGen = subGroupGenerators.find(id => {
                     const p = globalRepo.get(id);
                     const img = (sourcePoint < p.length) ? p[sourcePoint] : sourcePoint;
                     return singleTargetSet.has(img); // Strict target check
                });
                
                // If strict target failed, look for ANY unvisited
                if (!bestGen) {
                    bestGen = subGroupGenerators.find(id => {
                         const p = globalRepo.get(id);
                         const img = (sourcePoint < p.length) ? p[sourcePoint] : sourcePoint;
                         return unvisited.has(img);
                    });
                }
            }

            if (bestGen !== undefined && bestGen !== -1) {
                levelGens.push(bestGen);
            } else {
                // If we are stuck, we break. The Safety Net will catch us.
                break;
            }

            coveredOrbit = _computeOrbit(currentBasePoint, levelGens);
        }
        
        candidateGenerators.push(...levelGens);
    }

    // 4. Safety Net: Verify Group Order
    // If the heuristic search missed elements (e.g., C4 case where involutions don't exist),
    // we MUST restore the original inputs to guarantee correctness.
    const checkSSA = SchreierSimsAlgorithm.compute(candidateGenerators);
    if (checkSSA.order < targetOrder) {
        // We lost symmetry! Restore original generators.
        // The minimizer will clean up duplicates.
        candidateGenerators.push(...inputs);
    }

    // 5. Global Minimization (Pruning Phase)
    const minimalIds = _minimizeGenerators(candidateGenerators, targetOrder);

    return new PermutationSet(minimalIds, false, false);
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Minimizes a set of generators while preserving the group order.
 * @private
 */
function _minimizeGenerators(genIds, targetOrder) {
    let currentSet = [...new Set(genIds)];
    
    // Sort to prioritize removing "Bad" generators first.
    // We want to KEEP: Order 2, Low Support, Small Displacement.
    // So we put "Bad" stuff at the START of the array to be removed first.
    currentSet.sort((a, b) => {
        const permA = globalRepo.get(a);
        const permB = globalRepo.get(b);
        const ordA = calcApproxOrder(permA);
        const ordB = calcApproxOrder(permB);
        
        // 1. High Order is BAD. (Desc order)
        if (ordA !== ordB) {
            // Special exception: Order 2 is Best.
            if (ordA === 2) return 1; // A is best, move to end
            if (ordB === 2) return -1; // B is best, move to end
            return ordB - ordA; // Otherwise remove largest order first
        }
        
        // 2. High Support is BAD.
        const suppA = _calculateSupport(permA);
        const suppB = _calculateSupport(permB);
        if (suppA !== suppB) return suppB - suppA;
        
        // 3. High Displacement is BAD.
        const dispA = _calculateDisplacement(permA);
        const dispB = _calculateDisplacement(permB);
        return dispB - dispA;
    });

    const workingSet = [...currentSet];
    const keptIndices = new Set(workingSet.map((_, i) => i));

    for (let i = 0; i < workingSet.length; i++) {
        const testSetIds = [];
        for (let k = 0; k < workingSet.length; k++) {
            if (k !== i && keptIndices.has(k)) {
                testSetIds.push(workingSet[k]);
            }
        }

        // Verification
        const testSSA = SchreierSimsAlgorithm.compute(testSetIds);
        
        // Note: BigInt comparison
        if (testSSA.order === targetOrder) {
            keptIndices.delete(i); // Safe to remove
        }
    }

    return workingSet.filter((_, i) => keptIndices.has(i));
}

function _calculateSupport(perm) {
    let s = 0;
    for (let i = 0; i < perm.length; i++) if (perm[i] !== i) s++;
    return s;
}

function _calculateDisplacement(perm) {
    let s = 0;
    for (let i = 0; i < perm.length; i++) s += Math.abs(i - perm[i]);
    return s;
}

function _computeOrbit(startPoint, genIds) {
    const orbit = new Set([startPoint]);
    const queue = [startPoint];
    const perms = genIds.map(id => globalRepo.get(id));
    let ptr = 0;
    while(ptr < queue.length) {
        const u = queue[ptr++];
        for(let i=0; i<perms.length; i++) {
            const p = perms[i];
            const val = (u < p.length) ? p[u] : u;
            if(!orbit.has(val)) {
                orbit.add(val);
                queue.push(val);
            }
        }
    }
    return orbit;
}

/**
 * Performs a Beam Search to find the "Canonical" generator.
 * @private
 */
function _beamSearchBestGenerator(genIds, sourcePoint, validDestinations, beamWidth, maxGenerations) {
    
    const evaluate = (id) => {
        const perm = globalRepo.get(id);
        const img = (sourcePoint < perm.length) ? perm[sourcePoint] : sourcePoint;
        
        const isDestValid = validDestinations.has(img);
        const order = calcApproxOrder(perm);
        
        // 1. Must hit target
        if (!isDestValid) return 1e9; 

        // 2. Order 2 is critical
        const orderPenalty = (order === 2) ? 0 : (order * 1e5);

        // 3. Low Support
        const support = _calculateSupport(perm);
        
        // 4. Adjacency
        const dist = Math.abs(img - sourcePoint);
        const adjacencyPenalty = (dist === 1) ? 0 : (dist * 100);

        return orderPenalty + (support * 10) + adjacencyPenalty;
    };

    let pool = [];
    const seenIds = new Set();
    
    const tryAdd = (id) => {
        if (seenIds.has(id)) return;
        seenIds.add(id);
        let s = evaluate(id);
        // Heuristic: Keep good mixers even if they miss target
        if (s > 1e6) {
            const ord = calcApproxOrder(globalRepo.get(id));
            if (ord === 2) s = 5000;
            else if (ord < 5) s = 10000;
        }
        pool.push({ id, score: s });
    };

    genIds.forEach(id => {
        tryAdd(id);
        tryAdd(globalRepo.inverse(id));
        tryAdd(globalRepo.multiply(id, id));
    });

    if (pool.length === 0) return -1;
    pool.sort((a, b) => a.score - b.score);

    if (pool[0].score < 100) return pool[0].id;

    for (let gen = 0; gen < maxGenerations; gen++) {
        const nextGenCandidates = [];
        const breeders = pool.slice(0, Math.min(pool.length, beamWidth));
        
        // Mixing
        for (let i = 0; i < breeders.length; i++) {
            for (let j = 0; j < breeders.length; j++) {
                if (i === j) continue;
                nextGenCandidates.push(globalRepo.multiply(breeders[i].id, breeders[j].id));
            }
        }

        // Conjugation
        const involutions = breeders.filter(b => calcApproxOrder(globalRepo.get(b.id)) === 2);
        const sources = involutions.length > 0 ? involutions : breeders;
        
        for (const b of breeders) {
            const g = b.id;
            const gInv = globalRepo.inverse(g);
            for (const h of sources) {
                const tmp = globalRepo.multiply(g, h.id);
                nextGenCandidates.push(globalRepo.multiply(tmp, gInv));
            }
        }

        for (const cid of nextGenCandidates) tryAdd(cid);

        pool.sort((a, b) => a.score - b.score);
        pool = pool.slice(0, beamWidth);

        if (pool[0].score < 100) return pool[0].id;
    }

    return (pool[0].score < 1e6) ? pool[0].id : -1;
}
/**
 * Performs a random walk in the group to find an involution mapping sourcePoint to validDestinations.
 * @private
 */
function _randomWalkForInvolution(genIds, sourcePoint, validDestinations, maxSteps) {
    if (genIds.length === 0) return -1;
    let pool = [...genIds];
    genIds.forEach(id => pool.push(globalRepo.inverse(id)));
    const seen = new Set(pool);

    for (let i = 0; i < maxSteps; i++) {
        const a = pool[Math.floor(Math.random() * pool.length)];
        const b = pool[Math.floor(Math.random() * pool.length)];
        const prod = globalRepo.multiply(a, b);
        
        if (!seen.has(prod)) {
            pool.push(prod);
            seen.add(prod);
            if (pool.length > 300) {
                pool.splice(0, 100); 
                seen.clear(); pool.forEach(x=>seen.add(x));
            }
        }

        const perm = globalRepo.get(prod);
        const ord = calcApproxOrder(perm);
        if (ord === 2) {
            const img = (sourcePoint < perm.length) ? perm[sourcePoint] : sourcePoint;
            if (validDestinations.has(img)) return prod;
        }
    }
    return -1;
}
