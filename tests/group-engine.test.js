import { PermutationSet } from '../src/group-engine.js';
import { globalRepo } from '../src/permutation-repository.js';



describe('PermutationSet', () => {

    let id_e, id_r1, id_r2, id_f1, id_f2, id_f3;

    // Use beforeAll to set up the repository state once for all tests.
    // This ensures that IDs are predictable.
    beforeAll(() => {
        // S3 Permutations (degree 3)
        const p_e = [0, 1, 2];   // identity
        const p_r1 = [1, 2, 0];  // rotation
        const p_r2 = [2, 0, 1];  // rotation
        const p_f1 = [0, 2, 1];  // flip
        const p_f2 = [2, 1, 0];  // flip
        const p_f3 = [1, 0, 2];  // flip

        // Register all perms and store their deterministic IDs
        id_e = globalRepo.register(p_e);
        id_r1 = globalRepo.register(p_r1);
        id_r2 = globalRepo.register(p_r2);
        id_f1 = globalRepo.register(p_f1);
        id_f2 = globalRepo.register(p_f2);
        id_f3 = globalRepo.register(p_f3);
    });


    describe('Constructor and Basic Properties', () => {
        // 2. Test construction from a plain array
        test('should construct from a standard array of IDs', () => {
            const set = new PermutationSet([id_r2, id_r1]);
            expect(set.size).toBe(2);
            // 3. Test that constructor sorts the input array
            expect(set.indices).toEqual(new Int32Array([id_r1, id_r2]));
        });

        // 4. Test construction from an Int32Array
        test('should construct from an Int32Array', () => {
            const ids = new Int32Array([id_f1, id_f2, id_f3]);
            const set = new PermutationSet(ids);
            expect(set.size).toBe(3);
        });

        // 5. Test construction with duplicates
        test('should remove duplicates upon construction', () => {
            const set = new PermutationSet([id_r1, id_e, id_r1]);
            expect(set.size).toBe(2);
            expect(set.indices).toEqual(new Int32Array([id_e, id_r1]));
        });

        // 6. Test construction with an empty array
        test('should create an empty set', () => {
            const set = new PermutationSet([]);
            expect(set.size).toBe(0);
        });

        // 7. Test 'get' method
        test('should get the correct ID at a given index', () => {
            const set = new PermutationSet([id_e, id_f1, id_f2]);
            expect(set.get(1)).toBe(id_f1);
        });

        // 8. Test iterator
        test('should be iterable and yield IDs in sorted order', () => {
            const ids = [id_f2, id_e, id_r1];
            const set = new PermutationSet(ids);
            const iteratedIds = [...set];
            expect(iteratedIds).toEqual([id_e, id_r1, id_f2]);
        });
    });

    describe('Core Algebra', () => {
        // 9. Test multiplication
        test('should correctly multiply two sets (A3 * {f1})', () => {
            const A3 = new PermutationSet([id_e, id_r1, id_r2]); // Alternating group
            const f1_set = new PermutationSet([id_f1]);
            // A3 * f1 = {e*f1, r1*f1, r2*f1} = {f1, f2, f3}
            const result = A3.multiply(f1_set);
            const expected = new PermutationSet([id_f1, id_f2, id_f3]);
            expect(result.equals(expected)).toBe(true);
        });
        
        // 10. Test multiplication with identity
        test('should return the same set when multiplied by identity', () => {
            const rotations = new PermutationSet([id_r1, id_r2]);
            const identity = new PermutationSet([id_e]);
            const result = rotations.multiply(identity);
            expect(result.equals(rotations)).toBe(true);
        });

        // 11. Test multiplication with an empty set
        test('should return an empty set when multiplied by an empty set', () => {
            const set = new PermutationSet([id_r1, id_r2]);
            const empty = new PermutationSet([]);
            const result = set.multiply(empty);
            expect(result.size).toBe(0);
        });

        // 12. Test inverse
        test('should correctly compute the inverse of a set', () => {
            // r1^-1 = r2, r2^-1 = r1
            const set = new PermutationSet([id_r1]);
            const inv = set.inverse();
            const expected = new PermutationSet([id_r2]);
            expect(inv.equals(expected)).toBe(true);
        });

        // 13. Test double inverse
        test('should return the original set when inverted twice', () => {
            const set = new PermutationSet([id_r1, id_f1]);
            const doubleInv = set.inverse().inverse();
            expect(doubleInv.equals(set)).toBe(true);
        });

        // 14. Test identity factory
        test('should create a set containing only the identity permutation', () => {
            const identitySet = PermutationSet.identity(3);
            expect(identitySet.size).toBe(1);
            expect(identitySet.get(0)).toBe(id_e);
        });
    });

    describe('Set Operations', () => {
        let A, B, C;
        beforeEach(() => {
            A = new PermutationSet([id_e, id_r1]);
            B = new PermutationSet([id_r1, id_r2]);
            C = new PermutationSet([id_f1]);
        });

        // 15. Test union
        test('should compute the union of two sets', () => {
            const result = A.union(B);
            const expected = new PermutationSet([id_e, id_r1, id_r2]);
            expect(result.equals(expected)).toBe(true);
        });

        // 16. Test union with a disjoint set
        test('should compute the union with a disjoint set', () => {
            const result = A.union(C);
            const expected = new PermutationSet([id_e, id_r1, id_f1]);
            expect(result.equals(expected)).toBe(true);
        });

        // 17. Test intersection
        test('should compute the intersection of two sets', () => {
            const result = A.intersection(B);
            const expected = new PermutationSet([id_r1]);
            expect(result.equals(expected)).toBe(true);
        });

        // 18. Test intersection with no overlap
        test('should compute an empty intersection', () => {
            const result = A.intersection(C);
            expect(result.size).toBe(0);
        });

        // 19. Test difference
        test('should compute the difference of two sets (A - B)', () => {
            const result = A.difference(B);
            const expected = new PermutationSet([id_e]);
            expect(result.equals(expected)).toBe(true);
        });
    });

    describe('Comparison and Subsets', () => {
        let A, B;
        beforeEach(() => {
            A = new PermutationSet([id_e, id_r1]);
            B = new PermutationSet([id_e, id_r1, id_r2]);
        });
        
        // 20. Test equals
        test('should correctly check for equality', () => {
            const A_clone = new PermutationSet([id_e, id_r1]);
            expect(A.equals(A_clone)).toBe(true);
            expect(A.equals(B)).toBe(false);
        });

        // 21. Test isSuperSetOf (true case)
        test('should return true if it is a superset', () => {
            expect(B.isSuperSetOf(A)).toBe(true);
        });

        // 22. Test isSuperSetOf (false case)
        test('should return false if it is not a superset', () => {
            expect(A.isSuperSetOf(B)).toBe(false);
        });

        // 23. Test isSuperSetOf with self
        test('should return true when checking superset of itself', () => {
            expect(A.isSuperSetOf(A)).toBe(true);
        });
    });

    describe('Slice', () => {
        let set;
        beforeEach(() => {
            set = new PermutationSet([id_e, id_r1, id_r2, id_f1, id_f2]);
        });

        // 24. Test slice
        test('should create a lightweight slice of the set', () => {
            const slice = set.slice(1, 3);
            expect(slice).toBeInstanceOf(PermutationSet);
            expect(slice.size).toBe(2);
            expect(slice.indices).toEqual(new Int32Array([id_r1, id_r2]));
        });

        // 25. Test slice to the end
        test('should slice to the end of the set if no end is provided', () => {
            const slice = set.slice(3);
            const expected = new PermutationSet([id_f1, id_f2]);
            expect(slice.equals(expected)).toBe(true);
        });
    });
});
