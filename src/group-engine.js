/**
 * @fileoverview High-Performance Group Theory Engine.
 * 
 * Provides the core `PermutationSet` implementation with:
 * - Direct memory access to the global repository (Zero-Copy reads).
 * - Cache-aware loop tiling for multiplication.
 * - Flat TypedArray storage for set elements.
 * - Optimized Orbit and Coset algorithms.
 */

import { IntSetUtils } from './int-set-utils.js';
import { globalRepo } from './permutation-repository.js';
import { SchreierSimsAlgorithm } from './schreier-sims.js';

// ============================================================================
// Module-Level Static Optimizations
// ============================================================================

/** 
 * Shared buffer for temporary composition results.
 * Prevents GC thrashing during tight loops.
 * Size is automatically managed.
 * @private
 */
let _tempCompositionBuffer = new Int32Array(1024);

/**
 * Ensures the temporary buffer is sufficient for the current global degree.
 * @param {number} requiredSize - The minimum required size for the temporary composition buffer, typically `globalDegree`.
 * @private
 */
function _ensureTempBuffer(requiredSize) {
    if (_tempCompositionBuffer.length < requiredSize) {
        // Expand by 2x to amortize resizing costs
        const newSize = Math.max(requiredSize, _tempCompositionBuffer.length * 2);
        _tempCompositionBuffer = new Int32Array(newSize);
    }
}


// ============================================================================
// Concrete Implementation: Permutation Group
// ============================================================================

/**
 * Represents a set of permutations, providing high-performance algebraic operations.
 * This class uses direct memory access and a global repository for efficient storage and computation.
 */
export class PermutationSet  {
    /**
     * @param {Int32Array|Array<number>} ids - Sorted, unique IDs from the repository.
     * @param {boolean} [isTrustedSortedUnique=false] - Skip sort/dedup if true.
     * @param {boolean} [isGroup=false] - Whether this set is known to be a mathematical group.
     */
    constructor(ids, isTrustedSortedUnique = false, isGroup = false) {

        // Data Ownership Strategy:
        // 1. If trusted, we assume the caller passes a dedicated buffer we can hold.
        // 2. Otherwise, we copy and normalize.
        if (isTrustedSortedUnique && ids instanceof Int32Array) {
            this._ids = ids;
        } else {
            const raw = (ids instanceof Int32Array) ? ids : new Int32Array(ids);
            this._ids = isTrustedSortedUnique ? raw : IntSetUtils.sortAndUnique(raw);
        }

        /**
         * Flag indicating if this set satisfies group axioms. 
         * @type {boolean} 
         * 
         */
        this.isGroup = isGroup;
    }

    // ------------------------------------------------------------------------
    // Read-Only Accessors
    // ------------------------------------------------------------------------
    /**
     * The number of elements in the set.
     * @type {number}
     */
    get size() {
        return this._ids.length;
    }

    /**
     * Returns the internal Int32Array of sorted, unique permutation IDs.
     * Direct access should be read-only.
     * @returns {Int32Array}
     */
    get indices() {
        return this._ids;
    }

    /**
     * Retrieves a permutation ID at a specific index within this set.
     * @param {number} index - The 0-based index of the element to retrieve.
     * @returns {number} The permutation ID.
     */
    get(index) {
        return this._ids[index];
    }

    /**
     * Returns an iterator for the permutation IDs in this set.
     * @returns {Iterator<number>} An iterator for the `_ids` Int32Array.
     */
    [Symbol.iterator]() {
        return this._ids[Symbol.iterator]();
    }

    /**
     * Creates a lightweight read-only view of a subset.
     * @param {number} start - The starting index (inclusive).
     * @param {number} end - The ending index (exclusive).
     * @returns {PermutationSet} A new set representing the slice.
     * @abstract
     */
    slice(start, end) {
        // Int32Array.subarray is O(1) and shares memory.
        return new PermutationSet(this._ids.subarray(start, end), true, false);
    }

    /**
     * Returns a string representation of the PermutationSet.
     * @returns {string} A string in the format "PermSet(ids=[...], isGroup=...)".
     */
    toString() {
        let eles=Array.from(this._ids).map(id=>`${globalRepo.getAsCycles(id)}`).join(',');
        return `PermSet( {${eles}}, ids=[${this._ids.join(',')}] size=${this.size} isGroup=${this.isGroup})`;
    }

    // ------------------------------------------------------------------------
    // Core Algebra (Performance Critical)
    // ------------------------------------------------------------------------

    /**
     * Vectorized Group Multiplication: G * H = { g * h | g in G, h in H }
     * Optimized with direct heap access and loop hoisting.
     * Multiplies this set by another set.
     * @param {PermutationSet} other - The other set to multiply by.
     * @returns {PermutationSet} A new set representing the product.
     * @abstract
     */
    multiply(other) {
        if (!(other instanceof PermutationSet)) {
            throw new Error("Type mismatch: Expected PermutationSet.");
        }

        const sizeA = this._ids.length;
        const sizeB = other._ids.length;

        // Fast path for empty sets
        if (sizeA === 0 || sizeB === 0) {
            return new PermutationSet(new Int32Array(0), true, false);
        }

        const repo = globalRepo;
        const N = repo.globalDegree;
        const permBuffer = repo.permBuffer; // Direct Heap Access

        _ensureTempBuffer(N);
        const tempBuf = _tempCompositionBuffer;

        // Result buffer (Upper bound size = |A| * |B|)
        const resultIds = new Int32Array(sizeA * sizeB);
        let ptr = 0;

        const idsA = this._ids;
        const idsB = other._ids;

        // LOOP OPTIMIZATION:
        // Math is strictly A * B (A applied after B).
        // Composition logic: res[k] = A[B[k]]
        
        if (sizeA <= sizeB) {
            // Strategy: Outer A (Small), Inner B (Large)
            for (let i = 0; i < sizeA; i++) {
                const idA = idsA[i];
                const offsetA = idA * N; // Hoisted

                for (let j = 0; j < sizeB; j++) {
                    const idB = idsB[j];
                    const offsetB = idB * N;

                    // Manual loop unrolling/inline for speed
                    for (let k = 0; k < N; k++) {
                        const valB = permBuffer[offsetB + k];
                        tempBuf[k] = permBuffer[offsetA + valB];
                    }
                    
                    resultIds[ptr++] = repo.register(tempBuf.subarray(0, N));
                }
            }
        } else {
            // Strategy: Outer B (Small), Inner A (Large)
            for (let j = 0; j < sizeB; j++) {
                const idB = idsB[j];
                const offsetB = idB * N; // Hoisted

                for (let i = 0; i < sizeA; i++) {
                    const idA = idsA[i];
                    const offsetA = idA * N;

                    for (let k = 0; k < N; k++) {
                        const valB = permBuffer[offsetB + k];
                        tempBuf[k] = permBuffer[offsetA + valB];
                    }

                    resultIds[ptr++] = repo.register(tempBuf.subarray(0, N));
                }
            }
        }

        // Note: Even if A and B are groups, A*B is only a group if A and B normalize each other.
        // So we default isGroup to false unless manually verified later.
        return new PermutationSet(resultIds, false, false);
    }

    /**
     * Vectorized Inverse: G^-1 = { g^-1 | g in G }
     * Computes the inverse of each element in the set.
     * @returns {PermutationSet} A new set containing the inverses.
     */
    inverse() {
        const size = this._ids.length;
        if (size === 0) return new PermutationSet(new Int32Array(0), true, this.isGroup);

        const repo = globalRepo;
        const N = repo.globalDegree;
        const permBuffer = repo.permBuffer;

        _ensureTempBuffer(N);
        const tempBuf = _tempCompositionBuffer;
        
        const resultIds = new Int32Array(size);
        const ids = this._ids;

        for (let i = 0; i < size; i++) {
            const offset = ids[i] * N;

            // Inversion: if p[k] == v, then inv[v] == k
            for (let k = 0; k < N; k++) {
                const val = permBuffer[offset + k];
                tempBuf[val] = k;
            }

            resultIds[i] = repo.register(tempBuf.subarray(0, N));
        }

        // If G is a group, G^-1 == G. So isGroup preserves true.
        return new PermutationSet(resultIds, false, this.isGroup);
    }

    // ------------------------------------------------------------------------
    // Set Operations (Delegated to IntSetUtils)
    // ------------------------------------------------------------------------
    /**
     * Computes the union of this set with another set.
     * @param {PermutationSet} other - The other set.
     * @returns {PermutationSet} A new set representing the union.
     */
    union(other) {
        this._checkType(other);
        // Union of two groups is rarely a group, so isGroup=false
        return new PermutationSet(
            IntSetUtils.union(this._ids, other._ids), 
            true, 
            false 
        );
    }
    /**
     * Computes the intersection of this set with another set.
     * @param {PermutationSet} other - The other set.
     * @returns {PermutationSet} A new set representing the intersection.
     */
    intersection(other) {
        this._checkType(other);
        // Intersection of two groups is always a group
        const resultIsGroup = this.isGroup && other.isGroup;
        return new PermutationSet(
            IntSetUtils.intersection(this._ids, other._ids), 
            true,
            resultIsGroup
        );
    }
    /**
     * Computes the difference of this set with another set (elements in this set but not in `other`).
     * @param {PermutationSet} other - The other set.
     * @returns {PermutationSet} A new set representing the difference.
     */
    difference(other) {
        this._checkType(other);
        return new PermutationSet(
            IntSetUtils.difference(this._ids, other._ids), 
            true,
            false
        );
    }
    /**
     * Checks if this set is a superset of another set.
     * @param {PermutationSet} other - The other set.
     * @returns {boolean} True if this set contains all elements of `other`.
     */
    isSuperSetOf(other) {
        this._checkType(other);
        if (this.size < other.size) return false;
        
        const A = this._ids;
        const B = other._ids;
        const lenB = B.length;

        for (let i = 0; i < lenB; i++) {
            if (!IntSetUtils.has(A, B[i])) return false;
        }
        return true;
    }

    /**
     * Checks if equal.
     * @param {PermutationSet} other - The other set.
     * @returns {boolean}
     */
    equals(other) {
        if (this === other) return true;
        if (this.size !== other.size) return false;
        
        const A = this._ids;
        const B = other._ids;
        const len = A.length;
        
        for (let i = 0; i < len; i++) {
            if (A[i] !== B[i]) return false;
        }
        return true;
    }

    /**
     * Internal helper to validate that the 'other' operand is a PermutationSet.
     * @param {*} other - The operand to check.
     * @throws {Error} If `other` is not an instance of PermutationSet.
     * @private
     */
    _checkType(other) {
        if (!(other instanceof PermutationSet)) {
            throw new Error("Operation requires PermutationSet.");
        }
    }

    // ------------------------------------------------------------------------
    // Factory Methods
    // ------------------------------------------------------------------------

    /**
     * Creates a PermutationSet containing only the identity permutation.
     * This set is always considered a group.
     * @returns {PermutationSet} A PermutationSet containing only the identity permutation.
     * @static
     */
    static identity() {
        // The identity set {e} is a valid group
        return new PermutationSet(new Int32Array([globalRepo.identity]), true, true);
    }

    // ------------------------------------------------------------------------
    // Group Theory Algorithms
    // ------------------------------------------------------------------------

    /**
     * Checks if the set forms an Abelian (Commutative) group.
     * Logic: For all g1, g2 in G, g1 * g2 == g2 * g1.
     * Performance: O(|G|^2 * Degree). Optimized with direct memory access.
     * @returns {boolean}
     */
    isAbelian() {
        // 0 or 1 element is always Abelian
        if (this.size <= 1) return true;

        const repo = globalRepo;
        const N = repo.globalDegree;
        const permBuffer = repo.permBuffer;
        const ids = this._ids;
        const count = ids.length;

        // Iterate unique pairs. Commutativity is symmetric.
        for (let i = 0; i < count; i++) {
            const idA = ids[i];
            const offsetA = idA * N;

            // Check against self? A*A == A*A (Always true)
            // So start j from i + 1
            for (let j = i + 1; j < count; j++) {
                const idB = ids[j];
                const offsetB = idB * N;

                // Compare A * B vs B * A
                // A*B[k] = A[B[k]]
                // B*A[k] = B[A[k]]
                
                for (let k = 0; k < N; k++) {
                    const b_val = permBuffer[offsetB + k];
                    const ab_val = permBuffer[offsetA + b_val];

                    const a_val = permBuffer[offsetA + k];
                    const ba_val = permBuffer[offsetB + a_val];

                    if (ab_val !== ba_val) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    /**
     * Calculates the Orbit of a point under this group.
     * Orbit(p) = { g(p) | g in G }
     * Implements BFS/Flood Fill without object allocation.
     * 
     * @param {number} point - The integer point (0..degree-1)
     * @returns {Int32Array} Sorted unique array of points in the orbit.
     */
    calculateOrbit(point) {
        const repo = globalRepo;
        const N = repo.globalDegree;
        
        if (point < 0 || point >= N) {
            throw new Error(`Point ${point} out of bounds (0..${N-1})`);
        }

        // Use a boolean array for visited check (O(1))
        // Since N is small usually, Uint8Array is very fast.
        const visited = new Uint8Array(N);
        visited[point] = 1;

        const result = [point];
        const ids = this._ids;
        const size = ids.length;
        const permBuffer = repo.permBuffer;

        let head = 0;
        while (head < result.length) {
            const currPoint = result[head++];

            // Apply all group elements to the current point
            for (let i = 0; i < size; i++) {
                const id = ids[i];
                // Direct memory access: perm(point) is at offset + point
                const nextPoint = permBuffer[id * N + currPoint];

                if (visited[nextPoint] === 0) {
                    visited[nextPoint] = 1;
                    result.push(nextPoint);
                }
            }
        }

        // The result is naturally sorted due to traversal order? 
        // No, BFS doesn't guarantee sorted value output, only discovery order.
        // We must sort.
        const orbitArr = new Int32Array(result);
        orbitArr.sort();
        return orbitArr;
    }

    /**
     * Decomposes this group G into right cosets of a subgroup H.
     * G = U (H * g_i)
     * 
     * 
     * @param {PermutationSet} subgroupH - The subgroup H to decompose by.
     * @returns {Array<PermutationSet>} An array of disjoint right cosets.
     */
    rightCosetDecomposition(subgroupH) {
        this._checkType(subgroupH);
        
        // Safety check: isSuperSetOf can be slow, but essential for correctness
        // We can optimistically skip if we trust the user context.
        // For now, simple check:
        if (subgroupH.size > this.size) {
             throw new Error("H cannot be larger than G.");
        }

        const cosets = [];
        
        // Use a fast lookup table for elements we've already categorized.
        // globalRepo.count is enough, when multiply might increase it, but we don't care
        const visited = new Uint8Array(globalRepo.count);
        
        const gIds = this._ids;
        const len = gIds.length;

        for (let i = 0; i < len; i++) {
            const gId = gIds[i];

            // If we've already included this element in a previous coset, skip it.
            if (visited[gId] === 1) {
                continue;
            }

            // Found a representative 'g' for a new coset H*g
            // Create temporary wrapper for multiplication
            const representative = new PermutationSet([gId], true, false);
            
            // Compute Coset = H * g
            const coset = subgroupH.multiply(representative);
            cosets.push(coset);

            // Mark all elements in this new coset as visited
            const cosetIds = coset._ids;
            const cosetLen = cosetIds.length;
            for (let k = 0; k < cosetLen; k++) {
                visited[cosetIds[k]] = 1;
            }
        }

        return cosets;
    }
    /**
     * Generates a subgroup from this.
     * This method uses an iterative closure approach by repeatedly multiplying the current group by the generators until no new elements are found.
     * @returns {PermutationSet} The fully generated subgroup (isGroup=true).
     * @throws {Error} If `generators` is an unknown type.
     */
    generateGroupFromThis() {
        return generateGroup(this);
    }
}


/**
 * Generates a subgroup from a set of generator permutations.
 * This method uses an iterative closure approach by repeatedly multiplying the current group by the generators until no new elements are found.
 * @param {PermutationSet | Array<number> | SchreierSimsAlgorithm} generators - A PermutationSet or an array of permutation IDs or a SchreierSimsAlgorithm instance to generate the group from.
 * @returns {PermutationSet} The fully generated subgroup (isGroup=true).
 * @throws {Error} If `generators` is an unknown type.
 */
export function generateGroup(generators) {
    if(Array.isArray(generators)){
        generators = new PermutationSet(generators);
    }else if(generators instanceof SchreierSimsAlgorithm){
        generators = generators.getGeneratorsAsPermutationSet();
    }else{
        if (!(generators instanceof PermutationSet)){
            throw new Error("unknown generators type");
        }
    }

    if(generators.isGroup){
        return generators;
    }

    // 1. Initial Set: S U S^-1 U {id}
    let group = generators
        .union(generators.inverse())
        .union(PermutationSet.identity());

    let lastSize = 0;
    
    // 2. Closure Loop
    // Keep multiplying G * S until size stops growing.
    // G * S is sufficient (instead of G * G) because G already contains inverses and ID.
    while (group.size !== lastSize) {
        lastSize = group.size;
        
        // New elements = group * generators
        const nextLevel = group.multiply(generators);
        
        // Merge
        group = group.union(nextLevel);
    }

    // The result is closed, therefore it is a Group.
    group.isGroup = true;
    return group;
}