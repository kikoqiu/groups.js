import { globalRepo } from './permutation-repository.js';

// ============================================================================
// Private Utils
// ============================================================================

/**
 * Checks if a given number is a small prime.
 * Uses trial division for efficiency with smaller numbers.
 * @param {number} n - The number to check.
 * @returns {boolean} True if the number is prime, false otherwise.
 * @private
 */
export function _isSmallPrime(n) {
    if (n <= 1) return false;
    if (n <= 3) return true;
    if (n % 2 === 0 || n % 3 === 0) return false;
    for (let i = 5; i * i <= n; i += 6) {
        if (n % i === 0 || n % (i + 2) === 0) return false;
    }
    return true;
}


/**
 * Generates a pseudo-random element from the group represented by the given `SchreierSimsAlgorithm` instance.
 * @param {SchreierSimsAlgorithm} ssa - The `SchreierSimsAlgorithm` instance of the group.
 * @returns {number} The ID of a randomly selected permutation from the group.
 * @private
 */
export function _getRandomElement(ssa) {
    // Generate random element from base/transversal structure
    // g = t_1 * t_2 * ... * t_k
    let result = ssa.repo.identity;
    const depth = ssa.base.length;
    
    for (let i = 0; i < depth; i++) {
        const transversal = ssa.transversals[i];
        // Efficient random pick from Map
        const size = transversal.size;
        const randIdx = Math.floor(Math.random() * size);
        
        // Iterating map is O(size), but transversal size is usually <= Degree.
        // For performance, SSA could store arrays, but Map is robust.
        let k = 0;
        for (const permId of transversal.values()) {
            if (k === randIdx) {
                result = ssa.repo.multiply(result, permId);
                break;
            }
            k++;
        }
    }
    return result;
}




/**
 * Computes the exponentiation of a permutation: `gId^exp`.
 * Uses binary exponentiation (exponentiation by squaring) for efficiency.
 * @param {number} gId - The ID of the permutation (g).
 * @param {number} exp - The integer exponent.
 * @returns {number} The ID of the resulting permutation `gId^exp`.
 * @private
 */
export function _pow(gId, exp) {
    if (exp === 0) return globalRepo.identity;
    if (exp === 1) return gId;
    
    let base = gId;
    let result = globalRepo.identity;
    let e = exp;

    while (e > 0) {
        if (e % 2 === 1) {
            result = globalRepo.multiply(result, base);
        }
        base = globalRepo.multiply(base, base);
        e = Math.floor(e / 2);
    }
    return result;
}

/**
 * Computes the least common multiple (LCM) of two integers.
 * @param {number} a - The first integer.
 * @param {number} b - The second integer.
 * @returns {number} The least common multiple of a and b.
 * @private
 */
export function _lcm(a, b) {
    if (a === 0 || b === 0) return 0;
    return Math.abs((a * b) / _gcd(a, b));
}

/**
 * Computes the greatest common divisor (GCD) of two integers using the Euclidean algorithm.
 * @param {number} a - The first integer.
 * @param {number} b - The second integer.
 * @returns {number} The greatest common divisor of a and b.
 * @private
 */
export function _gcd(a, b) {
    while (b !== 0) {
        let t = b;
        b = a % b;
        a = t;
    }
    return a;
}

/**
 * Checks if a BigInt number `n` is a power of another BigInt `pBig`.
 * For example, if `pBig` is 2, it checks if `n` is 2^k for some k >= 0.
 * @param {bigint} n - The number to check.
 * @param {bigint} pBig - The base number (must be > 1).
 * @returns {boolean} True if `n` is a power of `pBig`, false otherwise.
 * @private
 */
export function _isPowerOfP(n, pBig) {
    let val = n;
    while (val > 1n) {
        if (val % pBig !== 0n) return false;
        val /= pBig;
    }
    return true;
}




/**
 * Extracts the p-part of a permutation `gId`.
 * Given a permutation `g` with order `|g| = p^k * m`, where `gcd(p, m) = 1`,
 * this function returns `g^m`, which is the p-part of `g` and has order `p^k`.
 * @param {number} gId - The ID of the permutation (g).
 * @param {number} p - The prime number p.
 * @returns {number} The ID of the p-part of the permutation.
 * @private
 */
export function _getPPart(gId, p) {    
    const perm = globalRepo.get(gId);
    const n = perm.length;
    const visited = new Uint8Array(n);
    let order = 1;

    // 1. Calculate Order via LCM of disjoint cycles
    for (let i = 0; i < n; i++) {
        if (visited[i]) continue;
        
        let curr = i;
        let len = 0;
        while (!visited[curr]) {
            visited[curr] = 1;
            curr = perm[curr];
            len++;
        }
        if (len > 1) {
            order = _lcm(order, len);
        }
    }

    if (order === 1) return globalRepo.identity;

    // 2. Factorize Order = p^k * m
    let m = order;
    while (m % p === 0) {
        m /= p;
    }

    // 3. Compute g^m
    // Binary exponentiation for permutations?
    // Since m is integer, standard "repeated squaring" or just repeated multiply.
    // For small m, linear is fine. For large m, binary is needed.
    // Group Engine doesn't have `pow`. We implement a quick one.
    
    return _pow(gId, m);
}

/**
 * Computes an approximate order of a permutation by finding the LCM of its cycle lengths.
 * If the order exceeds limit, it returns limit+1 as a sentinel value.
 * @param {*} perm - The permutation array.
 * @param {number} [limit=60] - The upper limit for the order.
 * @returns {number} - The approximate order of the permutation.
 */
export function calcApproxOrder(perm, limit=60) {
    const n = perm.length;
    const visited = new Uint8Array(n);
    let lcm = 1;
    for (let i = 0; i < n; i++) {
        if (visited[i]) continue;
        let curr = i, len = 0;
        while (!visited[curr]) {
            visited[curr] = 1;
            curr = perm[curr];
            len++;
        }
        if (len > 0) {
            lcm = _lcm(lcm, len);
            if (lcm > limit) return limit;
        }
    }
    return lcm;
}
