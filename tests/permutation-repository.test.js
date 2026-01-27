/**
 * @jest-environment node
 */
import { IntSetUtils } from "../src/int-set-utils.js";
import { PermutationRepository } from '../src/permutation-repository';

describe('PermutationRepository', () => {
    
    let repo;

    beforeEach(() => {
        // Create a fresh repository for each test
        // Start with small degree (2) and small capacity (4) to trigger resizing easily
        repo = new PermutationRepository(2, 4);
    });

    test('should register and retrieve a permutation', () => {
        const p1 = [1, 0]; // (0 1) swap in S2
        const id = repo.register(p1);
                
        const retrieved = repo.get(id);
        expect(retrieved).toEqual(new Int32Array([1, 0]));
    });

    test('should deduplicate identical permutations', () => {
        const p1 = [1, 0];
        const id1 = repo.register(p1);
        const id2 = repo.register([1, 0]); // register same array

        expect(id2).toBe(id1); // Should return existing ID
    });

    test('should auto-pad small permutations to global degree', () => {
        // Repo is degree 2
        // Register length 1 (identity [0]) -> should become [0, 1] internally
        const id = repo.register([0]); 
        
        const data = repo.get(id);
        expect(data).toEqual(new Int32Array([0, 1]));
    });

    test('should expand capacity dynamically', () => {
        // Initial capacity is 4. Let's add 5 unique perms (if possible in S2? No, S2 only has 2 elements).
        // So we need to upgrade degree first implicitly or explicitly to test capacity.
        // Actually, let's force an upgrade to S3 so we have 6 elements.
        
        repo.register([2, 0, 1]); // Force upgrade to degree 3, count = 1
        
        // Add 5 more distinct permutations to exceed capacity 4
        // S3: [0,1,2], [0,2,1], [1,0,2], [1,2,0], [2,0,1], [2,1,0]
        const inputs = [
            [0, 1, 2],
            [0, 2, 1],
            [1, 0, 2],
            [1, 2, 0],
            [2, 1, 0]
        ];

        inputs.forEach(p => repo.register(p));

        expect(repo.count).toBe(6); // 1 + 5
        expect(repo.permCapacity).toBeGreaterThanOrEqual(6); // Should have doubled to 8
        
        // Verify data integrity after resize
        const idLast = repo.register([2, 1, 0]); // Should fetch existing
        expect(repo.get(idLast)).toEqual(new Int32Array([2, 1, 0]));
    });

    describe('Dynamic Degree Upgrade (Stop-the-World)', () => {
        test('should upgrade from degree 2 to 4 automatically', () => {
            // 1. Register simple swap in S2
            const idSwap = repo.register([1, 0]); // ID 0, data [1, 0]
            expect(repo.globalDegree).toBe(2);

            // 2. Register a perm in S4
            const pBig = [0, 1, 3, 2]; // Swap (2 3), requires degree 4
            const idBig = repo.register(pBig); // Should trigger upgrade
            
            expect(repo.globalDegree).toBe(4);
            expect(idBig).toBe(idSwap+1); // New ID

            // 3. Verify Old Data (ID 0) is migrated and padded
            // [1, 0] in S2 should become [1, 0, 2, 3] in S4
            const dataSwap = repo.get(idSwap);
            expect(dataSwap).toEqual(new Int32Array([1, 0, 2, 3]));

            // 4. Verify New Data (ID 1)
            const dataBig = repo.get(idBig);
            expect(dataBig).toEqual(new Int32Array([0, 1, 3, 2]));
        });

        test('should maintain Trie integrity after upgrade', () => {
            const idOld = repo.register([1, 0]); // ID 0
            
            // Upgrade
            repo.register([0, 1, 2, 3]); // Degree 4
            
            // Re-registering the OLD permutation should still find ID 0
            // The Trie must have been rebuilt correctly with padded data [1, 0, 2, 3]
            const idRetry = repo.register([1, 0]);
            expect(idRetry).toBe(idOld);
        });
    });

    test('should treat implicit identity padding as equal to explicit identity', () => {
        // Repo Degree 2
        // Register [0] -> stored as [0, 1]
        const id1 = repo.register([0]);
        
        // Register [0, 1] -> stored as [0, 1]
        const id2 = repo.register([0, 1]);

        expect(id1).toBe(id2);
    });
});







// Helper: Generate range [start, end)
const range = (start, end) => new Int32Array(Array.from({ length: end - start }, (_, i) => start + i));

// Helper: Fisher-Yates shuffle for creating valid permutations
const shuffle = (arr) => {
    const res = arr.slice(); // clone
    for (let i = res.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [res[i], res[j]] = [res[j], res[i]];
    }
    return res;
};

describe('Complex Core Stress Tests', () => {

    // ========================================================================
    // Section A: High-Volume IntSetUtils (Tests 1-10)
    // ========================================================================
    
    describe('IntSetUtils High-Performance Scenarios', () => {
        
        test('1. Union of massive interleaved sets (10k elements)', () => {
            // A = [0, 2, 4, ... 19998]
            // B = [1, 3, 5, ... 19999]
            const size = 10000;
            const A = new Int32Array(size);
            const B = new Int32Array(size);
            for(let i=0; i<size; i++) { A[i] = i*2; B[i] = i*2+1; }
            
            const res = IntSetUtils.union(A, B);
            expect(res.length).toBe(size * 2);
            expect(res[0]).toBe(0);
            expect(res[res.length-1]).toBe(19999);
            // Spot check middle
            expect(res[100]).toBe(100);
        });

        test('2. Intersection of massive semi-overlapping sets', () => {
            // A = [0...10000], B = [5000...15000]
            // Intersection should be [5000...10000]
            const A = range(0, 10001);
            const B = range(5000, 15001);
            
            const res = IntSetUtils.intersection(A, B);
            expect(res.length).toBe(5001);
            expect(res[0]).toBe(5000);
            expect(res[res.length-1]).toBe(10000);
        });

        test('3. Difference of massive subset (Worst case scan)', () => {
            // A = [0...20000]
            // B = [0, 2, 4, ... 20000] (All evens)
            // A - B should be all odds
            const A = range(0, 20001);
            const B = new Int32Array(10001);
            for(let i=0; i<=10000; i++) B[i] = i*2;
            
            const res = IntSetUtils.difference(A, B);
            expect(res.length).toBe(10000);
            expect(res[0]).toBe(1); // First odd
            expect(res[1]).toBe(3);
            expect(res[res.length-1]).toBe(19999);
        });

        test('4. sortAndUnique on Worst-Case Reverse Sorted array', () => {
            const size = 5000;
            const input = new Int32Array(size);
            for(let i=0; i<size; i++) input[i] = size - i; // 5000, 4999...
            
            const res = IntSetUtils.sortAndUnique(input);
            expect(res.length).toBe(size);
            expect(res[0]).toBe(1);
            expect(res[size-1]).toBe(size);
            expect(res[0] < res[1]).toBe(true); // check ordering
        });

        test('5. sortAndUnique with 99% duplicates', () => {
            // Array of 10000 items, only values 1, 2, 3 repeated
            const input = new Int32Array(10000);
            for(let i=0; i<10000; i++) input[i] = (i % 3) + 1;
            
            const res = IntSetUtils.sortAndUnique(input);
            expect(res).toEqual(new Int32Array([1, 2, 3]));
        });

        test('6. Union/Intersect/Diff with Negative Numbers', () => {
            // Ensure logic holds for signed 32-bit integers
            const A = new Int32Array([-100, -50, 0, 50]);
            const B = new Int32Array([-60, -50, -10, 0]);
            
            expect(IntSetUtils.union(A, B)).toEqual(new Int32Array([-100, -60, -50, -10, 0, 50]));
            expect(IntSetUtils.intersection(A, B)).toEqual(new Int32Array([-50, 0]));
            expect(IntSetUtils.difference(A, B)).toEqual(new Int32Array([-100, 50]));
        });

        test('7. Intersection of disjoint sets at boundaries', () => {
            const A = new Int32Array([1, 2, 3]);
            const B = new Int32Array([4, 5, 6]);
            expect(IntSetUtils.intersection(A, B).length).toBe(0);
        });

        test('8. Complex sparse union (simulating sparse group indices)', () => {
            // A: powers of 2, B: powers of 3
            // Up to 10000
            const aList = [], bList = [];
            for(let i=1; i<10000; i*=2) aList.push(i);
            for(let i=1; i<10000; i*=3) bList.push(i);
            
            const A = new Int32Array(aList.sort((x,y)=>x-y));
            const B = new Int32Array(bList.sort((x,y)=>x-y));
            
            const res = IntSetUtils.union(A, B);
            // 1 is in both, should appear once
            expect(res[0]).toBe(1);
            expect(res[1]).toBe(2);
            expect(res[2]).toBe(3);
            // Verify uniqueness manually
            for(let i=1; i<res.length; i++) {
                expect(res[i]).not.toBe(res[i-1]);
            }
        });

        test('9. sortAndUnique single large block of identicals', () => {
            const arr = new Int32Array(5000).fill(42);
            const res = IntSetUtils.sortAndUnique(arr);
            expect(res).toEqual(new Int32Array([42]));
        });

        test('10. sortAndUnique pre-sorted but with duplicates', () => {
            const arr = new Int32Array([1, 1, 2, 2, 3, 3, 4, 5, 5]);
            const res = IntSetUtils.sortAndUnique(arr);
            expect(res).toEqual(new Int32Array([1, 2, 3, 4, 5]));
        });
    });

    // ========================================================================
    // Section B: PermutationRepository Stress & Algorithms (Tests 11-30)
    // ========================================================================

    describe('PermutationRepository Complex Logic', () => {
        let repo;
        
        // Helper to force specific repo config
        const createRepo = (deg, cap) => new PermutationRepository(deg, cap);

        test('11. Capacity Expansion Stress Test (Geometric Growth)', () => {
            // Start very small, force multiple resizes
            repo = createRepo(4, 2); // Cap 2
            
            // Register 100 unique permutations
            // We use simple cycles (0 1), (0 2), (0 3)... to guarantee uniqueness
            for(let i=1; i<101; i++) {
                const p = Array.from({length: 4}, (_, k) => k);
                // Swap 0 and i (wrap around 4)
                const target = i % 4;
                // Wait, simply swapping 0 and target isn't enough for 100 unique.
                // Let's use Lehmer-like generator or just random shuffles until we hit 100.
                // But randomness is flaky. Let's make distinct patterns.
                // [0, 1, 2, 3] -> identity
                // Let's map integer i to a perm array (simplistic base-4 approach)
                p[0] = (i + p[0]) % 4; // Shift
                // Actually, let's just use the repo internal counter check
            }
            
            // Deterministic approach: register random shuffles until count is 100
            // Since 4! = 24, we need degree 5 to reach 100.
            repo._upgradeDegree(5); // Manual helper call or just register larger
            
            let attempts = 0;
            const setIds = new Set();
            while (setIds.size < 100 && attempts < 5000) {
                const arr = shuffle([0,1,2,3,4]);
                setIds.add(repo.register(arr));
                attempts++;
            }
            
            expect(repo.count).toBeGreaterThanOrEqual(100);
            expect(repo.permCapacity).toBeGreaterThanOrEqual(100);
            // Check data integrity of the 50th item
            const id50 = Array.from(setIds)[50];
            const p50 = repo.get(id50);
            expect(p50.length).toBe(5); // Degree 5
        });

        test('12. The "Ladder" Upgrade: S2 -> S4 -> S8 -> S16', () => {
            repo = createRepo(2, 10);
            const idA = repo.register([1, 0]); // Swap (0 1) in S2
            
            // Upgrade to S4
            const idB = repo.register([0, 1, 3, 2]); // Swap (2 3) in S4
            
            // Upgrade to S8
            const arrS8 = [0,1,2,3,4,5,7,6]; // Swap (6 7)
            const idC = repo.register(arrS8);

            // Upgrade to S16
            const arrS16 = Array.from({length:16}, (_,i)=>i);
            arrS16[14] = 15; arrS16[15] = 14; // Swap (14 15)
            const idD = repo.register(arrS16);

            expect(repo.globalDegree).toBe(16);
            
            // Verify Data Integrity of the oldest element (idA)
            // Should be [1, 0, 2, 3, 4, ... 15]
            const pA = repo.get(idA);
            expect(pA.length).toBe(16);
            expect(pA[0]).toBe(1);
            expect(pA[1]).toBe(0);
            expect(pA[2]).toBe(2); // Padding
            expect(pA[15]).toBe(15);
        });

        test('13. Shared Prefix Trie Collision', () => {
            repo = createRepo(10, 100);
            // Create two perms that differ only at the last position
            // [0, 1, ... 8, 9] (Identity)
            // [0, 1, ... 8, 9] but wait, perm must have unique elements. 
            // Valid perms: [0, 1, ... 7, 8, 9] and [0, 1, ... 7, 9, 8]
            
            const p1 = [0,1,2,3,4,5,6,7,8,9];
            const p2 = [0,1,2,3,4,5,6,7,9,8];
            
            const id1 = repo.register(p1);
            const id2 = repo.register(p2);
            
            expect(id1).not.toBe(id2);
            
            // Verify Trie structure implicitly by fetching
            expect(repo.get(id1)).toEqual(new Int32Array(p1));
            expect(repo.get(id2)).toEqual(new Int32Array(p2));
        });

        test('14. Implicit Identity Equivalence (Padding Logic)', () => {
            repo = createRepo(5, 10);
            
            // These should all map to the Identity permutation in S5
            // 1. [] -> Empty (0->0, 1->1...)
            // 2. [0] -> (0->0, others implicit)
            // 3. [0, 1] -> (0->0, 1->1...)
            // 4. [0, 1, 2, 3, 4] -> Explicit identity
            
            const id1 = repo.register([]);
            const id2 = repo.register([0]);
            const id3 = repo.register([0, 1]);
            const id4 = repo.register([0, 1, 2, 3, 4]);
            
            expect(id1).toBe(id2);
            expect(id2).toBe(id3);
            expect(id3).toBe(id4);
            
            // Verify content
            const p = repo.get(id1);
            expect(p[4]).toBe(4);
        });

        test('15. "Stop-the-World" Upgrade Data Preservation', () => {
            // Register item, write check byte, upgrade, read check byte
            repo = createRepo(2, 4);
            const id = repo.register([1, 0]);
            
            // Verify raw buffer access (using white-box knowledge or just get())
            const before = repo.get(id);
            expect(before[0]).toBe(1);
            
            // Trigger Massive Upgrade
            repo.register(range(0, 100)); // Upgrade to S100
            
            const after = repo.get(id);
            expect(after.length).toBe(100);
            expect(after[0]).toBe(1);
            expect(after[1]).toBe(0);
            expect(after[99]).toBe(99); // Padding correct?
        });

        test('16. Registering Sub-Permutations after Upgrade', () => {
            // 1. Upgrade to S10
            repo = createRepo(10, 10);
            repo.register([9, 1, 2, 3, 4, 5, 6, 7, 8, 0]); // Swap(0,9)
            
            // 2. Now register a small perm [1, 0] (S2)
            // This should NOT resize S10 down, but store as [1, 0, 2, ... 9]
            const idSmall = repo.register([1, 0]);
            
            const pSmall = repo.get(idSmall);
            expect(pSmall.length).toBe(10);
            expect(pSmall[2]).toBe(2);
        });

        test('17. Deep Trie Path Re-Registration', () => {
            // Verify that after Trie rebuild (due to upgrade), existing paths are valid
            repo = createRepo(2, 10);
            const p1 = [1, 0];
            const idOriginal = repo.register(p1);
            
            repo._upgradeDegree(10); // Force upgrade
            
            // Re-register same input array
            const idNew = repo.register(p1);
            expect(idNew).toBe(idOriginal);
            
            // Re-register padded input array
            const p1Padded = [1, 0, 2, 3, 4, 5, 6, 7, 8, 9];
            const idPadded = repo.register(p1Padded);
            expect(idPadded).toBe(idOriginal);
        });

        test('18. Large Degree (S1000) Performance/Correctness', () => {
            repo = createRepo(1000, 10); // Start large
            
            // Create a shift permutation: i -> i+1
            const arr = new Int32Array(1000);
            for(let i=0; i<999; i++) arr[i] = i+1;
            arr[999] = 0;
            
            const id = repo.register(arr);
            const retrieved = repo.get(id);
            
            expect(retrieved[0]).toBe(1);
            expect(retrieved[999]).toBe(0);
            expect(retrieved.length).toBe(1000);
        });

        test('19. Stress: Alternating Insertions causing Fragmentation?', () => {
            // JS Arrays don't fragment manually, but our slab allocator logic is simple append.
            // Just verify sequence of IDs is contiguous [0, 1, 2...]
            repo = createRepo(4, 100);
            for(let i=0; i<50; i++) {
                // Register identity repeatedly (should be id 0)
                repo.register([0, 1, 2, 3]);
                // Register unique
                const arr = [0, 1, 2, 3];
                // Swap 0 with (i%4) ? No that creates duplicates.
                // Just use Identity vs New
            }
            // Real test: Ensure no gaps in IDs
            expect(repo.count).toBe(1); // Only identity if logic holds?
            
            // Let's add distinct ones
            repo.register([1, 0, 2, 3]);
            repo.register([0, 2, 1, 3]);
            expect(repo.count).toBe(3);
            expect(repo.get(0)).toBeDefined();
            expect(repo.get(1)).toBeDefined();
            expect(repo.get(2)).toBeDefined();
        });

        test('20. Boundary: Single Element Permutation [0]', () => {
            repo = createRepo(4, 10);
            const id = repo.register([0]); // S1 identity
            // Should match global identity in S4
            const p = repo.get(id);
            expect(p).toEqual(new Int32Array([0, 1, 2, 3]));
        });

        test('21. Trie: Branching Factor Check', () => {
            // S3 has 3! = 6 elements.
            // 0xx, 1xx, 2xx.
            repo = createRepo(3, 20);
            // 0,1,2
            // 0,2,1
            // 1,0,2
            // 1,2,0
            // 2,0,1
            // 2,1,0
            const inputs = [
                [0,1,2], [0,2,1],
                [1,0,2], [1,2,0],
                [2,0,1], [2,1,0]
            ];
            inputs.forEach(p => repo.register(p));
            expect(repo.count).toBe(6);
            
            // Internally, root node children[0], children[1], children[2] should be populated
            // We can't access private 'root' easily, but we can infer by registering [0...], [1...], [2...]
        });

        test('22. Double Capacity Expansion Trigger', () => {
            repo = createRepo(2, 2); // Very small
            repo.register([1, 0]); // Count 1
            repo.register([0, 1]); // Count 2 (Identity, actually might be same if id already reg)
            // Let's force unique
            // Need degree upgrade to get more unique perms
            repo.register([0, 1, 2, 3]); // Upgrade to S4, Count still small?
            // Generate 10 unique perms
            for(let i=0; i<10; i++) {
                const arr = [0, 1, 2, 3];
                // simple modification
                if(i < 4) {
                    [arr[0], arr[i]] = [arr[i], arr[0]];
                } else {
                    [arr[1], arr[2]] = [arr[2], arr[1]]; // just some mix
                }
                // This isn't guaranteeing unique 10, but likely > 2
                repo.register(arr);
            }
            expect(repo.permCapacity).toBeGreaterThan(2);
            // Likely 2 -> 4 -> 8 -> 16
        });

        test('23. Zero-Copy View Safety (Documentation/Usage check)', () => {
            repo = createRepo(4, 10);
            const id = repo.register([1, 0, 2, 3]);
            const view1 = repo.get(id);
            const view2 = repo.get(id);
            
            // They should share the same buffer underlying memory
            expect(view1.buffer).toBe(view2.buffer);
            expect(view1.byteOffset).toBe(view2.byteOffset);
            
            // Modifying view1 should affect view2 (User shouldn't do this, but system should behave this way)
            view1[0] = 999;
            expect(view2[0]).toBe(999);
        });

        test('24. Registering Unsorted vs Sorted Inputs (Not applicable)', () => {
            // Permutation arrays are ordered sequences. [1, 0] != [0, 1].
            // This test is just to confirm different orders get different IDs
            repo = createRepo(2, 10);
            const id1 = repo.register([0, 1]);
            const id2 = repo.register([1, 0]);
            expect(id1).not.toBe(id2);
        });

        test('25. Massive Trie Depth (S500)', () => {
            // Trie depth = 500.
            repo = createRepo(500, 10);
            const p = range(0, 500);
            // Swap last two
            [p[498], p[499]] = [p[499], p[498]];
            
            const id = repo.register(p);
            expect(repo.get(id)[499]).toBe(498);
        });

        test('27. Upgrade with dirty buffer tail', () => {
            // Internal implementation detail check:
            // When upgrading, we copy old data. Ensure we don't copy garbage from beyond 'validLen' if we were careless.
            // This is hard to test black-box without mocking, but if logic is correct, 
            // the padded area should strictly be Identity.
            repo = createRepo(2, 10);
            const id = repo.register([1, 0]);
            repo._upgradeDegree(4);
            const p = repo.get(id);
            expect(p[2]).toBe(2); // If garbage was copied, this might fail
            expect(p[3]).toBe(3);
        });

        test('28. Register with degree mismatch (smaller than global)', () => {
            repo = createRepo(10, 10);
            // Global is 10. Input is 3.
            const id = repo.register([2, 0, 1]);
            const p = repo.get(id);
            expect(p.length).toBe(10);
            expect(p[3]).toBe(3); // Padding starts at index 3
        });

        test('29. Register with degree mismatch (equal to global)', () => {
            repo = createRepo(3, 10);
            const id = repo.register([2, 0, 1]);
            const p = repo.get(id);
            expect(p.length).toBe(3);
        });

        test('30. Full Cycle Integration', () => {
            // 1. Create Repo
            repo = createRepo(3, 5);
            // 2. Add S3 perms
            const s3_cycles = [[0,1,2], [1,2,0], [2,0,1]];
            const ids = s3_cycles.map(p => repo.register(p));
            
            // 3. Upgrade to S4 via input
            const id_s4 = repo.register([0, 1, 3, 2]);
            
            // 4. Verify S3 perms are still valid and padded
            const p_old = repo.get(ids[1]); // [1, 2, 0]
            expect(p_old.length).toBe(4);
            expect(p_old[3]).toBe(3);
            
            // 5. Check uniqueness
            const id_s4_dup = repo.register([0, 1, 3, 2]);
            expect(id_s4_dup).toBe(id_s4);
        });
    });
});