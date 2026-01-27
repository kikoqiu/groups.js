import { SchreierSimsAlgorithm } from '../src/schreier-sims.js';
import { globalRepo } from '../src/permutation-repository.js';
import { PermutationSet } from '../src/group-engine.js';

// ============================================================================
// Rubik's Cube Logic Helpers
// ============================================================================

/**
 * Creates the 6 generator permutations for a 3x3x3 Rubik's Cube.
 * 
 * Mapping Scheme (54 stickers):
 * U (Up): 0-8, L (Left): 9-17, F (Front): 18-26, 
 * R (Right): 27-35, B (Back): 36-44, D (Down): 45-53
 * 
 * Sticker layout per face:
 * 0 1 2
 * 3 4 5
 * 6 7 8
 */
const createRubiksGenerators = () => {
    // Identity state (0..53)
    const createIdentity = () => new Int32Array(54).map((_, i) => i);

    // Helper: Cycles 4 groups of indices (a -> b -> c -> d -> a)
    // p[source] = target logic.
    // Meaning: Piece at 'a' moves to 'b'.
    const cycle = (p, aIndices, bIndices, cIndices, dIndices) => {
        for (let i = 0; i < aIndices.length; i++) {
            const a = aIndices[i], b = bIndices[i], c = cIndices[i], d = dIndices[i];
            // Store current destinations (logic: p[i] is where i moves to)
            // Wait, standard Permutation logic: p[i] = image of i.
            // If piece at A moves to B, then p[A] = B.
            p[a] = bIndices[i];
            p[b] = cIndices[i];
            p[c] = dIndices[i];
            p[d] = aIndices[i];
        }
    };

    // Helper: Rotates a face clockwise (Corners and Edges)
    const rotateFace = (p, startIdx) => {
        // Corners: 0->2->8->6
        cycle(p, [startIdx+0], [startIdx+2], [startIdx+8], [startIdx+6]);
        // Edges: 1->5->7->3
        cycle(p, [startIdx+1], [startIdx+5], [startIdx+7], [startIdx+3]);
    };

    // --- 1. Move U (Up) ---
    const U = createIdentity();
    rotateFace(U, 0); // Rotate U Face
    // Cycle Sides: F(Top) -> L(Top) -> B(Top) -> R(Top) -> F
    // Indices: F(18,19,20), L(9,10,11), B(36,37,38), R(27,28,29)
    cycle(U, [18,19,20], [9,10,11], [36,37,38], [27,28,29]);

    // --- 2. Move L (Left) ---
    const L = createIdentity();
    rotateFace(L, 9); // Rotate L Face
    // Cycle Sides: U(Left Col) -> F(Left Col) -> D(Left Col) -> B(Right Col Inverted) -> U
    // Note: B is usually inverted in cyclic notation relative to L, 
    // but assuming simple unwrapping:
    // U(0,3,6) -> F(18,21,24) -> D(45,48,51) -> B(44,41,38) -> U
    cycle(L, [0,3,6], [18,21,24], [45,48,51], [44,41,38]);

    // --- 3. Move F (Front) ---
    const F = createIdentity();
    rotateFace(F, 18); // Rotate F Face
    // Cycle Sides: U(Bottom) -> R(Left) -> D(Top) -> L(Right) -> U
    // U(6,7,8) -> R(27,30,33) -> D(47,46,45) -> L(17,14,11) -> U
    cycle(F, [6,7,8], [27,30,33], [47,46,45], [17,14,11]);

    // --- 4. Move R (Right) ---
    const R = createIdentity();
    rotateFace(R, 27); // Rotate R Face
    // Cycle Sides: U(Right) -> B(Left Inv) -> D(Right) -> F(Right) -> U
    // U(8,5,2) -> B(36,39,42) -> D(53,50,47) -> F(26,23,20) -> U
    cycle(R, [8,5,2], [36,39,42], [53,50,47], [26,23,20]);

    // --- 5. Move B (Back) ---
    const B = createIdentity();
    rotateFace(B, 36); // Rotate B Face
    // Cycle Sides: U(Top) -> L(Left) -> D(Bottom) -> R(Right) ... tricky orientation
    // Standard: U(2,1,0) -> L(9,12,15) -> D(51,52,53) -> R(35,32,29) -> U
    cycle(B, [2,1,0], [9,12,15], [51,52,53], [35,32,29]);

    // --- 6. Move D (Down) ---
    const D = createIdentity();
    rotateFace(D, 45); // Rotate D Face
    // Cycle Sides: F(Bot) -> R(Bot) -> B(Bot) -> L(Bot) -> F
    // F(24,25,26) -> R(33,34,35) -> B(42,43,44) -> L(15,16,17) -> F
    cycle(D, [24,25,26], [33,34,35], [42,43,44], [15,16,17]);

    return [U, L, F, R, B, D];
};

// ============================================================================
// Test Suite
// ============================================================================

describe('Rubik\'s Cube Solver Engine (Schreier-Sims)', () => {
    
    // The known order of the Rubik's Cube group
    const EXPECTED_ORDER = 43252003274489856000n; // ~4.3 * 10^19
    
    let engine;
    let gens;
    let U_id, L_id, F_id, R_id, B_id, D_id;

    beforeAll(() => {
        // 1. Generate Raw Permutations
        gens = createRubiksGenerators();
        
        // 2. Register them into the Engine
        const genIds = gens.map(p => globalRepo.register(p));
        [U_id, L_id, F_id, R_id, B_id, D_id] = genIds;

        // 3. Compute BSGS (The Heavy Lifting)
        // Note: For a JS engine, computing BSGS for Rubik's cube usually takes 
        // between 200ms and 2000ms depending on optimization level.
        const start = performance.now();
        const groupSet = new PermutationSet(genIds);
        engine = SchreierSimsAlgorithm.compute(groupSet);
        const end = performance.now();
        
        console.log(`Rubik's BSGS Constructed in ${(end-start).toFixed(2)}ms`);
    });

    test('1. Group Order (Size of State Space)', () => {
        // Verify the exact number of permutations matches the mathematical constant
        expect(engine.order).toBe(EXPECTED_ORDER);
    });

    test('2. Base Size Efficiency', () => {
        // The stabilizer chain for Rubik's cube typically has depth around 18-19.
        // If it's much larger (e.g. 50), the algorithm might be inefficient.
        // Max theoretical base size is bounded by degree (54), but usually optimal is < 20.
        expect(engine.base.length).toBeLessThan(25);
        expect(engine.base.length).toBeGreaterThan(15);
        
        console.log('Stabilizer Chain Depth:', engine.base.length);
        console.log('Transversal Sizes:', engine.transversals.map(t => t.size).join(', '));
    });

    test('3. Valid Scramble Resolution (Membership Test)', () => {
        // Perform a sequence of moves: R U R' U' (The "Sexy Move")
        // We calculate the permutation ID manually using the engine's multiply
        // Remember: multiply(A, B) means apply B then A (or A(B(x))).
        // Let's rely on the engine's internal multiplication to generate a state.
        
        // Sequence: R -> U -> R' -> U'
        // In code: U' * R' * U * R (Application order depends on convention)
        // Let's just simulate multiplying IDs:
        
        const R_inv = engine.inverse(R_id);
        const U_inv = engine.inverse(U_id);
        
        // Apply R, then U, then R_inv, then U_inv
        let state = R_id;
        state = engine.multiply(U_id, state);   // U(R)
        state = engine.multiply(R_inv, state);  // R'(U(R))
        state = engine.multiply(U_inv, state);  // U'(R'(U(R)))
        
        // This state MUST be in the group
        expect(engine.contains(state)).toBe(true);
    });

    test('4. Random Scramble Membership', () => {
        // Generate a random valid state by multiplying 100 random generators
        let currentState = engine.idIdentity;
        const allGens = [U_id, L_id, F_id, R_id, B_id, D_id];
        
        for (let i = 0; i < 100; i++) {
            const randomGen = allGens[Math.floor(Math.random() * 6)];
            currentState = engine.multiply(randomGen, currentState);
        }

        expect(engine.contains(currentState)).toBe(true);
    });

    test('5. Impossible State Detection (Edge Flip)', () => {
        // Physically flip a single edge piece (e.g., swapping stickers 1 and 5 on the U face)
        // Note: 1 and 5 are adjacent on the U face in our mapping.
        // Actually, swapping two stickers creates an odd permutation.
        // Valid Rubik's positions are always even permutations of the 54 stickers 
        // (technically a specific subset of even permutations).
        
        // Create an "Identity" board but swap sticker 0 and sticker 1
        const impossibleRaw = new Int32Array(54).map((_, i) => i);
        const temp = impossibleRaw[0];
        impossibleRaw[0] = impossibleRaw[1];
        impossibleRaw[1] = temp;

        expect(engine.contains(impossibleRaw)).toBe(false);
    });

    test('6. Impossible State Detection (Corner Twist)', () => {
        // A single corner twist is impossible. 
        // Let's simulate twisting the corner at (0, 9, 36) -> (U_TL, L_TL, B_TR)
        // Twist: 0->9->36->0.
        
        const twistedRaw = new Int32Array(54).map((_, i) => i);
        // Apply 3-cycle to twist one corner
        twistedRaw[0] = 9;
        twistedRaw[9] = 36;
        twistedRaw[36] = 0;

        // This should fail membership test
        expect(engine.contains(twistedRaw)).toBe(false);
    });

});


class RubiksSolver {
    constructor(ssaEngine) {
        this.engine = ssaEngine;
    }

    /**
     * Solves a given scrambled state by stripping it through the stabilizer chain.
     * @param {number} scrambleId 
     * @returns {object} { steps: Array<string|number>, solutionId: number }
     */
    solve(scrambleId) {
        let curr = scrambleId;
        const solutionMoves = []; // Stores IDs of inverse moves applied
        const solutionLog = [];   // Stores readable names
        
        const base = this.engine.base;
        const degree = this.engine.degree;
        const repo = globalRepo;

        // Iterate down the stabilizer chain
        for (let i = 0; i < base.length; i++) {
            const beta = base[i];
            
            // Where does current state map the base point?
            // delta = curr(beta)
            const offset = curr * degree;
            const delta = repo.permBuffer[offset + beta];

            if (delta === beta) continue;

            // Find the representative 'u' in the transversal that maps beta -> delta
            const transversal = this.engine.transversals[i];
            const u = transversal.get(delta);

            if (u === undefined) {
                // This means the scramble is NOT in the group (or logic error)
                throw new Error(`State impossible! Point ${delta} not in orbit of ${beta} at level ${i}`);
            }

            // We apply u^-1 to 'curr' to stabilize beta.
            const uInv = this.engine.inverse(u);
            
            // Record step
            solutionMoves.push(uInv);
            

            solutionLog.push(this.engine.repo.getAsCycles(uInv));
            

            // Update current state: curr = u^-1 * curr
            // (Apply uInv AFTER the current state to fix the point)
            // Wait, multiply order: multiply(A, B) -> A(B(x))
            // We want new_state(x) = uInv(curr(x))
            // So: multiply(uInv, curr)
            curr = this.engine.multiply(uInv, curr);
        }

        // Final Verification
        if (curr !== this.engine.idIdentity) {
            throw new Error("Solver failed to fully reduce to Identity!");
        }

        return {
            moveIds: solutionMoves, // The sequence of operators
            log: solutionLog        // Readable log
        };
    }
}

describe('Rubik\'s Cube Solver (End-to-End)', () => {
    let engine;
    let solver;
    let U, L, F, R, B, D; // IDs

    beforeAll(() => {
        // 1. Setup Repo & SSA
        const gens = createRubiksGenerators();
        const genIds = gens.map(p => globalRepo.register(p));
        [U, L, F, R, B, D] = genIds;

        // Compute BSGS
        const groupSet = new PermutationSet(genIds);
        engine = SchreierSimsAlgorithm.compute(groupSet);

        // 2. Initialize Solver
        solver = new RubiksSolver(engine);
    });

    test('2. Solve single move (U)', () => {
        // Scramble: U
        const result = solver.solve(U);        
        // Verify mathematically
        const uInv = result.moveIds[0];
        const check = engine.multiply(uInv, U);
        expect(check).toBe(engine.idIdentity);
    });

    test('3. Solve \'Sexy Move\' (R U R\' U\')', () => {
        const R_inv = engine.inverse(R);
        const U_inv = engine.inverse(U);

        // Construct scramble: R U R' U'
        // Order: Apply R, then U, then R', then U'
        // Code: U'(R'(U(R)))
        let s = R;
        s = engine.multiply(U, s);
        s = engine.multiply(R_inv, s);
        s = engine.multiply(U_inv, s);

        const result = solver.solve(s);
        
        //console.log('Sexy Move Solution Steps:', result.log.join('->'));
        
        // Verify validity by applying solution moves to scramble
        let check = s;
        result.moveIds.forEach(opId => {
            check = engine.multiply(opId, check);
        });
        
        expect(check).toBe(engine.idIdentity);
    });

    test('4. Solve Random Scramble (Robustness)', () => {
        // Generate random scramble (10 moves)
        let s = engine.idIdentity;
        const all = [U, L, F, R, B, D];
        
        for(let i=0; i<10; i++) {
            const idx = Math.floor(Math.random()*6);
            s = engine.multiply(all[idx], s);
        }        

        const start = performance.now();
        const result = solver.solve(s);
        const end = performance.now();

        console.log(`Solved 10-move scramble in ${(end-start).toFixed(2)}ms.`);
        console.log(`Solution Length: ${result.moveIds.length}`);
        
        // Verify validity
        let check = s;
        result.moveIds.forEach(opId => {
            check = engine.multiply(opId, check);
        });
        expect(check).toBe(engine.idIdentity);
    });
});
