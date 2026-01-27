/**
 * @fileoverview Cayley Graph Data Generator & 3D Physics Engine.
 * 
 * Transforms Group Elements into a Graph Structure.
 * Provides a specialized Force Simulator for symmetric 3D layout compatible with Plotly.
 * Supports:
 * - Configurable physics parameters.
 * - Simulated Annealing (Jitter decay).
 * - Planar flattening & Convexity forces for cycles.
 * - 3D Arrows (Cones) visualization optimization.
 */

import { globalRepo } from './permutation-repository.js';
import { analyzeGenerators } from './group-structural-utils.js';
import { generateNames } from './group-visualizer.js';
import { generateGroup, PermutationSet } from './group-engine.js';
import { SchreierSimsAlgorithm } from './schreier-sims.js';

/**
 * @typedef {object} _CayleyGraphConfig
 * @property {number} d0 - Base distance factor. Used to determine ideal edge length (d0 / order).
 * @property {number} repulsion - Strength of the Coulomb-like repulsive force between all nodes.
 * @property {number} edgeStrength - Spring constant for edges directly connecting elements (Hooke's law).
 * @property {number} chordStrength - Spring constant for 'chord' edges in cycles, maintaining their geometric shape.
 * @property {number} planarStrength - Strength of the force that flattens cycles onto a plane.
 * @property {number} convexityStrength - Strength of the force that pushes nodes away from the center of a cycle, maintaining convexity.
 * @property {number} initialOffsetDist - Magnitude of random initial displacement applied to cycle groups to untangle them during setup.
 * @property {number} decay - Velocity damping factor, reducing oscillation.
 * @property {number} centerPull - Strength of the gravitational force pulling all nodes towards the origin.
 * @property {number} timeStep - Simulation time step for integration.
 * @property {number} jitterMax - Maximum random displacement applied to nodes during the initial annealing phase.
 * @property {number} dynamicAngleUpdateRate - How often (in ticks) to recalculate average angles for chord length adjustment. Set to 0 to disable.
 * @property {number} warmupRuns - Number of simulation ticks to run during the warmup phase for initial layout.
 * @property {boolean} advancedMode - If true, returns detailed simulator objects; otherwise, returns only Plotly frame.
 * @property {Map<number, string>} nameMap - the nameMap to use for the full group elements. Use generateNames to generate.
 * @property {boolean} rewriteToStrongGenerators - use SSA to rewrite generators to StrongGenerators.
 * @see generateNames
 */


// Default Configuration
/** 
 * @type {_CayleyGraphConfig} 
 * @private
*/
const _DefaultCayleyGraphConfig = {
    d0: 50,              // Base distance factor (d0 / order)
    repulsion: 300,      // Coulomb repulsion
    edgeStrength: 1.0,   // Hooke's law spring constant
    chordStrength: 0.5,  // Geometry maintaining chord strength
    planarStrength: 0.3, // Force to flatten cycles onto a plane
    convexityStrength: 0.2, // Force pushing nodes away from cycle center (keep convex)
    initialOffsetDist: 5.0, // Magnitude of random offset per cycle group
    decay: 0.90,         // Velocity damping
    centerPull: 0.015,   // Gravity to origin
    timeStep: 0.3,
    jitterMax: 10.0,       // Max random displacement during annealing start
    dynamicAngleUpdateRate: 1, // Recalculate average angles every N ticks
    warmupRuns: 2000,
    advancedMode: false,
    nameMap: undefined,
};

/**
 * @typedef {object} CayleyGraphData
 * @property {Array<object>} nodes - Array of node objects with id, name, x, y, z, vx, vy, vz properties.
 * @property {Array<object>} links - Array of link objects with source, target, genId, color, order, isDirected properties.
 * @property {Array<object>} legend - Array of legend objects with label, color, genId properties.
 * @property {VisualizerCayleyForceSimulator} simulator - The force simulator instance.
 * @property {_CayleyGraphConfig} config - The effective physics configuration used.
 * @property {Map<number, string>} nameMap - the used nameMap
 */

/**
 * Generates the graph data structure for a Cayley graph, including nodes, links, and a physics simulator.
 * This function can return either a full data structure for advanced usage or a Plotly-ready frame.
 * @param {number[]|PermutationSet} inputIds - Array of generator IDs used to construct the group.
 * @param {Partial<_CayleyGraphConfig>} [customConfig={}] - Optional physics configuration overrides.
 * @param {number[]|PermutationSet} [extraGenerators=[]] - Optional additional generators to visualize but exclude from physics forces.
 * @returns {CayleyGraphData | {data: Array<object>, layout: object, nameMap: Map<number, string>}} Returns a `CayleyGraphData` object if `config.advancedMode` is true, otherwise returns a Plotly-compatible object `{data, layout, nameMap}`.
 * @see generateNames
 * @throws {Error} If no generators are provided.
 */
export function generateCayleyGraphForPlotly(inputIds, customConfig = {}, extraGenerators = []) {
    if(inputIds instanceof PermutationSet){
        inputIds = Array.from(inputIds.indices);
    }
    // Handle extraGenerators type
    if(extraGenerators instanceof PermutationSet){
        extraGenerators = Array.from(extraGenerators.indices);
    }

    // Merge Config
    const config = { ..._DefaultCayleyGraphConfig, ...customConfig };

    // 1. Analyze Generators
    const { fundamental } = analyzeGenerators(inputIds);
    const generators = fundamental;

    if (generators.length === 0) {
        throw new Error("No generators provided.");
    }

    // Combine for visualization: remove duplicates from extra that are already in fundamental
    const effectiveExtra = extraGenerators.filter(g => !generators.includes(g));
    const allVisualGenerators = [...generators, ...effectiveExtra];

    // Expand Group & Generate Names
    const allElements = Array.from(generateGroup(generators).indices);
    let nameMap;
    if(customConfig.nameMap){
        nameMap = customConfig.nameMap;
         // Ensure every element has a name
        for (const id of allElements) {
            if (!nameMap.has(id)) {
                throw new Error(`Insufficient names: Element ID ${id} is missing from nameMap.`);
            }
        }
    }else{        
        nameMap = generateNames(allElements, generators);
    }
    const colors = [
        "#000000", //  (Black)
        "#FF0000", //  (Red)
        "#00FF00", //  (Lime)
        "#0000FF", //  (Blue)
        "#FFFF00", //  (Yellow)
        "#00FFFF", //  (Cyan)
        "#FF00FF", //  (Magenta)
        "#800000", //  (Maroon)
        "#008000", //  (Green)
        "#000080", //  (Navy)
        "#808000", //  (Olive)
        "#800080", //  (Purple)
        "#008080", //  (Teal)
        "#FFA500", //  (Orange)
    ];
    
    let usedColor = [];

    const genMeta = new Map();
    // Calculate metadata for ALL generators (fundamental + extra)
    allVisualGenerators.forEach((genId) => {
        let order = 1;
        let curr = genId;
        const idIdentity = globalRepo.identity;
        
        while (curr !== idIdentity && order < 2000) { 
            curr = globalRepo.multiply(curr, genId);
            order++;
        }
        let cIdx=(genId*1597) % colors.length;
        while(usedColor[cIdx] && allVisualGenerators.length <= colors.length){
            cIdx++;
        }
        usedColor[cIdx]=1;

        genMeta.set(genId, {
            id: genId,
            label: nameMap.get(genId) || `g${genId}`, // Fallback if nameMap generated only for fundamental group elements usually covers it, but safe fallback
            color: colors[cIdx],
            order: order,
            isDirected: order > 2 
        });
    });
     

    // 4. Build Nodes (Initialize with small random noise)
    // We map ID to the node object directly to apply offsets easily later
    const nodeObjMap = new Map();
    const nodes = allElements.map(id => {
        const node = {
            id: id,
            name: nameMap.get(id),
            x: (Math.random() - 0.5) * 2,
            y: (Math.random() - 0.5) * 2,
            z: (Math.random() - 0.5) * 2,
            vx: 0, vy: 0, vz: 0
        };
        nodeObjMap.set(id, node);
        return node;
    });

    // 5. Build Links & Constraints
    const links = [];
    const physicsConstraints = {
        edges: [],
        chords: [],
        cycles: [],
        angleTriplets: [] // Stores {genId, center, prev, next} for measuring angles
    };

    const addedPhysicsEdges = new Set();
    const getEdgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
    
    // Track visited elements for cycle detection (Only for fundamental generators)
    const cycleVisited = new Map(); 
    generators.forEach(g => cycleVisited.set(g, new Set()));

    for (const elemId of allElements) {
        // Iterate over ALL visual generators to draw lines
        for (const genId of allVisualGenerators) {
            const targetId = globalRepo.multiply(elemId, genId);
            
            // Note: targetId might not be in allElements if extraGenerators generate a supergroup,
            // but for a Cayley graph of G, inputIds generate G. 
            // If extraGenerators are NOT in G, targetId won't be in nodeObjMap.
            // We skip if target is not in the generated group.
            if (!nodeObjMap.has(targetId)) continue; 

            const meta = genMeta.get(genId);

            // A. Visual Link (Always add for visualization)
            links.push({
                source: elemId,
                target: targetId,
                genId: genId,
                color: meta.color,
                order: meta.order,
                isDirected: meta.isDirected
            });

            // --- PHYSICS SECTION START ---
            // Only apply physics forces for fundamental generators
            if (generators.includes(genId)) {
                
                // B. Physics Edge (Inverse Hooke: d0 / Order)
                // Higher order = shorter edges (tight loops)
                const edgeKey = getEdgeKey(elemId, targetId);
                const targetDist = config.d0 / meta.order; 
                
                if (elemId !== targetId && !addedPhysicsEdges.has(edgeKey)) {
                    addedPhysicsEdges.add(edgeKey);
                    physicsConstraints.edges.push({
                        source: elemId,
                        target: targetId,
                        dist: targetDist,
                        strength: config.edgeStrength
                    });
                }

                // C. Chord Constraints (Order > 2)
                if (meta.order > 2) {
                    const nextTargetId = globalRepo.multiply(targetId, genId);
                    
                    const prevId = globalRepo.multiply(elemId, globalRepo.inverse(genId));

                    // 1. Register Angle Triplet (Prev -> Center -> Next)
                    // Used to calculate the average angle for this generator
                    physicsConstraints.angleTriplets.push({
                        genId: genId,
                        center: elemId,
                        prev: prevId, // node * g^-1
                        next: targetId // node * g
                    });

                    // For Order > 3, we add chords to maintain shape
                    if (meta.order > 3 && elemId !== nextTargetId) {
                        const chordKey = getEdgeKey(elemId, nextTargetId);
                        // Geometric chord length for regular n-gon
                        // Side length 'a' = targetDist
                        // Chord 'c' connects vertices separated by 1 vertex
                        // Interior angle (at vertex) is not needed directly, we need angle at center? 
                        // Simpler: Cosine rule on the triangle of 2 edges and 1 chord.
                        // Angle between two edges in regular n-gon is (n-2)pi/n.
                        const theta = ((meta.order - 2) * Math.PI) / meta.order;
                        const chordLen = Math.sqrt(
                            2 * (targetDist * targetDist) - 
                            2 * (targetDist * targetDist) * Math.cos(theta)
                        );

                        if (!addedPhysicsEdges.has(chordKey)) {
                            physicsConstraints.chords.push({
                                source: elemId,
                                target: nextTargetId,
                                dist: chordLen,
                                strength: config.chordStrength
                            });
                        }
                    }
                }

                // D. Cycle Detection & Initial Separation Offset
                // If we encounter a new cycle for this generator
                if (meta.order > 1) {
                    const visitedSet = cycleVisited.get(genId);
                    if (visitedSet && !visitedSet.has(elemId)) {
                        // 1. Trace the cycle
                        const cycleIndices = [];
                        let currTrace = elemId;
                        for(let k=0; k < meta.order; k++) {
                            visitedSet.add(currTrace);
                            cycleIndices.push(currTrace);
                            currTrace = globalRepo.multiply(currTrace, genId);
                        }
                        
                        if(meta.order>2){
                            physicsConstraints.cycles.push({
                                indices: cycleIndices,
                                genId: genId
                            });
                        }

                        // 2. Apply Initial Random Offset to this cluster
                        // This helps separate tangled cycles at startup
                        let os = (meta.order+1) * (meta.order+1);
                        const dx = (Math.random() - 0.5) * config.initialOffsetDist * os;
                        const dy = (Math.random() - 0.5) * config.initialOffsetDist * os;
                        const dz = (Math.random() - 0.5) * config.initialOffsetDist * os;

                        cycleIndices.forEach(nodeId => {
                            const n = nodeObjMap.get(nodeId);
                            if (n) {
                                n.x += dx;
                                n.y += dy;
                                n.z += dz;
                            }
                        });
                    }
                }
            }
        }
    }

    // 6. Build Legend
    const legend = Array.from(genMeta.values()).map(m => ({
        label: `${m.label} (Order ${m.order})`,
        color: m.color,
        genId: m.id
    }));

    // 7. Initialize Simulator
    // Note: We pass allVisualGenerators to the simulator so getPlotlyFrame draws all of them,
    // but the physicsConstraints only contain edges/chords for the fundamental set.
    const simulator = new VisualizerCayleyForceSimulator(nodes, physicsConstraints, allVisualGenerators, genMeta, config);
    if(config.warmupRuns>0){
        simulator.warmup(config.warmupRuns);
    }

    if(config.advancedMode){
        return { nodes, links, legend, simulator, config, nameMap };
    }else{
        return { nameMap, ... simulator.getPlotlyFrame()};
    }    
}

/**
 * Specialized 3D Force Simulator implementing a physics-based layout algorithm with simulated annealing.
 * It's designed to position nodes and edges of a Cayley graph in 3D space,
 * applying forces like repulsion, spring forces, and cycle-specific planar/convexity forces.
 */
export class VisualizerCayleyForceSimulator {
    /**
     * @param {Array<object>} nodes - An array of node objects, each with 'id', 'x', 'y', 'z', 'vx', 'vy', 'vz' properties.
     * @param {object} constraints - An object containing arrays of 'edges', 'chords', 'cycles', and 'angleTriplets'.
     * @param {number[]} generators - An array of generator IDs.
     * @param {Map<number, object>} genMeta - A map from generator ID to its metadata (e.g., color, order).
     * @param {_CayleyGraphConfig} config - The physics configuration for the simulator.
     */
    constructor(nodes, constraints, generators, genMeta, config) {
        this.nodes = nodes; 
        this.edges = constraints.edges;
        this.chords = constraints.chords;
        this.cycles = constraints.cycles; 
        this.angleTriplets = constraints.angleTriplets;
        this.generators = generators;
        this.genMeta = genMeta;
        this.config = config;
        this.nodeMap = new Map();
        this.nodes.forEach(n => this.nodeMap.set(n.id, n));
    }

    /**
     * Executes one step of the physics simulation.
     * Applies forces, integrates velocities, and updates node positions.
     * @param {number} [jitterFactor=0] - The magnitude of random noise to apply to node positions, used for simulated annealing during warmup.
     */
    tick(jitterFactor = 0) {
        const nCount = this.nodes.length;
        const cfg = this.config;

        if(this.config.dynamicAngleUpdateRate > 0 && this.tickCount % this.config.dynamicAngleUpdateRate == 0){
            this._updateChordTargets();
        }

        // 1. Reset & Center Gravity
        for (let i = 0; i < nCount; i++) {
            const n = this.nodes[i];
            n.fx = -n.x * cfg.centerPull;
            n.fy = -n.y * cfg.centerPull;
            n.fz = -n.z * cfg.centerPull;

            // Apply Jitter (Annealing)
            if (jitterFactor > 0) {
                n.x += (Math.random() - 0.5) * jitterFactor;
                n.y += (Math.random() - 0.5) * jitterFactor;
                n.z += (Math.random() - 0.5) * jitterFactor;
            }
        }

        // 2. Repulsion
        for (let i = 0; i < nCount; i++) {
            const n1 = this.nodes[i];
            for (let j = i + 1; j < nCount; j++) {
                const n2 = this.nodes[j];
                const dx = n1.x - n2.x;
                const dy = n1.y - n2.y;
                const dz = n1.z - n2.z;
                let distSq = dx*dx + dy*dy + dz*dz;
                if (distSq < 0.1) distSq = 0.1;

                const force = cfg.repulsion / distSq;
                const dist = Math.sqrt(distSq);
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                const fz = (dz / dist) * force;

                n1.fx += fx; n1.fy += fy; n1.fz += fz;
                n2.fx -= fx; n2.fy -= fy; n2.fz -= fz;
            }
        }

        // 3. Springs (Edges & Chords)
        this._applySprings(this.edges);
        this._applySprings(this.chords);

        // 4. Planar & Convexity Forces for Cycles
        this._applyCycleForces();

        // 5. Integration
        for (let i = 0; i < nCount; i++) {
            const n = this.nodes[i];
            n.vx = (n.vx + n.fx * cfg.timeStep) * cfg.decay;
            n.vy = (n.vy + n.fy * cfg.timeStep) * cfg.decay;
            n.vz = (n.vz + n.fz * cfg.timeStep) * cfg.decay;
            n.x += n.vx * cfg.timeStep;
            n.y += n.vy * cfg.timeStep;
            n.z += n.vz * cfg.timeStep;
        }
    }

    
    /**
     * Dynamically adjusts the ideal lengths of chord constraints based on the average observed angles within each cycle.
     * This helps maintain the geometric integrity of cycles as the graph settles.
     * @private
     */
    _updateChordTargets() {
        const stats = new Map(); // genId -> { sumAngle, count }

        // A. Statistics Phase: Measure all current angles
        for (const tri of this.angleTriplets) {
            const center = this.nodeMap.get(tri.center);
            const prev = this.nodeMap.get(tri.prev);
            const next = this.nodeMap.get(tri.next);
            if (!center || !prev || !next) continue;

            // Vectors center->prev (u) and center->next (v)
            const ux = prev.x - center.x, uy = prev.y - center.y, uz = prev.z - center.z;
            const vx = next.x - center.x, vy = next.y - center.y, vz = next.z - center.z;

            const dot = ux*vx + uy*vy + uz*vz;
            const magU = Math.sqrt(ux*ux + uy*uy + uz*uz);
            const magV = Math.sqrt(vx*vx + vy*vy + vz*vz);

            if (magU > 1e-4 && magV > 1e-4) {
                // Clamp for acos safety
                let cosTheta = dot / (magU * magV);
                if (cosTheta > 1) cosTheta = 1;
                if (cosTheta < -1) cosTheta = -1;
                const angle = Math.acos(cosTheta);

                if (!stats.has(tri.genId)) stats.set(tri.genId, { sum: 0, count: 0 });
                const entry = stats.get(tri.genId);
                entry.sum += angle;
                entry.count++;
            }
        }

        // B. Update Phase: Set new chord targets based on average angle
        const avgAngles = new Map();
        for (const [genId, data] of stats.entries()) {
            if (data.count > 0) {
                avgAngles.set(genId, data.sum / data.count);
            }
        }

        for (const chord of this.chords) {
            if (avgAngles.has(chord.genId)) {
                const thetaAvg = avgAngles.get(chord.genId);
                const meta = this.genMeta.get(chord.genId);
                const idealEdgeLen = meta.targetEdgeLength;

                // Law of Cosines: c^2 = a^2 + b^2 - 2ab cos(theta)
                // Here a = b = idealEdgeLen
                const newDist = Math.sqrt(
                    2 * (idealEdgeLen * idealEdgeLen) * (1 - Math.cos(thetaAvg))
                );

                // Softly update distance (LERP could be used for smoothness, direct set for responsiveness)
                chord.dist = newDist;
            }
        }
    }


    /**
     * Applies Hooke's Law (spring forces) to a list of links (edges or chords).
     * @param {Array<object>} list - An array of link objects, each with 'source', 'target', 'dist', 'strength' properties.
     * @private
     */
    _applySprings(list) {
        for (const link of list) {
            const n1 = this.nodeMap.get(link.source);
            const n2 = this.nodeMap.get(link.target);
            if (!n1 || !n2) continue;

            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const dz = n2.z - n1.z;
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) || 0.001;
            
            const displacement = dist - link.dist;
            const forceMag = link.strength * displacement;

            const fx = (dx / dist) * forceMag;
            const fy = (dy / dist) * forceMag;
            const fz = (dz / dist) * forceMag;

            n1.fx += fx; n1.fy += fy; n1.fz += fz;
            n2.fx -= fx; n2.fy -= fy; n2.fz -= fz;
        }
    }

    /**
     * Applies forces to cycle nodes to encourage planar and convex arrangements.
     * Calculates a centroid and normal vector for each cycle to guide these forces.
     * @private
     */
    _applyCycleForces() {
        const planarStr = this.config.planarStrength;
        const convexStr = this.config.convexityStrength;

        for (const cycle of this.cycles) {
            const indices = cycle.indices;
            const len = indices.length;
            if (len < 3) continue;

            // A. Calculate Centroid
            let cx = 0, cy = 0, cz = 0;
            const points = [];
            for (const id of indices) {
                const n = this.nodeMap.get(id);
                points.push(n);
                cx += n.x; cy += n.y; cz += n.z;
            }
            cx /= len; cy /= len; cz /= len;

            // B. Calculate Average Normal (for flattening)
            let nx = 0, ny = 0, nz = 0;
            for (let i = 0; i < len; i++) {
                const p1 = points[i];
                const p2 = points[(i + 1) % len];
                
                const ax = p1.x - cx; const ay = p1.y - cy; const az = p1.z - cz;
                const bx = p2.x - cx; const by = p2.y - cy; const bz = p2.z - cz;

                nx += (ay * bz - az * by);
                ny += (az * bx - ax * bz);
                nz += (ax * by - ay * bx);
            }
            const normLen = Math.sqrt(nx*nx + ny*ny + nz*nz);
            if (normLen > 1e-6) {
                nx /= normLen; ny /= normLen; nz /= normLen;
                
                for (const p of points) {
                    const vx = p.x - cx;
                    const vy = p.y - cy;
                    const vz = p.z - cz;
                    
                    // 1. Planar Force (Flattening)
                    const distToPlane = vx*nx + vy*ny + vz*nz;
                    const fFlat = -distToPlane * planarStr;
                    
                    p.fx += nx * fFlat;
                    p.fy += ny * fFlat;
                    p.fz += nz * fFlat;

                    // 2. Convexity Force (Push away from centroid)
                    // Keep vector in-plane ideally, but radial push is usually enough
                    // We simply push along the vector (P - Centroid)
                    const distToCenter = Math.sqrt(vx*vx + vy*vy + vz*vz) || 0.1;
                    const fConvex = convexStr; 
                    
                    p.fx += (vx / distToCenter) * fConvex;
                    p.fy += (vy / distToCenter) * fConvex;
                    p.fz += (vz / distToCenter) * fConvex;
                }
            }
        }
    }

    /**
     * Runs the simulation for a specified number of iterations with simulated annealing.
     * The `jitterFactor` decays linearly during the first 90% of iterations, then remains at 0 for the last 10%.
     * @param {number} [iterations=2000] - The total number of simulation ticks to run during the warmup phase.
     */
    warmup(iterations = 2000) {
        const startJitter = this.config.jitterMax;
        
        for (let i = 0; i < iterations*9/10; i++) {
            // Linear interpolation of jitter from max to 0
            const progress = i / iterations;
            const currentJitter = startJitter * (1 - progress);
            
            this.tick(currentJitter);
        }

        for (let i = 0; i < iterations*1/10; i++) {            
            this.tick(0);
        }
    }

    /**
     * Generates a Plotly-compatible data frame (traces and layout) representing the current state of the Cayley graph.
     * Includes 3D scatter plots for nodes, lines for edges, and cones for directed edges.
     * @returns {{data: Array<object>, layout: object}} An object containing Plotly trace data and layout configuration.
     */
    getPlotlyFrame() {
        const traces = [];

        // 1. Edges grouped by generator
        this.generators.forEach(genId => {
            const meta = this.genMeta.get(genId);
            const x = [], y = [], z = [];
            const cx = [], cy = [], cz = [];
            const cu = [], cv = [], cw = [];

            this.nodes.forEach(node => {
                const targetId = globalRepo.multiply(node.id, genId);
                const targetNode = this.nodeMap.get(targetId);
                
                if (targetNode) {
                    // Line
                    x.push(node.x, targetNode.x, null);
                    y.push(node.y, targetNode.y, null);
                    z.push(node.z, targetNode.z, null);

                    // Cone (Arrow)
                    if (meta.isDirected) {
                        // Position at 90% towards target
                        const ratio = 0.9;
                        const mx = node.x + (targetNode.x - node.x) * ratio;
                        const my = node.y + (targetNode.y - node.y) * ratio;
                        const mz = node.z + (targetNode.z - node.z) * ratio;

                        const dx = targetNode.x - node.x;
                        const dy = targetNode.y - node.y;
                        const dz = targetNode.z - node.z;

                        cx.push(mx); cy.push(my); cz.push(mz);
                        cu.push(dx); cv.push(dy); cw.push(dz);
                    }
                }
            });

            // Lines
            if (x.length > 0) {
                traces.push({
                    type: 'scatter3d',
                    mode: 'lines',
                    name: meta.isDirected ? `Generator ${meta.label} (${meta.order})` : `Generator ${meta.label} (${meta.order})`,
                    x: x, y: y, z: z,
                    line: { color: meta.color, width: 4 },
                    hoverinfo: 'none'
                });
            }

            // Cones
            if (cx.length > 0) {
                traces.push({
                    type: 'cone',
                    name: `Arrows ${meta.label}`,
                    x: cx, y: cy, z: cz,
                    u: cu, v: cv, w: cw,
                    sizemode: 'absolute', 
                    sizeref: 2,    // Configurable size scale
                    anchor: 'center',
                    showscale: false,
                    colorscale: [[0, meta.color], [1, meta.color]],
                    hoverinfo: 'none'
                });
            }
        });

        // 2. Nodes
        const xn = [], yn = [], zn = [], text = [], color = [];
        this.nodes.forEach(n => {
            xn.push(n.x); yn.push(n.y); zn.push(n.z);
            text.push(n.name);
            color.push(n.id === globalRepo.identity ? '#000000' : '#888888');
        });

        traces.push({
            type: 'scatter3d',
            mode: 'markers',
            name: 'Elements',
            x: xn, y: yn, z: zn,
            text: text,
            marker: {
                size: 5,
                color: color,
                opacity: 0.9,
                line: { color: '#ffffff', width: 1 }
            },
            hoverinfo: 'text'
        });

        const layout = {
            margin: { l: 0, r: 0, b: 0, t: 0 },
            showlegend: true,
            legend: { x: 0, y: 1 },
            scene: {
                xaxis: { showgrid: false, zeroline: false, showticklabels: false, title: '' },
                yaxis: { showgrid: false, zeroline: false, showticklabels: false, title: '' },
                zaxis: { showgrid: false, zeroline: false, showticklabels: false, title: '' },
                bgcolor: 'rgba(0,0,0,0)'
            }
        };

        return { data: traces, layout };
    }
}