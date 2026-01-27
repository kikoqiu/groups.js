/**
 * @fileoverview High-Performance Set Operations for Sorted Int32Arrays.
 * 
 * ASSUMPTIONS:
 * 1. All input arrays are SORTED in ascending order.
 * 2. All input arrays contain UNIQUE elements (no duplicates).
 * 3. Designed for zero-GC overhead where possible, though result arrays are allocated.
 */

/**
 * Provides high-performance utility functions for set operations on sorted Int32Arrays.
 * All functions assume input arrays are sorted and contain unique elements.
 * Designed for efficiency with minimal garbage collection overhead.
 * @namespace IntSetUtils
 */
export const IntSetUtils = {

    /**
     * Binary Search for value existence.
     * @param {Int32Array} sortedArr - The sorted array to search within.
     * @param {number} value - The value to search for.
     * @returns {boolean} True if the value is found in the array.
     */
    has(sortedArr, value) {
        let left = 0;
        let right = sortedArr.length - 1;

        while (left <= right) {
            const mid = (left + right) >>> 1;
            const v = sortedArr[mid];
            if (v === value) return true;
            if (v < value) left = mid + 1;
            else right = mid - 1;
        }
        return false;
    },

    /**
     * Computes the union of two sorted Int32Arrays (A U B).
     * The resulting array will contain all unique elements from both input arrays, sorted in ascending order.
     * Linear time complexity O(|A| + |B|).
     * @param {Int32Array} arrA - The first sorted Int32Array.
     * @param {Int32Array} arrB - The second sorted Int32Array.
     * @returns {Int32Array} A new sorted Int32Array containing the union of elements.
     */
    union(arrA, arrB) {
        const lenA = arrA.length;
        const lenB = arrB.length;
        
        // Fast paths
        if (lenA === 0) return arrB.slice();
        if (lenB === 0) return arrA.slice();

        // Worst case size is sum of both
        const res = new Int32Array(lenA + lenB);
        let i = 0, j = 0, k = 0;

        while (i < lenA && j < lenB) {
            const va = arrA[i];
            const vb = arrB[j];

            if (va < vb) {
                res[k++] = va;
                i++;
            } else if (va > vb) {
                res[k++] = vb;
                j++;
            } else {
                // Equal: add one, advance both
                res[k++] = va;
                i++; j++;
            }
        }

        // Copy remaining parts
        while (i < lenA) res[k++] = arrA[i++];
        while (j < lenB) res[k++] = arrB[j++];

        // Return exact fit (zero-copy view if possible, or slice)
        return res.subarray(0, k);
    },

    /**
     * Computes the intersection of two sorted Int32Arrays (A ∩ B).
     * The resulting array will contain only the elements common to both input arrays, sorted in ascending order.
     * Linear time complexity O(|A| + |B|).
     * @param {Int32Array} arrA - The first sorted Int32Array.
     * @param {Int32Array} arrB - The second sorted Int32Array.
     * @returns {Int32Array} A new sorted Int32Array containing the intersection of elements.
     */
    intersection(arrA, arrB) {
        const lenA = arrA.length;
        const lenB = arrB.length;
        
        // Result cannot be larger than the smallest input
        const res = new Int32Array(lenA < lenB ? lenA : lenB);
        let i = 0, j = 0, k = 0;

        while (i < lenA && j < lenB) {
            const va = arrA[i];
            const vb = arrB[j];

            if (va < vb) {
                i++;
            } else if (va > vb) {
                j++;
            } else {
                res[k++] = va;
                i++; j++;
            }
        }

        return res.subarray(0, k);
    },

    /**
     * Computes the difference of two sorted Int32Arrays (A - B).
     * The resulting array will contain elements present in `arrA` but not in `arrB`, sorted in ascending order.
     * Linear time complexity O(|A| + |B|).
     * @param {Int32Array} arrA - The minuend sorted Int32Array.
     * @param {Int32Array} arrB - The subtrahend sorted Int32Array.
     * @returns {Int32Array} A new sorted Int32Array containing the difference (A - B) of elements.
     */
    difference(arrA, arrB) {
        const lenA = arrA.length;
        const lenB = arrB.length;
        const res = new Int32Array(lenA);
        let i = 0, j = 0, k = 0;

        while (i < lenA && j < lenB) {
            const va = arrA[i];
            const vb = arrB[j];

            if (va < vb) {
                // In A, not in B -> Keep
                res[k++] = va;
                i++;
            } else if (va > vb) {
                // In B, not A -> Skip B
                j++;
            } else {
                // In both -> Skip both
                i++; j++;
            }
        }

        // Copy remaining A
        while (i < lenA) res[k++] = arrA[i++];

        return res.subarray(0, k);
    },

    /**
     * Sorts an Int32Array in ascending order and removes duplicate elements.
     * This function mutates the input array by sorting it in-place and then returns a subarray view
     * containing only the unique elements.
     * @param {Int32Array} rawArr - The Int32Array to sort and deduplicate. This array will be mutated.
     * @returns {Int32Array} A subarray view of the input `rawArr` containing sorted unique elements.
     */
    sortAndUnique(rawArr) {
        if (rawArr.length <= 1) return rawArr;

        // 1. Sort (Int32Array uses optimized native sort)
        rawArr.sort();

        // 2. Unique (Linear scan)
        let k = 0;
        const len = rawArr.length;
        
        for (let i = 0; i < len; i++) {
            // Always take first element, then take if different from previous
            if (i === 0 || rawArr[i] !== rawArr[i-1]) {
                rawArr[k++] = rawArr[i];
            }
        }

        return rawArr.subarray(0, k);
    }
};