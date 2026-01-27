/**
 * @jest-environment node
 */
import { IntSetUtils } from "../src/int-set-utils"

describe('IntSetUtils (Low-level Set Operations)', () => {
    
    // Helper to create Int32Array from standard array for readable tests
    const i32 = (arr) => new Int32Array(arr);

    describe('has()', () => {
        test('should find existing element', () => {
            const set = i32([1, 5, 10, 20]);
            expect(IntSetUtils.has(set, 1)).toBe(true);
            expect(IntSetUtils.has(set, 10)).toBe(true);
            expect(IntSetUtils.has(set, 20)).toBe(true);
        });

        test('should return false for non-existing element', () => {
            const set = i32([1, 5, 10]);
            expect(IntSetUtils.has(set, 0)).toBe(false); // too small
            expect(IntSetUtils.has(set, 6)).toBe(false); // middle
            expect(IntSetUtils.has(set, 11)).toBe(false); // too big
        });

        test('should handle empty array', () => {
            expect(IntSetUtils.has(i32([]), 1)).toBe(false);
        });
    });

    describe('union()', () => {
        test('should merge disjoint sets', () => {
            const a = i32([1, 3]);
            const b = i32([2, 4]);
            const res = IntSetUtils.union(a, b);
            expect(res).toEqual(i32([1, 2, 3, 4]));
        });

        test('should merge overlapping sets', () => {
            const a = i32([1, 2, 3]);
            const b = i32([2, 3, 4]);
            const res = IntSetUtils.union(a, b);
            expect(res).toEqual(i32([1, 2, 3, 4]));
        });

        test('should handle subset relationships', () => {
            const a = i32([1, 2]);
            const b = i32([1, 2, 3]);
            expect(IntSetUtils.union(a, b)).toEqual(i32([1, 2, 3]));
            expect(IntSetUtils.union(b, a)).toEqual(i32([1, 2, 3]));
        });

        test('should handle empty sets', () => {
            const a = i32([1, 2]);
            const empty = i32([]);
            expect(IntSetUtils.union(a, empty)).toEqual(a);
            expect(IntSetUtils.union(empty, a)).toEqual(a);
        });
    });

    describe('intersection()', () => {
        test('should return common elements', () => {
            const a = i32([1, 2, 5, 8]);
            const b = i32([2, 4, 5, 9]);
            expect(IntSetUtils.intersection(a, b)).toEqual(i32([2, 5]));
        });

        test('should return empty for disjoint sets', () => {
            const a = i32([1, 3]);
            const b = i32([2, 4]);
            const res = IntSetUtils.intersection(a, b);
            expect(res.length).toBe(0);
        });

        test('should handle subset', () => {
            const a = i32([1, 2, 3]);
            const b = i32([2]);
            expect(IntSetUtils.intersection(a, b)).toEqual(i32([2]));
        });
    });

    describe('difference()', () => {
        test('should return elements in A but not in B', () => {
            const a = i32([1, 2, 3, 4]);
            const b = i32([2, 4, 6]);
            // Expect [1, 3]
            expect(IntSetUtils.difference(a, b)).toEqual(i32([1, 3]));
        });

        test('should return empty if A is subset of B', () => {
            const a = i32([1, 2]);
            const b = i32([0, 1, 2, 3]);
            expect(IntSetUtils.difference(a, b).length).toBe(0);
        });

        test('should return A if disjoint', () => {
            const a = i32([1, 2]);
            const b = i32([3, 4]);
            expect(IntSetUtils.difference(a, b)).toEqual(a);
        });
    });

    describe('sortAndUnique()', () => {
        test('should sort and deduplicate raw input', () => {
            const raw = i32([3, 1, 2, 1, 3, 5]);
            const res = IntSetUtils.sortAndUnique(raw);
            expect(res).toEqual(i32([1, 2, 3, 5]));
        });

        test('should handle already sorted unique array', () => {
            const raw = i32([1, 2, 3]);
            const res = IntSetUtils.sortAndUnique(raw);
            expect(res).toEqual(i32([1, 2, 3]));
        });

        test('should handle single element', () => {
            const raw = i32([1]);
            expect(IntSetUtils.sortAndUnique(raw)).toEqual(i32([1]));
        });

        test('should handle all same elements', () => {
            const raw = i32([2, 2, 2]);
            expect(IntSetUtils.sortAndUnique(raw)).toEqual(i32([2]));
        });
    });
});
