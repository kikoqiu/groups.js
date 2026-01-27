/**
 * @fileoverview Structural Group Theory Utilities.
 * 
 * Provides advanced algorithms for analyzing group structure:
 * - Subgroup/Normality testing
 * - Normal Closures & Commutators
 * - Solvability & Simplicity testing
 * - Quotient Group construction with Representative Lifting
 * - Isomorphism heuristics
 * 
 * DESIGN PRINCIPLE:
 * All functions accept either PermutationSet OR SchreierSimsAlgorithm.
 * We prioritize using SSA to leverage pre-computed chains.
 * 
 * RETURN VALUE CONVENTION FOR DECISION PROBLEMS:
 * For algorithms where strict deterministic polynomial time proof is difficult
 * (e.g., Isomorphism, Simplicity on large groups), functions return:
 *  1 : Yes (Strictly Proven)
 *  0 : No  (Strictly Proven)
 * -1 : Uncertain (Heuristically likely Yes, but not strictly proven)
 */

import { globalRepo } from './permutation-repository.js';
import { PermutationSet, generateGroup } from './group-engine.js';
import { SchreierSimsAlgorithm } from './schreier-sims.js';
import { _getRandomElement, _gcd, _lcm, _getPPart, _isPowerOfP, _pow, _isSmallPrime } from './group-private-utils.js';
// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Ensures that the input is a `SchreierSimsAlgorithm` instance.
 * If a `PermutationSet` is provided, it computes the SSA for it.
 * @param {PermutationSet|SchreierSimsAlgorithm} input - The group to convert or ensure as SSA.
 * @returns {SchreierSimsAlgorithm} A `SchreierSimsAlgorithm` instance.
 * @private
 * @throws {Error} If the input is neither a `PermutationSet` nor a `SchreierSimsAlgorithm`.
 */
function _ensureSSA(input) {
    if (input instanceof SchreierSimsAlgorithm) {
        return input;
    }
    if (input instanceof PermutationSet) {
        return SchreierSimsAlgorithm.compute(input);
    }
    throw new Error("Input must be PermutationSet or SchreierSimsAlgorithm");
}

/**
 * Extracts a `PermutationSet` of generators from the input, whether it's
 * already a `PermutationSet` or a `SchreierSimsAlgorithm` instance.
 * @param {PermutationSet|SchreierSimsAlgorithm} input - The group representation from which to extract generators.
 * @returns {PermutationSet} A `PermutationSet` containing the generators.
 * @private
 * @throws {Error} If the input is neither a `PermutationSet` nor a `SchreierSimsAlgorithm`.
 */
function _ensureGens(input) {
    if (input instanceof PermutationSet) {
        return input;
    }
    if (input instanceof SchreierSimsAlgorithm) {
        const flatIds = input.generators.flat();
        return new PermutationSet(flatIds, false, false);
    }
    throw new Error("Invalid Input");
}


// ============================================================================
// Subgroup & Normality (Strict Boolean)
// ============================================================================

/**
 * Checks if `subGroup` is a subgroup of `superGroup`.
 * This is determined by verifying that all generators of `subGroup` are contained within `superGroup`.
 * @param {PermutationSet|SchreierSimsAlgorithm} superGroup - The potential supergroup G.
 * @param {PermutationSet|SchreierSimsAlgorithm} subGroup - The potential subgroup H.
 * @returns {boolean} True if H is a subgroup of G, false otherwise.
 */
export function isSubgroup(superGroup, subGroup) {
    const superSSA = _ensureSSA(superGroup);
    const subGens = _ensureGens(subGroup);

    for (const h of subGens.indices) {
        if (!superSSA.contains(h)) return false;
    }
    return true;
}

/**
 * Checks if `normalN` is a normal subgroup of `superGroup` (N ◁ G).
 * This is verified by checking if for every generator `g` of `superGroup` and every generator `n` of `normalN`,
 * the conjugate `g * n * g^-1` is an element of `normalN`.
 * @param {PermutationSet|SchreierSimsAlgorithm} superGroup - The supergroup G.
 * @param {PermutationSet|SchreierSimsAlgorithm} normalN - The potential normal subgroup N.
 * @returns {boolean} True if N is a normal subgroup of G, false otherwise.
 */
export function isNormal(superGroup, normalN) {
    const superGens = _ensureGens(superGroup);
    const subSSA = _ensureSSA(normalN); 
    const subGens = _ensureGens(normalN); // Renamed from normalN to subGens for clarity in the loop

    // Optimized check: conjugate generators of N by generators of G
    for (const g of superGens.indices) {
        const gInv = globalRepo.inverse(g);
        
        for (const n of subGens.indices) {
            // g * n * g^-1
            const gn = globalRepo.multiply(g, n);
            const conj = globalRepo.multiply(gn, gInv);

            if (!subSSA.contains(conj)) return false;
        }
    }
    return true;
}

/**
 * Computes the normal closure of a subset `subsetS` within the group `groupG`.
 * The normal closure is the smallest normal subgroup of `groupG` that contains `subsetS`.
 * It is generated by all conjugates of elements of `subsetS` by elements of `groupG`.
 * @param {PermutationSet|SchreierSimsAlgorithm} groupG - The containing group G.
 * @param {PermutationSet|Array<number>|number} subsetS - The subset S (generators, array of IDs, or single ID).
 * @returns {SchreierSimsAlgorithm} The `SchreierSimsAlgorithm` instance representing the normal closure.
 */
export function getNormalClosure(groupG, subsetS) {
    const gGens = _ensureGens(groupG).indices;
    
    let initialIds = [];
    if (subsetS instanceof PermutationSet) initialIds = Array.from(subsetS.indices);
    else if (Array.isArray(subsetS)) initialIds = subsetS;
    else initialIds = [subsetS];

    const closureSSA = new SchreierSimsAlgorithm();
    const queue = [];

    // Initialize with S
    for (const id of initialIds) {
        if (!closureSSA.contains(id)) {
            closureSSA.siftAndInsert(id);
            queue.push(id);
        }
    }

    // BFS Closure
    let head = 0;
    while (head < queue.length) {
        const n = queue[head++];

        for (const g of gGens) {
            const conj = globalRepo.conjugate(g, n);
            if (!closureSSA.contains(conj)) {
                closureSSA.siftAndInsert(conj);
                queue.push(conj); 
            }
        }
    }

    return closureSSA;
}

// ============================================================================
// Derived Series & Solvability
// ============================================================================

/**
 * Computes the commutator subgroup G' = [G, G] of a group G.
 * This subgroup is generated by all commutators `[g1, g2] = g1^-1 * g2^-1 * g1 * g2` for `g1, g2` in G.
 * @param {PermutationSet|SchreierSimsAlgorithm} group - The group G.
 * @returns {SchreierSimsAlgorithm} The `SchreierSimsAlgorithm` instance representing the commutator subgroup.
 */
export function getCommutatorSubgroup(group) {
    const gens = _ensureGens(group).indices;
    const commutators = [];
    const len = gens.length;

    for (let i = 0; i < len; i++) {
        for (let j = i + 1; j < len; j++) {
            const comm = globalRepo.commutator(gens[i], gens[j]);
            if (comm !== globalRepo.identity) {
                commutators.push(comm);
            }
        }
    }

    if (commutators.length === 0) {
        return SchreierSimsAlgorithm.compute(PermutationSet.identity());
    }

    // The commutator subgroup is the normal closure of its generators within the group itself.
    return getNormalClosure(group, commutators);
}

/**
 * Checks if a group is solvable.
 * A group G is solvable if its derived series terminates in the trivial group {e}.
 * The derived series is G^(0) = G, G^(n+1) = [G^(n), G^(n)].
 * @param {PermutationSet|SchreierSimsAlgorithm} group - The group G to check for solvability.
 * @returns {boolean} True if the group is solvable, false otherwise.
 */
export function isSolvable(group) {
    let currentSSA = _ensureSSA(group);
    const limit = 20; // Safety depth
    
    for (let i = 0; i < limit; i++) {
        if (currentSSA.order === 1n) return true;

        const nextSSA = getCommutatorSubgroup(currentSSA);
        
        // If G' == G (Perfect), not solvable
        if (nextSSA.order === currentSSA.order) return false;
        
        currentSSA = nextSSA;
    }
    return false;
}

// ============================================================================
// Simplicity Testing (Tri-State)
// ============================================================================

/**
 * Checks if a group is simple.
 * A group G is simple if its only normal subgroups are the trivial group {e} and G itself.
 * This function uses a probabilistic approach for non-abelian groups and may return "uncertain" for large groups.
 * @param {PermutationSet|SchreierSimsAlgorithm} group - The group G to check for simplicity.
 * @param {number} [randomTests=10] - Number of random conjugates to test for non-abelian groups. Higher values increase confidence but also computation time.
 * @returns {number} 1 (Proven Simple), 0 (Proven Not Simple), -1 (Uncertain - heuristically likely simple but not strictly proven).
 */
export function isSimple(group, randomTests = 10) {
    const ssa = _ensureSSA(group);
    const order = ssa.order;

    // Case 1: Trivial Group {e}
    // Conventionally not simple.
    if (order === 1n) return 0;

    // Case 2: Abelian Group
    const gens = _ensureGens(ssa);
    if (gens.isAbelian()) {
        // Simple IFF Prime Order.
        // Fast check for small primes (standard JS integer safe limit)
        if (order < 9007199254740991n) {
            const n = Number(order);
            if (_isSmallPrime(n)) return 1;
            return 0;
        }
        // For huge BigInts without a primality lib, we are Uncertain.
        return -1; 
    }

    // Case 3: Not Perfect (G != G')
    // If G has a non-trivial commutator subgroup G' < G, G' is normal in G.
    // Thus G is not simple.
    const derivedSSA = getCommutatorSubgroup(ssa);
    if (derivedSSA.order !== order) {
        // But wait, G' could be {e}. If G' = {e}, it's Abelian (handled above).
        // If {e} < G' < G, then G' is a proper normal subgroup.
        return 0;
    }

    // Case 4: Normal Closure of Generators
    // A non-abelian simple group is generated by the normal closure of ANY non-identity element.
    // If we find a generator whose closure is proper, it's NOT simple.
    for (const g of gens.indices) {
        if (g === globalRepo.identity) continue;
        const nc = getNormalClosure(ssa, [g]);
        if (nc.order !== order) return 0; 
    }

    // Case 5: Random Sampling
    // It is theoretically possible (though rare in "natural" permutation groups) 
    // that the normal subgroups avoid all generators.
    // We test random elements to increase confidence.
    for (let i = 0; i < randomTests; i++) {
        const rnd = _getRandomElement(ssa);
        if (rnd === globalRepo.identity) continue;
        const nc = getNormalClosure(ssa, [rnd]);
        if (nc.order !== order) return 0;
    }

    // We have not found any normal subgroups.
    // High probability of being Simple, but strict proof requires O'Nan-Scott analysis.
    return -1;
}

// ============================================================================
// Quotient Structure (Lazy Lifting)
// ============================================================================

/**
 * Represents a Quotient Group G/N, providing a mapping between
 * elements of the quotient group (as permutations on coset indices)
 * and their representatives in the original group G.
 */
class QuotientGroupMap {
    /**
     * @param {PermutationSet} quotientGroup - A PermutationSet whose elements act on the coset indices (0-based).
     * @param {Int32Array} representatives - An Int32Array where `representatives[i]` is a chosen representative from the i-th coset.
     * @param {bigint} quotientOrder - The order of the quotient group, |G/N|.
     */
    constructor(quotientGroup, representatives, quotientOrder) {
        this.group = quotientGroup;
        this.representatives = representatives;
        this.size = quotientOrder;
    }

    /**
     * Lifts a quotient group element (represented by a permutation ID) back to
     * a specific representative element in the original group G.
     * The returned element `g` is such that the quotient element corresponds to the coset `Ng`.
     * @param {number} quotientPermId - The ID of the permutation in the quotient group.
     * @returns {number} The ID of a representative element in the original group G.
     * @throws {Error} If the `quotientPermId` maps to an invalid coset index.
     */
    lift(quotientPermId) {
        const qPerm = globalRepo.get(quotientPermId);
        // The image of 0 (Identity Coset) under q corresponds to the coset of the representative.
        const targetCosetIdx = qPerm[0];
        if (targetCosetIdx < 0 || targetCosetIdx >= this.representatives.length) {
            throw new Error("Invalid Quotient Permutation");
        }
        return this.representatives[targetCosetIdx];
    }
}

/**
 * Computes the structure of the quotient group G/N, along with a mapping
 * that lifts elements from G/N back to representatives in G.
 * This function is computationally intensive and only feasible for quotient groups
 * with a small index `[G:N]`.
 * @param {PermutationSet|SchreierSimsAlgorithm} groupG - The group G.
 * @param {PermutationSet|SchreierSimsAlgorithm} normalN - The normal subgroup N of G.
 * @param {number} [maxIndex=2000] - The maximum allowed index `[G:N]` for explicit construction.
 * @returns {QuotientGroupMap} An object containing the quotient group (as PermutationSet)
 *   and an array of representatives for each coset.
 * @throws {Error} If N is not a normal subgroup of G, or if `[G:N]` exceeds `maxIndex`.
 */
export function getQuotientStructure(groupG, normalN, maxIndex = 2000) {
    const ssaG = _ensureSSA(groupG);
    const ssaN = _ensureSSA(normalN);
    
    if (ssaG.order % ssaN.order !== 0n) throw new Error("N must divide G");
    const indexBig = ssaG.order / ssaN.order;

    if (indexBig > BigInt(maxIndex)) {
        throw new Error(`Quotient index ${indexBig} too large for explicit construction.`);
    }
    const k = Number(indexBig);

    // BFS Coset Enumeration
    const cosetReps = [globalRepo.identity];
    const gGens = _ensureGens(ssaG).indices;
    
    let head = 0;
    while (head < cosetReps.length) {
        const currRep = cosetReps[head];
        
        // Try extending by generators
        for (const gen of gGens) {
            const candidate = globalRepo.multiply(currRep, gen);
            
            // Check if candidate belongs to existing coset
            let found = false;
            for (let i = 0; i < cosetReps.length; i++) {
                const existing = cosetReps[i];
                // Check if candidate * existing^-1 in N
                const exInv = globalRepo.inverse(existing);
                const check = globalRepo.multiply(candidate, exInv);
                
                if (ssaN.contains(check)) {
                    found = true;
                    break;
                }
            }
            
            if (!found) {
                if (cosetReps.length >= k) throw new Error("Coset Enumeration Overflow");
                cosetReps.push(candidate);
            }
        }
        head++;
    }

    // Build Quotient Permutations (Action on 0..k-1)
    const quotientGenIds = [];
    const tempArr = new Int32Array(k);

    for (const gen of gGens) {
        for (let c = 0; c < k; c++) {
            const rep = cosetReps[c];
            const result = globalRepo.multiply(rep, gen);
            
            // Find index of result
            let targetIdx = -1;
            for (let i = 0; i < k; i++) {
                const existing = cosetReps[i];
                const exInv = globalRepo.inverse(existing);
                const check = globalRepo.multiply(result, exInv);
                if (ssaN.contains(check)) {
                    targetIdx = i;
                    break;
                }
            }
            if (targetIdx === -1) throw new Error("Coset Closure Error");
            tempArr[c] = targetIdx;
        }
        quotientGenIds.push(globalRepo.register(tempArr));
    }

    // We must expand the generators to form the full Quotient Group.
    // The set of generators alone usually has a size < Order(G/N).
    const genSet = new PermutationSet(quotientGenIds, false, false);
    const qGroup = generateGroup(genSet);

    return new QuotientGroupMap(qGroup, new Int32Array(cosetReps), indexBig);
}

// ============================================================================
// Isomorphism Heuristics (Tri-State)
// ============================================================================

/**
 * Heuristically checks if two groups `groupA` and `groupB` are isomorphic.
 * This function compares structural invariants (order, abelian-ness, derived series length).
 * It cannot definitively prove isomorphism without constructing an explicit isomorphism map,
 * but it can reliably prove non-isomorphism and provide a strong indication for isomorphism.
 * @param {PermutationSet|SchreierSimsAlgorithm} groupA - The first group.
 * @param {PermutationSet|SchreierSimsAlgorithm} groupB - The second group.
 * @returns {number} 1 (Isomorphic, if strictly proven - rare), 0 (Not isomorphic, strictly proven), -1 (Uncertain - heuristically likely isomorphic but not strictly proven).
 */
export function areIsomorphic(groupA, groupB) {
    const ssaA = _ensureSSA(groupA);
    const ssaB = _ensureSSA(groupB);

    // 1. Order Check
    if (ssaA.order !== ssaB.order) return 0;

    // 2. Abelian Check
    const gensA = _ensureGens(ssaA);
    const gensB = _ensureGens(ssaB);
    const abA = gensA.isAbelian();
    const abB = gensB.isAbelian();
    if (abA !== abB) return 0;

    // If both are Abelian and small, we might be able to use structure theorem?
    // For now, treat as uncertain.

    // 3. Derived Subgroup Check
    const commA = getCommutatorSubgroup(ssaA);
    const commB = getCommutatorSubgroup(ssaB);
    if (commA.order !== commB.order) return 0;

    // 4. Derived Series Length (Solvability depth)
    // We check one more level deep
    if (commA.order > 1n) {
        const comm2A = getCommutatorSubgroup(commA);
        const comm2B = getCommutatorSubgroup(commB);
        if (comm2A.order !== comm2B.order) return 0;
    }

    // 5. Center Check (Optional - expensive to compute full center, skipping for utils)

    // Groups passed all structural invariant checks.
    // They are extremely likely to be isomorphic in practical contexts,
    // but we cannot return 1 without an explicit isomorphism map construction.
    return -1;
}

/**
 * Computes the mixed commutator subgroup `[subA, subB]` of two subgroups `subA` and `subB`
 * within a larger group `groupG`.
 * The result is the normal closure of all commutators `[a, b]` (where `a` is from `subA` and `b` is from `subB`)
 * within the group `groupG`.
 * @param {PermutationSet|SchreierSimsAlgorithm} groupG - The containing parent group G, used for computing the normal closure.
 * @param {PermutationSet|SchreierSimsAlgorithm} subA - The first subgroup A.
 * @param {PermutationSet|SchreierSimsAlgorithm} subB - The second subgroup B.
 * @returns {SchreierSimsAlgorithm} The `SchreierSimsAlgorithm` instance representing the mixed commutator subgroup `[A, B]`.
 */
export function getMixedCommutatorSubgroup(groupG, subA, subB) {
    // Ensure we are working with generators
    const gensA = _ensureGens(subA).indices;
    const gensB = _ensureGens(subB).indices;
    
    const commutators = [];
    
    // Compute cross-commutators [a, b]
    for (let i = 0; i < gensA.length; i++) {
        for (let j = 0; j < gensB.length; j++) {
            const comm = globalRepo.commutator(gensA[i], gensB[j]);
            if (comm !== globalRepo.identity) {
                commutators.push(comm);
            }
        }
    }

    if (commutators.length === 0) {
        return SchreierSimsAlgorithm.compute(PermutationSet.identity());
    }

    // The mixed commutator subgroup [A, B] is the Normal Closure of these commutators in G.
    // Why Normal Closure in G? 
    // Because strictly [A, B] is generated by {[a,b]}, but for Central Series calculations
    // inside G, we usually want the result to be a robust subgroup of G.
    // If A and B are normal in G, [A, B] is normal in G.
    return getNormalClosure(groupG, commutators);
}

/**
 * Computes the lower central series of a group G.
 * The series is defined recursively as:
 * G_0 = G
 * G_{i+1} = [G_i, G] (the mixed commutator subgroup of G_i and G).
 * The series terminates when G_{i+1} = G_i or G_i = {e}.
 * @param {PermutationSet|SchreierSimsAlgorithm} group - The group G.
 * @returns {SchreierSimsAlgorithm[]} An array of `SchreierSimsAlgorithm` instances, representing the subgroups in the lower central series: `[G_0, G_1, ..., G_k]`.
 */
export function getLowerCentralSeries(group) {
    const ssaG = _ensureSSA(group);
    const series = [ssaG];
    
    let current = ssaG;
    const limit = 20; // Safety break

    for (let i = 0; i < limit; i++) {
        if (current.order === 1n) break;

        // Next = [Current, G]
        const next = getMixedCommutatorSubgroup(ssaG, current, ssaG);
        
        // If series stabilizes (G_{i+1} == G_i), stop.
        if (next.order === current.order) {
            // For rigorous check: check if next is subset of current? 
            // Since next is [Current, G], it is always a subgroup of Current (if Current normal in G).
            // Equal order implies equality.
            series.push(next); // Push the duplicate to show stabilization
            break;
        }

        series.push(next);
        current = next;
    }

    return series;
}

/**
 * Checks if a group is nilpotent.
 * A group G is nilpotent if its lower central series terminates at the trivial group {e}.
 * Every nilpotent group is solvable.
 * @param {PermutationSet|SchreierSimsAlgorithm} group - The group G to check for nilpotency.
 * @returns {number} 1 (Nilpotent), 0 (Not Nilpotent).
 */
export function isNilpotent(group) {
    const ssa = _ensureSSA(group);
    
    // Optimization: If not Solvable, definitely not Nilpotent.
    if (!isSolvable(ssa)) return 0;
    
    // Trivial group is Nilpotent
    if (ssa.order === 1n) return 1;

    // Compute LCS
    const series = getLowerCentralSeries(ssa);
    const last = series[series.length - 1];
    
    return last.order === 1n ? 1 : 0;
}






/**
 * Analyzes a list of candidate generators to determine a minimal (fundamental) generating set.
 * It uses the Schreier-Sims Algorithm to identify and separate redundant generators.
 * @param {number[]|PermutationSet} candidateIds - An array of permutation IDs that are potential generators.
 * @returns {{
 *   fundamental: number[], 
 *   redundant: number[], 
 *   ssa: SchreierSimsAlgorithm
 * }} An object containing:
 *   - `fundamental`: An array of permutation IDs that form a minimal generating set.
 *   - `redundant`: An array of permutation IDs that are generated by the `fundamental` set.
 *   - `ssa`: The `SchreierSimsAlgorithm` instance computed from the `fundamental` generators.
 */
export function analyzeGenerators(candidateIds) {
    if(candidateIds instanceof PermutationSet){
        candidateIds = Array.from(candidateIds.indices);
    }
    // Initialize an empty SSA chain (only Identity implicitly)
    const ssa = new SchreierSimsAlgorithm();
    
    const fundamental = [];
    const redundant = [];

    for (const id of candidateIds) {
        // Identity is always redundant as a generator unless it's the only element
        // and we want to be explicit, but usually generators exclude e.
        if (id === globalRepo.identity) {
            redundant.push(id);
            continue;
        }

        // Check if 'id' is already generated by the current set
        if (ssa.contains(id)) {
            redundant.push(id);
        } else {
            // Not generated yet; it's fundamental.
            // Add it to the chain so subsequent checks include it.
            ssa.siftAndInsert(id);
            fundamental.push(id);
        }
    }

    return { fundamental, redundant, ssa };
}




// ============================================================================
// Constants & Config
// ============================================================================

const MAX_TRIALS = 100;     // Max attempts to extend current subgroup before restart
const MAX_RESTARTS = 10;    // Max full restarts

// ============================================================================
// Public API
// ============================================================================


/**
 * Computes a Sylow p-subgroup of G.
 * 
 * A Sylow p-subgroup of a group G is a maximal p-subgroup of G.
 * If |G| = p^k * m where gcd(p, m) = 1, then a Sylow p-subgroup has order p^k.
 * 
 * ALGORITHM STRATEGY:
 * We use a Randomized Greedy approach with restart ("Random Search").
 * 1. Compute target order p^k.
 * 2. Start with P = {e}.
 * 3. Repeatedly pick random elements g from G.
 * 4. Extract the p-part h from g (so order(h) is a power of p).
 * 5. Attempt to extend P by h: P_new = <P, h>.
 * 6. If P_new is a p-group (order is power of p), update P = P_new.
 * 7. If |P| reaches p^k, we are done.
 * 
 * Note: This is a Monte Carlo Las Vegas algorithm. It is correct if it terminates,
 * but theoretically could run indefinitely (though very unlikely for standard groups).
 * We include safeguards/limits.
*/


/**
 * Computes a Sylow p-subgroup of a given group G.
 * A Sylow p-subgroup is a maximal p-subgroup of G, with order p^k where p^k divides |G|
 * and p^(k+1) does not.
 * The algorithm uses a randomized greedy approach with restarts.
 * @param {PermutationSet|SchreierSimsAlgorithm} group - The group G for which to find a Sylow p-subgroup.
 * @param {number} p - The prime number p.
 * @returns {PermutationSet} A `PermutationSet` containing the generators of a Sylow p-subgroup.
 * @throws {Error} If the algorithm fails to construct a Sylow p-subgroup within the configured random search limits.
 */
export function getSylowSubgroup(group, p) {
    // 1. Setup & Order Calculation
    const ssa = _ensureSSA(group);
    const order = ssa.order;
    const pBig = BigInt(p);

    // Calculate max power p^k dividing order
    let tempOrder = order;
    let targetOrder = 1n;
    while (tempOrder % pBig === 0n) {
        targetOrder *= pBig;
        tempOrder /= pBig;
    }

    // Trivial Case: p does not divide |G|
    if (targetOrder === 1n) {
        return PermutationSet.identity(globalRepo.globalDegree);
    }

    // 2. Randomized Construction Loop
    for (let restart = 0; restart < MAX_RESTARTS; restart++) {
        // Start with Identity
        let currentGroup = PermutationSet.identity(globalRepo.globalDegree);
        let currentOrder = 1n;
        
        let failures = 0;
        
        while (failures < MAX_TRIALS) {
            // Check if done
            if (currentOrder === targetOrder) {
                return currentGroup;
            }

            // A. Pick a candidate p-element
            // We use the SSA to generate uniformly random elements
            const g = _getRandomElement(ssa);
            
            // B. Extract p-part: h = g^(order(g)_{p'})
            // h will have order p^a
            const h = _getPPart(g, p);
            
            // Optimization: If h is already in currentGroup, skip
            // (We need an efficient contains check. currentGroup might not have SSA computed yet for speed.
            // But we can check generators equality or just proceed.)
            if (h === globalRepo.identity) {
                failures++;
                continue;
            }

            // C. Try to extend: candidate = <currentGroup, h>
            // We need to check if this generates a p-group.
            const newGens = currentGroup.union(
                new PermutationSet([h], true, false)
            );
            
            // Compute order of new group
            const newSSA = SchreierSimsAlgorithm.compute(newGens);
            const newOrder = newSSA.order;

            if (_isPowerOfP(newOrder, pBig)) {
                // Success: We found a larger p-subgroup
                if (newOrder > currentOrder) {
                    currentGroup = newGens;
                    currentOrder = newOrder;
                    failures = 0; // Reset failure counter on progress
                    
                    // console.log(`[Sylow] Extended to order ${currentOrder}`);
                    continue;
                }
            }

            // D. Strategy for "Stuck": Try Conjugates?
            // If we have a p-subgroup P, and h is a p-element, <P, h> might not be a p-group.
            // But maybe <P, h^x> is? Or maybe <P, g> where g is in N_G(P).
            // For simple random search, just counting as failure is often enough.
            failures++;
        }
        
        // If we exit loop without reaching target, we restart.
        // console.warn(`[Sylow] Restarting search... (Found ${currentOrder}, Wanted ${targetOrder})`);
    }

    throw new Error(`Failed to construct Sylow ${p}-subgroup. (Random search exhausted).`);
}


