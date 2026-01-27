import { 
    parseCycles, 
    decomposeToCycles, 
    createSymmetric, 
    createAlternating, 
    createCyclic, 
    createDihedral, 
    createKleinFour, 
    createFromCycleStrings,
    createDirectProduct, 
    createQuaternion, 
    createTrivial,
    createTetrahedral,
    createOctahedral,
    createIcosahedral,
    createFromRawArrays
} from '../src/group-utils.js';
import {analyzeGenerators} from "../src/group-structural-utils.js"
import { globalRepo } from '../src/permutation-repository.js';
import { PermutationSet, generateGroup } from '../src/group-engine.js';
import { SchreierSimsAlgorithm } from '../src/schreier-sims.js';

describe('Group Theory Utils', () => {

    // Helper to convert Int32Array to standard array for easier assertion
    const toArr = (typedArr) => Array.from(typedArr);

    // ========================================================================
    // 1. Cycle Notation Parser Tests (parseCycles)
    // ========================================================================
    
    test('1. parseCycles: parses a simple cycle (1 2 3)', () => {
        const result = parseCycles('(1 2 3)');
        // 1->2, 2->3, 3->1 (0-based: 0->1, 1->2, 2->0)
        expect(toArr(result)).toEqual([1, 2, 0]);
    });

    test('2. parseCycles: parses disjoint cycles (1 2)(3 4)', () => {
        const result = parseCycles('(1 2)(3 4)');
        // 1->2, 2->1, 3->4, 4->3
        expect(toArr(result)).toEqual([1, 0, 3, 2]);
    });
    test('2.1 parseCycles: parses disjoint cycles (1,2)(3, 4)', () => {
        const result = parseCycles('(1,2)(3, 4)');
        // 1->2, 2->1, 3->4, 4->3
        expect(toArr(result)).toEqual([1, 0, 3, 2]);
    });

    test('3. parseCycles: handles single element cycles (fixed points) implicit', () => {
        // (1 3) implies 2 is fixed if degree is inferred as 3
        const result = parseCycles('(1 3)');
        expect(toArr(result)).toEqual([2, 1, 0]);
    });

    test('4. parseCycles: respects explicit larger degree', () => {
        const result = parseCycles('(1 2)', 4);
        // Degree 4: [1, 0, 2, 3]
        expect(toArr(result)).toEqual([1, 0, 2, 3]);
        expect(result.length).toBe(4);
    });

    test('5. parseCycles: returns identity for empty string', () => {
        const result = parseCycles('', 3);
        expect(toArr(result)).toEqual([0, 1, 2]);
    });

    test('6. parseCycles: returns identity for "()" string', () => {
        const result = parseCycles('()', 3);
        expect(toArr(result)).toEqual([0, 1, 2]);
    });

    test('7. parseCycles: handles loose whitespace formatting', () => {
        const result = parseCycles(' ( 1   2 ) (3 4 ) ');
        expect(toArr(result)).toEqual([1, 0, 3, 2]);
    });

    // ========================================================================
    // 2. Cycle Notation Formatter Tests (decomposeToCycles)
    // ========================================================================

    test('8. decomposeToCycles: formats identity as "()"', () => {
        const id = new Int32Array([0, 1, 2]);
        expect(decomposeToCycles(id)).toBe('()');
    });

    test('9. decomposeToCycles: formats simple cycle', () => {
        const perm = new Int32Array([1, 2, 0]); // (1 2 3)
        expect(decomposeToCycles(perm)).toBe('(1 2 3)');
    });

    test('10. decomposeToCycles: formats disjoint cycles', () => {
        const perm = new Int32Array([1, 0, 3, 2]); // (1 2)(3 4)
        const str = decomposeToCycles(perm);
        // Note: Implementation doesn't strictly guarantee order, but logic usually follows index
        expect(['(1 2)(3 4)', '(3 4)(1 2)']).toContain(str);
    });

    test('11. decomposeToCycles: omits fixed points', () => {
        const perm = new Int32Array([0, 2, 1, 3]); // 1 fixed, 4 fixed, swap 2-3
        expect(decomposeToCycles(perm)).toBe('(2 3)');
    });

    test('12. decomposeToCycles: works with Permutation ID from repo', () => {
        const arr = new Int32Array([1, 0]);
        const id = globalRepo.register(arr);
        expect(decomposeToCycles(id)).toBe('(1 2)');
    });

    // ========================================================================
    // 3. Symmetric Group Generators (createSymmetric)
    // ========================================================================

    test('13. createSymmetric: S1 is Identity', () => {
        const set = createSymmetric(1);
        expect(set.size).toBe(1); // Only identity
        expect(globalRepo.get(set.get(0))[0]).toBe(0);
    });

    test('14. createSymmetric: S2 contains only swap generator', () => {
        const set = createSymmetric(2);
        expect(set.size).toBe(1); // Just (1 2), cycle is same as swap in S2
        const gen = globalRepo.getAsCycles(set.get(0));
        expect(gen).toBe('(1 2)');
    });

    test('15. createSymmetric: S3 has 2 generators (swap and long cycle)', () => {
        const set = createSymmetric(3);
        expect(set.size).toBe(2);
        const gens = Array.from(set.indices).map(id => globalRepo.getAsCycles(id));
        expect(gens).toContain('(1 2)');
        expect(gens).toContain('(1 2 3)');
    });

    test('16. createSymmetric: S4 generators correct', () => {
        const set = createSymmetric(4);
        expect(set.size).toBe(2);
        const gens = Array.from(set.indices).map(id => globalRepo.getAsCycles(id));
        expect(gens).toContain('(1 2)');
        expect(gens).toContain('(1 2 3 4)');
    });

    // ========================================================================
    // 4. Alternating Group Generators (createAlternating)
    // ========================================================================

    test('17. createAlternating: A1 and A2 are Identity', () => {
        const a1 = createAlternating(1);
        const a2 = createAlternating(2);
        expect(a1.size).toBe(1);
        expect(a2.size).toBe(1); // A2 is order 1 (2!/2 = 1)
    });

    test('18. createAlternating: A3 generated by (1 2 3)', () => {
        const set = createAlternating(3);
        // Generators are (1 2 i) for i=3..n. For n=3, just (1 2 3)
        expect(set.size).toBe(1);
        expect(globalRepo.getAsCycles(set.get(0))).toBe('(1 2 3)');
    });

    test('19. createAlternating: A4 generators are 3-cycles', () => {
        const set = createAlternating(4);
        // Generators: (1 2 3), (1 2 4)
        expect(set.size).toBe(2);
        const gens = Array.from(set.indices).map(id => globalRepo.getAsCycles(id));
        expect(gens).toContain('(1 2 3)');
        expect(gens).toContain('(1 2 4)');
    });

    // ========================================================================
    // 5. Cyclic Group Generators (createCyclic)
    // ========================================================================

    test('20. createCyclic: C1 is Identity', () => {
        const set = createCyclic(1);
        expect(set.size).toBe(1);
    });

    test('21. createCyclic: C4 generator is long cycle', () => {
        const set = createCyclic(4);
        expect(set.size).toBe(1);
        expect(globalRepo.getAsCycles(set.get(0))).toBe('(1 2 3 4)');
    });

    // ========================================================================
    // 6. Dihedral Group Generators (createDihedral)
    // ========================================================================

    test('22. createDihedral: D1/D2 fallback to Symmetric', () => {
        const d2 = createDihedral(2);
        expect(d2.size).toBe(1); // Equivalent to S2
        expect(globalRepo.getAsCycles(d2.get(0))).toBe('(1 2)');
    });

    test('23. createDihedral: D3 has Rotation and Reflection', () => {
        const set = createDihedral(3);
        expect(set.size).toBe(2);
        const gens = Array.from(set.indices).map(id => globalRepo.getAsCycles(id));
        // Rotation (1 2 3)
        expect(gens).toContain('(1 2 3)');
        // Reflection: Fix 1, 2<->3 => (2 3)
        expect(gens).toContain('(2 3)');
    });

    test('24. createDihedral: D4 Reflection Logic', () => {
        const set = createDihedral(4);
        // D4 Ref: 1 fixed. k -> n-k+2.
        // 2 -> 4-2+2 = 4 (mod 4 adj) -> 4
        // 3 -> 4-3+2 = 3 (fixed)
        // 4 -> 4-4+2 = 2
        // Actually, logic in code: 0->0, i -> n-i.
        // 0(1) -> 0(1)
        // 1(2) -> 3(4)
        // 2(3) -> 2(3)
        // 3(4) -> 1(2)
        // So swap (2 4).
        const gens = Array.from(set.indices).map(id => globalRepo.getAsCycles(id));
        expect(gens).toContain('(1 2 3 4)'); // Rot
        expect(gens).toContain('(2 4)');     // Ref
    });

    // ========================================================================
    // 7. Klein Four-Group (createKleinFour)
    // ========================================================================

    test('25. createKleinFour: Returns 2 generators', () => {
        const set = createKleinFour();
        expect(set.size).toBe(2);
    });

    test('26. createKleinFour: Generators are disjoint transpositions', () => {
        const set = createKleinFour();
        const gens = Array.from(set.indices).map(id => globalRepo.getAsCycles(id));
        expect(gens).toContain('(1 2)(3 4)');
        expect(gens).toContain('(1 3)(2 4)');
    });

    // ========================================================================
    // 8. Integration & Helpers (createFromCycleStrings)
    // ========================================================================

    test('27. createFromCycleStrings: parses list correctly', () => {
        const set = createFromCycleStrings(['(1 2)', '(3 4)'], 4);
        expect(set.size).toBe(2);
        const gens = Array.from(set.indices).map(id => globalRepo.getAsCycles(id));
        expect(gens).toContain('(1 2)');
        expect(gens).toContain('(3 4)');
    });

    test('28. createFromCycleStrings: auto-detects degree', () => {
        const set = createFromCycleStrings(['(1 2 3 4 5)']);
        const permId = set.get(0);
        // Should have length 5 in repo
        expect(globalRepo.get(permId).length).toBeGreaterThanOrEqual(5);
    });

    // ========================================================================
    // 9. Round Trip Integrity
    // ========================================================================

    test('29. Round Trip: Parse -> Decompose -> Parse', () => {
        const originalStr = '(1 5)(2 3)';
        const permArr = parseCycles(originalStr, 6);
        const decomposed = decomposeToCycles(permArr);
        // Note: Formatting might reorder disjoint cycles, e.g. (2 3)(1 5)
        // Check structural equality by re-parsing
        const roundTripArr = parseCycles(decomposed, 6);
        expect(toArr(roundTripArr)).toEqual(toArr(permArr));
    });

    test('30. Generator Result Type', () => {
        const set = createSymmetric(3);
        expect(set).toBeInstanceOf(PermutationSet);
        // Generators are not necessarily a group yet (unless generated)
        expect(set.isGroup).toBe(false); 
    });

});




describe('Advanced Group Utils', () => {

    // Helper to calculate order using SSA
    const getOrder = (groupSet) => {
        const algo = SchreierSimsAlgorithm.compute(groupSet);
        return Number(algo.order); // Cast BigInt to Number for simple assertions
    };

    // ========================================================================
    // 1. Direct Product Tests
    // ========================================================================

    test('createDirectProduct: C2 x C2 (Klein 4)', () => {
        const c2_a = createCyclic(2); // (0 1)
        const c2_b = createCyclic(2); // (0 1) acting on separate points

        // Should act on 2+2=4 points
        const klein4 = createDirectProduct(c2_a, c2_b);
        
        expect(klein4.size).toBe(2); // 2 generators: (0 1) and (2 3)
        expect(getOrder(klein4)).toBe(4);
        
        // Verify disjoint action
        const genA = globalRepo.get(klein4.get(0));
        const genB = globalRepo.get(klein4.get(1));
        
        // Sorting usually puts (0 1) before (2 3), but let's check content regardless of order
        // One generator should move 0,1 and fix 2,3
        // One generator should fix 0,1 and move 2,3
        const movesLow = (arr) => arr[0] !== 0 || arr[1] !== 1;
        const movesHigh = (arr) => arr[2] !== 2 || arr[3] !== 3;

        const hasGenA = [genA, genB].some(g => movesLow(g) && !movesHigh(g));
        const hasGenB = [genA, genB].some(g => !movesLow(g) && movesHigh(g));

        expect(hasGenA).toBe(true);
        expect(hasGenB).toBe(true);
    });

    test('createDirectProduct: S3 x S2', () => {
        const s3 = createSymmetric(3); // Order 6
        const s2 = createSymmetric(2); // Order 2
        
        const g = createDirectProduct(s3, s2);
        
        // Order should be 6 * 2 = 12
        expect(getOrder(g)).toBe(12);
        
        // Degree should be 3 + 2 = 5
        const gens = Array.from(g.indices).map(id => globalRepo.get(id));
        const maxLen = Math.max(...gens.map(a => a.length));
        expect(maxLen).toBeGreaterThanOrEqual(5);
        
        // S3 generators (size 2) + S2 generator (size 1) = 3 generators total
        expect(g.size).toBe(3);
    });

    test('createDirectProduct: Handles identity correctly', () => {
        const triv = createTrivial();
        const c2 = createCyclic(2);
        
        const g = createDirectProduct(c2, triv);
        expect(getOrder(g)).toBe(2);
        // Degree should effectively be 2 + 1 = 3 (Trivial usually degree 1)
    });

    // ========================================================================
    // 2. Quaternion Group Tests (Q8)
    // ========================================================================

    test('createQuaternion: Basic properties', () => {
        const q8 = createQuaternion();
        const algo = SchreierSimsAlgorithm.compute(q8);
        
        expect(Number(algo.order)).toBe(8);
        expect(q8.size).toBe(2); // Generated by i, j
    });

    test('createQuaternion: Non-abelian check', () => {
        const q8 = createQuaternion();
        expect(q8.isAbelian()).toBe(false);
    });

    test('createQuaternion: Element orders', () => {
        const q8 = createQuaternion();
        const algo = SchreierSimsAlgorithm.compute(q8);
        
        // Generate full group elements
        const elements = generateGroup(q8);
        
        let order4Count = 0;
        let order2Count = 0; // -1 has order 2
        
        for(const id of elements) {
            if (id === globalRepo.identity) continue;
            
            // Check order by squaring
            const sq = algo.multiply(id, id);
            if (sq === globalRepo.identity) {
                order2Count++;
            } else {
                // If sq != id but sq^2 == id, then order 4
                const fourth = algo.multiply(sq, sq);
                if (fourth === globalRepo.identity) {
                    order4Count++;
                }
            }
        }
        
        // Q8 structure: 1 (order 1), -1 (order 2), ±i, ±j, ±k (6 elements of order 4)
        expect(order2Count).toBe(1);
        expect(order4Count).toBe(6);
    });

    // ========================================================================
    // 3. Geometric / Trivial / Raw Tests
    // ========================================================================

    test('createTrivial', () => {
        const e = createTrivial();
        expect(e.size).toBe(1);
        expect(e.get(0)).toBe(globalRepo.identity);
    });

    test('Geometric Aliases', () => {
        expect(getOrder(createTetrahedral())).toBe(12); // A4
        expect(getOrder(createOctahedral())).toBe(24);  // S4
        expect(getOrder(createIcosahedral())).toBe(60); // A5
    });

    test('createFromRawArrays', () => {
        // Create S3 manually: (1 2), (1 2 3)
        // 0-based: [1, 0, 2], [1, 2, 0]
        const arrays = [
            [1, 0, 2],
            [1, 2, 0]
        ];
        const g = createFromRawArrays(arrays);
        expect(getOrder(g)).toBe(6);
        expect(globalRepo.getAsCycles(g.get(0))).toMatch(/(\(1 2\))|(\(1 2 3\))/);
    });

});



describe('analyzeGenerators Tests', () => {

    // Helper to extract IDs from a set
    const getIds = (set) => Array.from(set.indices);

    // ========================================================================
    // 1. analyzeGenerators
    // ========================================================================

    test('1. analyzeGenerators: Identifies minimal generators for S3', () => {
        const s3 = createSymmetric(3);
        const allIds = getIds(s3);
        
        const { fundamental, redundant } = analyzeGenerators(allIds);
        
        expect(fundamental.length).toBe(2);
        expect(redundant.length).toBe(0);
    });

    test('2. analyzeGenerators: Handles Identity-only input', () => {
        const id = globalRepo.identity;
        const { fundamental, redundant } = analyzeGenerators([id]);
        
        expect(fundamental.length).toBe(0);
        expect(redundant).toEqual([id]);
    });

    test('3. analyzeGenerators: Respects input order for stability', () => {
        // Input: (1 2), (1 2 3), (1 3)
        // (1 2) -> Keep
        // (1 2 3) -> Keep (extends group)
        // (1 3) -> Redundant (in <(1 2), (1 2 3)>)
        const p1 = globalRepo.register([1, 0, 2]); // (1 2)
        const p2 = globalRepo.register([1, 2, 0]); // (1 2 3)
        const p3 = globalRepo.register([2, 1, 0]); // (1 3)
        
        const { fundamental, redundant } = analyzeGenerators([p1, p2, p3]);
        
        expect(fundamental).toEqual([p1, p2]);
        expect(redundant).toEqual([p3]);
    });

    test('4. analyzeGenerators: Minimal check for C4', () => {
        const c4 = createCyclic(4);
        const ids = getIds(c4);
        const { fundamental } = analyzeGenerators(ids);
        // C4 needs 1 generator
        expect(fundamental.length).toBe(1);
    });
});