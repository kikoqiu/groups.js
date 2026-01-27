/**
 * @fileoverview Global Group Theory Utilities and Generators.
 * 
 * This module provides a collection of standalone functions to:
 * 1. Parse and Format permutations (Cycle notation <-> Array/ID).
 * 2. Generate standard mathematical groups (Symmetric, Alternating, etc.).
 * 
 * These functions interact directly with the `globalRepo` to ensure efficient
 * memory usage (Zero-Copy where possible) and return `PermutationSet`
 * instances ready for algebraic operations.
 */

import { globalRepo } from './permutation-repository.js';
import { PermutationSet } from './group-engine.js';
import { SchreierSimsAlgorithm } from './schreier-sims.js';
// ============================================================================
// Notation Parsers & Formatters
// ============================================================================

/**
 * Parses a string in cycle notation into a flat permutation array.
 * Supports standard disjoint cycle notation, e.g., "(1 2 3)(4 5)".
 * 
 * Assumptions:
 * - Input uses 1-based indexing (standard mathematical notation).
 * - Output is 0-based Int32Array.
 * 
 * @param {string} str - The cycle string (e.g., "(1 2 3)").
 * @param {number} [degree=0] - The required degree (size) of the permutation. 
 *                              If 0, inferred from max element.
 * @returns {Int32Array} The permutation in array form [p[0], p[1], ...].
 */
export function parseCycles(str, degree = 0) {
    const cycleStrings = str.match(/\(([^)]+)\)/g) || [];
    
    // Parse individual numbers from string cycles
    const cycles = cycleStrings.map(s => 
        s.replace(/[()]/g, '').trim().split(/[\s,]+/).map(Number)
    );

    cycles.forEach(cycle => {
        if(cycle.some(e=>e<=0 || isNaN(e))){
            throw new Error(`Invalid cycle notation: "${str}". Cycles must contain positive integers.`);
        }
    });

    // Determine minimal degree if not provided
    if (degree === 0) {
        const maxVal = cycles.length > 0 
            ? Math.max(...cycles.flat()) 
            : 0;
        degree = Math.max(maxVal, 0);
    }

    // Initialize Identity: [0, 1, 2, ..., degree-1]
    const perm = new Int32Array(degree);
    for (let i = 0; i < degree; i++) perm[i] = i;

    // Apply cycles
    // Note: Mathematical cycles (a b c) map a->b, b->c, c->a.
    // Input is 1-based, storage is 0-based.
    cycles.forEach(cycle => {
        const len = cycle.length;
        if (len < 2) return; // 1-cycle is identity

        for (let i = 0; i < len; i++) {
            const current = cycle[i] - 1;       // 0-based index
            const next = cycle[(i + 1) % len] - 1; // 0-based value
            
            if (current >= degree || next >= degree) {
                // If the cycle explicitly references points outside the requested degree,
                // we strictly shouldn't be here if degree was auto-calculated.
                // If degree was fixed by user, this is an error or expansion case.
                // Here we essentially ignore or let it crash if out of bounds, 
                // but standard behavior is to respect 'degree'.
                continue; 
            }
            perm[current] = next;
        }
    });

    return perm;
}

/**
 * Decomposes a permutation into disjoint cycle notation string.
 * Uses 1-based indexing for the output string.
 * 
 * @param {number|Int32Array|Array<number>} perm - Permutation ID (in globalRepo) or raw array.
 * @returns {string} Cycle notation, e.g., "(1 2 3)(4 5)". Returns "()" for identity.
 */
export function decomposeToCycles(perm) {
    let permArr;

    // Resolve input to array
    if (typeof perm === 'number') {
        permArr = globalRepo.get(perm);
    } else {
        permArr = perm;
    }

    const n = permArr.length;
    const visited = new Uint8Array(n); // 0 = false, 1 = true
    const cycles = [];

    for (let i = 0; i < n; i++) {
        if (visited[i] === 0) {
            let curr = i;
            // Check if it's a fixed point (cycle of length 1)
            // Convention: omit 1-cycles unless it's the identity and we want explicit context,
            // but standard decomposition usually omits fixed points.
            if (permArr[curr] === curr) {
                visited[curr] = 1;
                continue;
            }

            const cycle = [];
            while (visited[curr] === 0) {
                visited[curr] = 1;
                cycle.push(curr + 1); // Convert to 1-based for display
                curr = permArr[curr];
            }

            // A cycle is only valid if length > 1 (redundant check due to fixed point check above, but safe)
            if (cycle.length > 1) {
                cycles.push(`(${cycle.join(' ')})`);
            }
        }
    }

    return cycles.join('') || "()";
}

// ============================================================================
// Standard Group Generators (Factories)
// ============================================================================

/**
 * Creates generators for the Symmetric Group S_n.
 * Contains all n! permutations of n elements.
 * 
 * Generators used:
 * 1. Transposition (1 2)  [0-based: (0 1)]
 * 2. Long Cycle (1 2 ... n) [0-based: (0 1 ... n-1)]
 * 
 * @param {number} n - The degree (number of points).
 * @returns {PermutationSet} A set containing the generators.
 */
export function createSymmetric(n) {
    if (n <= 1) return PermutationSet.identity(n);

    // Generator 1: Transposition (0 1)
    const genSwap = new Int32Array(n);
    for (let i = 0; i < n; i++) genSwap[i] = i;
    genSwap[0] = 1;
    genSwap[1] = 0;

    // Special case for S2: Swap is the only generator needed (Cycle is same)
    if (n === 2) {
        return new PermutationSet([
            globalRepo.register(genSwap)
        ], true, false); 
    }

    // Generator 2: Full Cycle (0 1 ... n-1)
    const genCycle = new Int32Array(n);
    for (let i = 0; i < n - 1; i++) genCycle[i] = i + 1;
    genCycle[n - 1] = 0;

    const ids = [
        globalRepo.register(genSwap),
        globalRepo.register(genCycle)
    ];

    return new PermutationSet(ids, false, false);
}

/**
 * Creates generators for the Alternating Group A_n.
 * Contains even permutations. Order: n! / 2.
 * 
 * Generators used:
 * 3-cycles of the form (1 2 i) for i = 3..n [0-based: (0 1 i) for i=2..n-1].
 * 
 * @param {number} n - The degree.
 * @returns {PermutationSet} A set containing n-2 generators.
 */
export function createAlternating(n) {
    if (n <= 2) return PermutationSet.identity(n);

    const ids = [];
    
    // Generate 3-cycles (0 1 i) for i from 2 to n-1
    for (let i = 2; i < n; i++) {
        const perm = new Int32Array(n);
        for (let k = 0; k < n; k++) perm[k] = k; // Init identity
        
        // Apply (0 1 i): 0->1, 1->i, i->0
        perm[0] = 1;
        perm[1] = i;
        perm[i] = 0;

        ids.push(globalRepo.register(perm));
    }

    return new PermutationSet(ids, false, false);
}

/**
 * Creates generators for the Cyclic Group C_n.
 * Order: n.
 * 
 * Generator used:
 * One cycle (1 2 ... n) [0-based: (0 1 ... n-1)].
 * 
 * @param {number} n - The degree.
 * @returns {PermutationSet} A set containing 1 generator.
 */
export function createCyclic(n) {
    if (n <= 1) return PermutationSet.identity(n);

    // Cycle (0 1 ... n-1)
    const perm = new Int32Array(n);
    for (let i = 0; i < n - 1; i++) perm[i] = i + 1;
    perm[n - 1] = 0;

    return new PermutationSet([
        globalRepo.register(perm)
    ], true, false);
}

/**
 * Creates generators for the Dihedral Group D_n.
 * Symmetries of a regular n-gon. Order: 2n.
 * 
 * Generators used:
 * 1. Rotation r: (1 2 ... n)
 * 2. Reflection s: Fixes 1, maps k -> n-k+2 (mod n check)
 *    0-based logic: Fixes 0, Maps k -> -k mod n.
 * 
 * @param {number} n - The number of vertices.
 * @returns {PermutationSet} A set containing 2 generators.
 */
export function createDihedral(n) {
    // D1 is usually C2 (Symmetries of a segment with direction? Or point?), D2 is Klein4 (S2xS2).
    // Here we treat n as degree. 
    // If n=2, D2 acting on 2 points is just S2.
    if (n <= 2) return createSymmetric(n);

    // 1. Rotation r
    const rot = new Int32Array(n);
    for (let i = 0; i < n - 1; i++) rot[i] = i + 1;
    rot[n - 1] = 0;

    // 2. Reflection s
    // Arithmetic: s(k) = (n - k) % n.
    // 0 -> 0
    // 1 -> n-1
    // n-1 -> 1
    const ref = new Int32Array(n);
    ref[0] = 0;
    for (let i = 1; i < n; i++) {
        ref[i] = n - i;
    }

    const ids = [
        globalRepo.register(rot),
        globalRepo.register(ref)
    ];

    return new PermutationSet(ids, false, false);
}

/**
 * Creates generators for the Klein Four-Group V_4.
 * A subgroup of S_4 isomorphic to C_2 x C_2. Order: 4.
 * 
 * Generators used:
 * 1. (1 2)(3 4) [0-based: (0 1)(2 3)]
 * 2. (1 3)(2 4) [0-based: (0 2)(1 3)]
 * 
 * @returns {PermutationSet} A set containing 2 generators on 4 points.
 */
export function createKleinFour() {
    // a = (0 1)(2 3) -> [1, 0, 3, 2]
    const a = new Int32Array([1, 0, 3, 2]);
    
    // b = (0 2)(1 3) -> [2, 3, 0, 1]
    const b = new Int32Array([2, 3, 0, 1]);

    return new PermutationSet([
        globalRepo.register(a),
        globalRepo.register(b)
    ], false, false);
}

/**
 * Creates a generator set from a list of cycle strings.
 * Convenient wrapper for parsing multiple permutations and registering them.
 * 
 * @param {string[]} cyclesStrArr - Array of strings, e.g. ["(1 2 3)", "(1 2)"].
 * @param {number} [degree=0] - Force a specific degree. If 0, auto-detected per string (max).
 * @returns {PermutationSet} The set of generators.
 */
export function createFromCycleStrings(cyclesStrArr, degree = 0) {
    const ids = [];
    
    // If degree is global, we might need to find the max across ALL strings first
    // if not provided. But parseCycles handles '0' by checking that specific string.
    // To be safe, if degree is 0, we trust parseCycles to produce valid minimal arrays,
    // and the Repo will upgrade degree if mixed sizes are registered.
    
    for (const str of cyclesStrArr) {
        const permArr = parseCycles(str, degree);
        ids.push(globalRepo.register(permArr));
    }

    // sort/dedup is handled by PermutationSet constructor
    return new PermutationSet(ids, false, false);
}




// ============================================================================
// Advanced Group Constructors (Algebraic & Geometric)
// ============================================================================

/**
 * Creates the Direct Product of two groups: G x H.
 * The resulting group acts on disjoint sets of points.
 * Degree = Degree(G) + Degree(H).
 * 
 * @param {PermutationSet} groupA - Generators for group G.
 * @param {PermutationSet} groupB - Generators for group H.
 * @param {...PermutationSet} extraGroups - Additional groups to include in the direct product.
 * @returns {PermutationSet} Generators for G x H.
 */
export function createDirectProduct(groupA, groupB, ...extraGroups) {
    if(extraGroups.length > 0){
        // Recursively build the direct product
        let product = createDirectProduct(groupA, groupB);
        for(const g of extraGroups){
            product = createDirectProduct(product, g);
        }
        return product;
    }
    // 1. Determine effective degrees (max point moved + 1)
    // We cannot simply rely on repo.globalDegree as it might be huge.
    const getEffectiveDegree = (groupSet) => {
        let max = 0;
        for (const id of groupSet.indices) {
            const arr = globalRepo.get(id);
            // Scan backwards to find last non-fixed point
            for (let i = arr.length - 1; i >= 0; i--) {
                if (arr[i] !== i) {
                    if (i + 1 > max) max = i + 1;
                    break;
                }
            }
        }
        return max;
    };

    // If a group is identity, effective degree is 0 (or 1), but we must ensure disjointness
    // logic works. If degree is 0, we treat it as acting on 0 points (trivial).
    // However, for visualization consistency, we typically want at least degree 1.
    const degA = Math.max(getEffectiveDegree(groupA), 1);
    const degB = Math.max(getEffectiveDegree(groupB), 1);
    const totalDegree = degA + degB;

    const newIds = [];

    // 2. Lift generators of A into G x {e}
    // A acts on [0, degA-1], fixes [degA, totalDegree-1]
    for (const idA of groupA.indices) {
        if (idA === globalRepo.identity) continue;
        
        const permA = globalRepo.get(idA);
        const newPerm = new Int32Array(totalDegree);
        
        // Copy A part
        const lenA = Math.min(permA.length, degA);
        for (let i = 0; i < lenA; i++) newPerm[i] = permA[i];
        // Fix the rest of A's domain if implicit
        for (let i = lenA; i < degA; i++) newPerm[i] = i;
        // Fix B's domain
        for (let i = degA; i < totalDegree; i++) newPerm[i] = i;

        newIds.push(globalRepo.register(newPerm));
    }

    // 3. Lift generators of B into {e} x H
    // B acts on [degA, degA + degB - 1] (Indices shifted by degA)
    for (const idB of groupB.indices) {
        if (idB === globalRepo.identity) continue;

        const permB = globalRepo.get(idB);
        const newPerm = new Int32Array(totalDegree);

        // Fix A's domain
        for (let i = 0; i < degA; i++) newPerm[i] = i;

        // Apply B shifted
        // permB[k] = v  =>  newPerm[k + degA] = v + degA
        for (let i = 0; i < degB; i++) {
            // Be careful if permB is shorter than degB (implicit fixed points)
            const val = (i < permB.length) ? permB[i] : i;
            newPerm[degA + i] = degA + val;
        }

        newIds.push(globalRepo.register(newPerm));
    }

    return new PermutationSet(newIds, false, false);
}

/**
 * Creates generators for the Quaternion Group Q8.
 * Order: 8. Non-abelian.
 * Defined via Regular Representation in S8.
 * Elements: {1, i, j, k, -1, -i, -j, -k}
 * 
 * @returns {PermutationSet}
 */
export function createQuaternion() {
    // Generators i and j acting on 8 points (0..7)
    // i: (0 1 4 5)(2 7 6 3) -> 1->i, i->-1, -1->-i, -i->1 ...
    const i_gen = new Int32Array([1, 4, 7, 2, 5, 0, 3, 6]);
    
    // j: (0 2 4 6)(1 3 5 7) -> 1->j, j->-1, -1->-j, -j->1 ...
    const j_gen = new Int32Array([2, 3, 4, 5, 6, 7, 0, 1]);

    return new PermutationSet([
        globalRepo.register(i_gen),
        globalRepo.register(j_gen)
    ], false, false);
}

/**
 * Creates the Trivial Group (Identity).
 * @returns {PermutationSet}
 */
export function createTrivial() {
    return PermutationSet.identity(1);
}

/**
 * Creates a group from raw integer arrays.
 * Registers each raw permutation array into the global repository and returns a PermutationSet of their IDs.
 * Useful for loading from JSON or UI input.
 * 
 * @param {Array<Int32Array | Array<number>>} arrays - An array of raw permutation arrays (e.g., `[[0,1,2],[1,0,2]]`).
 * @returns {PermutationSet} A PermutationSet containing the registered permutation IDs.
 */
export function createFromRawArrays(arrays) {
    const ids = arrays.map(arr => globalRepo.register(arr));
    return new PermutationSet(ids, false, false);
}

// ============================================================================
// Geometric / Platonic Solids Aliases
// ============================================================================

/**
 * Tetrahedral Group (Rotations of a regular tetrahedron).
 * Isomorphic to A4. Order 12.
 * @returns {PermutationSet} A PermutationSet representing the generators of the Tetrahedral Group.
 */
export function createTetrahedral() {
    return createAlternating(4);
}

/**
 * Octahedral Group (Rotations of a regular octahedron).
 * Isomorphic to S4. Order 24.
 * @returns {PermutationSet} A PermutationSet representing the generators of the Octahedral Group.
 */
export function createOctahedral() {
    return createSymmetric(4);
}

/**
 * Icosahedral Group (Rotations of a regular icosahedron).
 * Isomorphic to A5. Order 60.
 * @returns {PermutationSet} A PermutationSet representing the generators of the Icosahedral Group.
 */
export function createIcosahedral() {
    return createAlternating(5);
}

/**
 * Attempts to find a new set of generators for the group where every generator 
 * has an order less than or equal to `maxOrder`.
 * 
 * It explores the group structure (via BFS) to find candidate elements of low order.
 * If it finds enough low-order elements to generate the original group (verified by SSA),
 * it returns this new set. Otherwise, returns null.
 * 
 * @param {PermutationSet|Array<number>} inputGenerators - The original generators of the group.
 * @param {number} maxOrder - The maximum allowed order for the new generators.
 * @param {number} [maxSearchSize=50000] - Limit on the number of group elements to explore during search.
 * @returns {PermutationSet|null} A new PermutationSet if successful, or null if failed.
 */
export function findLowOrderGenerators(inputGenerators, maxOrder, maxSearchSize = 50000) {
    const originalIds = (inputGenerators instanceof PermutationSet) ? inputGenerators.indices : inputGenerators;
    // Filter out identity as it doesn't contribute to generation
    const genIds = originalIds.filter(id => id !== globalRepo.identity);
    
    // If the original set is just identity or empty
    if (genIds.length === 0) return new PermutationSet([], true);

    // 1. Initialize an empty SSA for the *new* candidate set
    // We use this to verify if our new candidates can cover the original generators.
    const ssa = new SchreierSimsAlgorithm();
    const newGenerators = [];

    // Helper: Check if the current SSA (built from new gens) covers all original generators
    const isCoverageComplete = () => {
        for (const id of genIds) {
            if (!ssa.contains(id)) return false;
        }
        return true;
    };

    // Helper: Calculate the order of a permutation (LCM of cycle lengths)
    const getOrder = (id) => {
        const perm = globalRepo.get(id);
        const n = perm.length;
        const visited = new Uint8Array(n);
        let totalLcm = 1n;

        // GCD for BigInt
        const gcd = (a, b) => {
            while (b !== 0n) { let t = b; b = a % b; a = t; }
            return a;
        };

        for (let i = 0; i < n; i++) {
            if (visited[i]) continue;
            let len = 0n;
            let curr = i;
            while (!visited[curr]) {
                visited[curr] = 1;
                curr = perm[curr];
                len++;
            }
            if (len > 0n) {
                // LCM(a, b) = (a * b) / GCD(a, b)
                // Compute safely for BigInt
                const div = gcd(totalLcm, len);
                totalLcm = (totalLcm * len) / div;
            }
        }
        return Number(totalLcm); // Safe cast for comparison (Orders > 2^53 are rare/huge)
    };

    // Helper: Try to add a candidate element to our new set
    const processCandidate = (id) => {
        if (id === globalRepo.identity) return;

        // 1. Check strict order constraint
        const order = getOrder(id);
        if (order <= maxOrder) {
            // 2. Add to SSA if it's not already generated by current low-order set
            if (!ssa.contains(id)) {
                ssa.siftAndInsert(id);
                newGenerators.push(id);
            }
        }
    };

    // 2. BFS / Orbit Exploration
    // We explore the Cayley graph starting from original generators to find
    // valid low-order elements.
    const queue = [];
    const visited = new Set();

    // Initialize BFS with original generators
    for (const id of genIds) {
        if (!visited.has(id)) {
            visited.add(id);
            queue.push(id);
            processCandidate(id);
        }
    }

    // Check immediately (maybe originals are already low order)
    if (isCoverageComplete()) {
        return new PermutationSet(newGenerators, false, false);
    }

    let head = 0;
    while (head < queue.length && visited.size < maxSearchSize) {
        const curr = queue[head++];

        // Multiply current element by original generators to expand search
        for (const gen of genIds) {
            const next = globalRepo.multiply(curr, gen);
            
            if (!visited.has(next)) {
                visited.add(next);
                queue.push(next);
                
                processCandidate(next);

                // Optimization: Check coverage after every successful addition
                // to exit as early as possible.
                if (newGenerators.length > 0 && isCoverageComplete()) {
                    return new PermutationSet(newGenerators, false, false);
                }
            }
        }
    }

    // Failed to find a generating set within search limit
    return null;
}


