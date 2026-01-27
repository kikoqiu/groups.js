/**
 * @fileoverview Global Repository for Permutation Data (Memory Arena Optimized).
 * 
 * ARCHITECTURE:
 * 1. Data Store: Flat Int32Array storing permutation values.
 * 2. Trie Store: Flat Int32Array (Memory Arena) managing Trie nodes.
 *    - Avoids JS Object allocation overhead.
 *    - Layout per node: [PermID, ChildPtr_0, ChildPtr_1, ..., ChildPtr_N-1]
 *    - Node Size = Degree + 1.
 */

import { decomposeToCycles } from "./group-utils";

const INITIAL_TRIE_MEMORY_BYTES = 1024 * 1024; // 1MB
const BYTES_PER_INT = 4;
const INITIAL_TRIE_SLOTS = INITIAL_TRIE_MEMORY_BYTES / BYTES_PER_INT;

/**
 * Manages and stores unique permutations using a memory-optimized approach.
 * It provides a global repository (`globalRepo`) to register permutations, assign unique IDs,
 * and retrieve their data efficiently. It uses a trie-like structure for fast lookup
 * and a flat Int32Array for permutation storage, minimizing GC overhead.
 * The repository dynamically expands its capacity and can upgrade its `globalDegree`
 * if permutations with larger degrees are registered.
 */
export class PermutationRepository {
    /**
     * @param {number} [initialDegree=4] - The initial degree (number of points) for permutations.
     *                                     The repository will automatically expand if permutations with higher degrees are registered.
     * @param {number} [initialPermCapacity=1024] - The initial capacity for storing permutations.
     *                                                The capacity will automatically expand as more unique permutations are registered.
     */
    constructor(initialDegree = 4, initialPermCapacity = 1024) {
        /**
         * The current maximum degree of all permutations stored in the repository.
         * Auto-expands as larger permutations are registered.
         * @type {number}
         */
        this.globalDegree = initialDegree;
        /**
         * The number of unique permutations currently stored in the repository.
         * Also serves as the next available ID for a new permutation.
         * @type {number}
         */
        this.count = 0;

        // ----------------------------------------------------
        // 1. PERMUTATION DATA POOL
        // ----------------------------------------------------
        /**
         * The current allocated capacity for storing permutations.
         * This defines the maximum number of unique permutations that can be stored
         * before the `permBuffer` needs to be expanded.
         * @type {number}
         */
        this.permCapacity = initialPermCapacity;
        /**
         * A flat Int32Array that stores the actual permutation data.
         * Each permutation of `globalDegree` size occupies `globalDegree` contiguous slots.
         * @type {Int32Array}
         */
        this.permBuffer = new Int32Array(this.permCapacity * this.globalDegree);

        // ----------------------------------------------------
        // 2. TRIE MEMORY ARENA
        // ----------------------------------------------------
        // Node Structure: [ID, Child_0, Child_1, ..., Child_N-1]
        // ID: -1 if not leaf, >=0 if leaf.
        // Child_k: -1 if null, >=0 pointer to next node index.
        /**
         * The size of each node in the trie buffer.
         * A node stores an ID and `globalDegree` child pointers.
         * @type {number}
         */
        this.trieNodeSize = this.globalDegree + 1; 
        /**
         * A flat Int32Array representing the memory arena for the trie nodes.
         * @type {Int32Array}
         */
        this.trieBuffer = new Int32Array(INITIAL_TRIE_SLOTS);
        /**
         * Pointer to the next available slot in the `trieBuffer` for allocating a new node.
         * @type {number}
         */
        this.trieFreePtr = 0; // Points to next available slot

        // Initialize Root
        this._allocateNode(); 
        
        //identity is alway 0
        /**
         * The unique ID for the identity permutation. This is always 0.
         * @type {number}
         * @readonly
         */
        this.identity = this.register([]);
        if(this.identity!=0){
            throw new Error("this.identity != 0");
        }
    }

    /**
     * Allocates a new node from the Trie Buffer memory arena.
     * Auto-expands the buffer if more space is needed.
     * @returns {number} The starting index (pointer) of the newly allocated node within the `trieBuffer`.
     * @private
     */
    _allocateNode() {
        // Check overflow
        if (this.trieFreePtr + this.trieNodeSize > this.trieBuffer.length) {
            this._expandTrieBuffer();
        }

        const ptr = this.trieFreePtr;
        const size = this.trieNodeSize;

        // Initialize node memory to -1 (Empty/Null)
        // Note: Manual loop is often faster than .fill() on small segments in V8
        for (let i = 0; i < size; i++) {
            this.trieBuffer[ptr + i] = -1;
        }

        this.trieFreePtr += size;
        return ptr;
    }

    /**
     * Expands the `trieBuffer` (memory arena for trie nodes) when it runs out of space.
     * Doubles the current capacity.
     * @private
     */
    _expandTrieBuffer() {
        const oldLen = this.trieBuffer.length;
        const newLen = oldLen * 2;
        // console.debug(`[Repo] Trie Arena expansion: ${oldLen} -> ${newLen}`);
        
        const newBuf = new Int32Array(newLen);
        newBuf.set(this.trieBuffer);
        this.trieBuffer = newBuf;
    }

    /**
     * Registers a permutation (or retrieves its existing ID if already registered).
     * If the input permutation's degree is greater than the current `globalDegree`,
     * the repository will automatically upgrade its degree.
     * @param {ArrayLike<number>} rawPerm - The permutation to register, represented as an array-like object (e.g., `[0, 2, 1]`).
     * @returns {number} The unique ID assigned to the permutation.
     */
    register(rawPerm) {
        const inputLen = rawPerm.length;
        
        // 1. Auto-Upgrade Degree
        if (inputLen > this.globalDegree) {
            this._upgradeDegree(inputLen);
        }

        // 2. Check Permutation Pool Capacity
        if (this.count >= this.permCapacity) {
            this._expandPermCapacity();
        }

        const n = this.globalDegree;
        
        // 3. Trie Walk (No Object Allocation)
        let currNodePtr = 0; // Root is always at 0

        for (let i = 0; i < n; i++) {
            // Value is rawPerm[i] or Identity(i) if padded
            const val = (i < inputLen) ? rawPerm[i] : i;
            
            // Pointer to the child slot in the flat array
            // Layout: [ID, Child0, Child1...]
            // So Child_k is at: currNodePtr + 1 + k
            const childSlotIdx = currNodePtr + 1 + val;
            
            let nextNodePtr = this.trieBuffer[childSlotIdx];

            if (nextNodePtr === -1) {
                // Create missing path
                nextNodePtr = this._allocateNode();
                this.trieBuffer[childSlotIdx] = nextNodePtr;
            }

            currNodePtr = nextNodePtr;
        }

        // 4. Retrieve or Assign ID
        // The ID is stored at the first slot of the node (offset 0)
        let id = this.trieBuffer[currNodePtr];

        if (id === -1) {
            // New Permutation
            id = this.count++;
            this.trieBuffer[currNodePtr] = id;
            this._writeToPermBuffer(id, rawPerm, inputLen);
        }

        return id;
    }

    /**
     * Retrieves the permutation data for a given ID.
     * Returns a zero-copy view (subarray) of the internal `permBuffer`.
     * @param {number} id - The unique ID of the permutation to retrieve.
     * @returns {Int32Array} A subarray representing the permutation (e.g., `[0, 1, 2]`).
     */
    get(id) {
        const start = id * this.globalDegree;
        return this.permBuffer.subarray(start, start + this.globalDegree);
    }

    /**
     * Retrieves the permutation for a given ID and converts it into a 1-based cycle notation string.
     * @param {number} id - The unique ID of the permutation.
     * @returns {string} The cycle notation string (e.g., "(1 2 3)(4 5)"). Returns "()" for the identity permutation.
     */
    getAsCycles(id) {
        return decomposeToCycles(this.get(id));
    }

    /**
     * Writes a new permutation into the `permBuffer` at the specified ID's location.
     * Pads with identity mappings if `inputArr` is shorter than `globalDegree`.
     * @param {number} id - The unique ID assigned to this permutation.
     * @param {ArrayLike<number>} inputArr - The raw permutation array-like object.
     * @param {number} validLen - The actual length of the `inputArr` to copy.
     * @private
     */
    _writeToPermBuffer(id, inputArr, validLen) {
        const n = this.globalDegree;
        const offset = id * n;
        for (let i = 0; i < validLen; i++) this.permBuffer[offset + i] = inputArr[i];
        for (let i = validLen; i < n; i++) this.permBuffer[offset + i] = i;
    }

    /**
     * Expands the `permBuffer` (permutation data pool) when it runs out of space.
     * Doubles the current capacity, copying existing data to the new buffer.
     * @private
     */
    _expandPermCapacity() {
        this.permCapacity *= 2;
        const newBuf = new Int32Array(this.permCapacity * this.globalDegree);
        newBuf.set(this.permBuffer);
        this.permBuffer = newBuf;
    }

    /**
     * Upgrades the `globalDegree` of the repository.
     * This is a "stop-the-world" operation that rebuilds both the permutation pool and the trie.
     * Existing permutations are padded with identity mappings to match the new degree.
     * @param {number} newDegree - The new, larger degree to upgrade to.
     * @private
     */
    _upgradeDegree(newDegree) {
        // console.warn(`[Repo] Upgrading degree ${this.globalDegree} -> ${newDegree}`);
        
        const oldDegree = this.globalDegree;
        const oldPermBuffer = this.permBuffer;
        const totalPerms = this.count;

        // 1. Update Config
        this.globalDegree = newDegree;
        this.trieNodeSize = newDegree + 1; // Update Node Stride

        // 2. Reallocate Perm Buffer (Data Migration)
        this.permBuffer = new Int32Array(this.permCapacity * newDegree);
        for (let i = 0; i < totalPerms; i++) {
            const oldStart = i * oldDegree;
            const newStart = i * newDegree;
            // Copy
            for (let k = 0; k < oldDegree; k++) this.permBuffer[newStart + k] = oldPermBuffer[oldStart + k];
            // Pad
            for (let k = oldDegree; k < newDegree; k++) this.permBuffer[newStart + k] = k;
        }

        // 3. Reset and Rebuild Trie Completely
        // We reuse the existing trie buffer memory, just reset the pointer.
        this.trieFreePtr = 0; 
        
        // Re-initialize Root
        this._allocateNode();

        // Re-insert all existing permutations
        // This is necessary because the tree depth and node stride have changed.
        for (let id = 0; id < totalPerms; id++) {
            const permOffset = id * newDegree;
            
            let currNodePtr = 0;
            
            for (let i = 0; i < newDegree; i++) {
                const val = this.permBuffer[permOffset + i];
                const childSlotIdx = currNodePtr + 1 + val;
                
                let nextNodePtr = this.trieBuffer[childSlotIdx];
                if (nextNodePtr === -1) {
                    nextNodePtr = this._allocateNode();
                    this.trieBuffer[childSlotIdx] = nextNodePtr;
                }
                currNodePtr = nextNodePtr;
            }
            
            // Restore ID
            this.trieBuffer[currNodePtr] = id;
        }
    }

    /**
     * Computes the inverse of a given permutation ID.
     * If the inverse has already been registered, its ID is retrieved; otherwise, it's computed and registered.
     * @param {number} id - The ID of the permutation to invert.
     * @returns {number} The ID of the inverse permutation.
     */
    inverse(id) {
        if (id === this.identity) return this.identity;

        const N = this.globalDegree;
        const buf = this.permBuffer;
        const off = id * N;
        const res = new Int32Array(N);

        // Inversion loop: if p[i] = val, then inv[val] = i
        for (let k = 0; k < N; k++) {
            res[buf[off + k]] = k;
        }

        return this.register(res);
    }

    /**
     * Multiplies two permutations, `idA` and `idB`, according to the convention (A * B)(x) = A(B(x)).
     * This means permutation `idB` is applied first, then `idA`.
     * The resulting permutation is registered, and its ID is returned.
     * Exposed as Public API for solvers.
     * @param {number} idA - The ID of the first permutation (A).
     * @param {number} idB - The ID of the second permutation (B).
     * @returns {number} The ID of the resulting permutation (A * B).
     */
    multiply(idA, idB) {
        // Fast paths for identity
        if (idA === this.identity) return idB;
        if (idB === this.identity) return idA;

        const N = this.globalDegree;
        const buf = this.permBuffer;
        
        const res = new Int32Array(N);
        const offA = idA * N;
        const offB = idB * N;

        // Vectorizable loop: res[k] = A[B[k]]
        for (let k = 0; k < N; k++) {
            const valB = buf[offB + k];
            res[k] = buf[offA + valB];
        }

        return this.register(res);
    }


    
    /**
     * Computes the conjugate of permutation `h` by `g`: `g * h * g^-1`.
     * This operation results in a permutation that has the same cycle structure as `h`.
     * @param {number} g - The ID of the conjugating permutation (g).
     * @param {number} h - The ID of the permutation to be conjugated (h).
     * @returns {number} The ID of the resulting conjugated permutation (g * h * g^-1).
     */
    conjugate(g, h) {
        const gInv = this.inverse(g);
        const gh = this.multiply(g, h);
        return this.multiply(gh, gInv);
    }

    /**
     * Computes the commutator of two permutations: `[idA, idB] = idA^-1 * idB^-1 * idA * idB`.
     * @param {number} idA - The ID of the first permutation (a).
     * @param {number} idB - The ID of the second permutation (b).
     * @returns {number} The ID of the resulting commutator permutation.
     */
    commutator(idA, idB) {
        const invA = this.inverse(idA);
        const invB = this.inverse(idB);
        const step1 = this.multiply(invA, invB);
        const step2 = this.multiply(step1, idA);
        return this.multiply(step2, idB);
    }



}

/**
 * Singleton instance of the PermutationRepository.
 * All permutation operations should typically go through this global instance
 * to ensure consistent ID management and memory optimization.
 * @type {PermutationRepository}
 */
export var globalRepo = new PermutationRepository();

/**
 * Resets the global permutation repository.
 * This function clears all registered permutations and re-initializes
 * `globalRepo` to a new empty PermutationRepository instance.
 * Use with caution, as all previously obtained permutation IDs will become invalid.
 */
export function resetGlobalRepo(){
    globalRepo = new PermutationRepository();
}