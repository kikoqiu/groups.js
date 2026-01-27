/**
 * @fileoverview Group Visualization & Representation Utilities.
 * 
 * This module transforms raw permutation data into human-readable structures
 * suitable for UI rendering (GroupExplorer).
 * 
 * Key Features:
 * 1. Generator Optimization (Redundancy check via SSA).
 * 2. Semantic Naming (BFS-based word problem solver: e, a, b, ab...).
 * 3. Cayley Table Generation (Matrix & HTML with Semantic Coloring & Tooltips).
 */

import { globalRepo } from './permutation-repository.js';
import { decomposeToCycles } from './group-utils.js';
import { analyzeGenerators } from './group-structural-utils.js';
import { generateGroup, PermutationSet } from './group-engine.js';

/**
 * Generates human-readable algebraic names for all group elements (e.g., 'e', 'a', 'b', 'ab', 'a^2').
 * This function uses a Breadth-First Search (BFS) approach, starting from the identity and generators,
 * to construct the shortest and most intuitive names based on generator products.
 * @param {number[]|PermutationSet} allElementIds - A sorted list of all unique permutation IDs belonging to the group.
 * @param {number[]|PermutationSet} generatorIds - A list of permutation IDs that are the fundamental generators of the group.
 * @param {string[]} [genLabels] - A list of strings that are the labels for the generators. Default to undefined means to use a,b,c,...
 * @returns {Map<number, string>} A Map where keys are permutation IDs and values are their corresponding generated algebraic names.
 */
export function generateNames(allElementIds, generatorIds, genLabels = undefined) {
    if(allElementIds instanceof PermutationSet){
        allElementIds = Array.from(allElementIds.indices);
    }
    if(generatorIds instanceof PermutationSet){
        generatorIds = Array.from(generatorIds.indices);
    }
    if(analyzeGenerators(generatorIds).redundant?.length>0){
        throw new Error("generateNames analyzeGenerators(generatorIds).redundant?.length>0");
    }

    const nameMap = new Map();
    const visited = new Set();
    
    // 0. Setup Generators Labels
    if(genLabels){
        if(genLabels.length<generatorIds.length){
            throw new Error("genLabels.length<generatorIds.length");
        }
    }else{
        // Limit to 26 generators for single letters, otherwise use g1, g2...
        genLabels = generatorIds.map((id, idx) => {
            return idx < 26 
                ? String.fromCharCode(97 + idx) // 'a', 'b', ...
                : `g${idx+1}`;
        });
    }

    const genMap = new Map();
    generatorIds.forEach((id, i) => genMap.set(id, genLabels[i]));

    // 1. Initialize BFS
    const queue = [];
    const idIdentity = globalRepo.identity;
    
    // Explicitly name Identity
    nameMap.set(idIdentity, 'e');
    visited.add(idIdentity);
    
    // Seed queue with generators
    for(let i = 0; i < generatorIds.length; i++) {
        const genId = generatorIds[i];
        const label = genLabels[i];
        
        if (genId === idIdentity) continue;

        nameMap.set(genId, label);
        visited.add(genId);
        queue.push({ id: genId, name: label, lastGen: label, power: 1 });
    }

    let head = 0;
    while(head < queue.length) {
        const curr = queue[head++];
        
        // Try multiplying by every generator
        for(let i = 0; i < generatorIds.length; i++) {
            const genId = generatorIds[i];
            const genLabel = genLabels[i];

            const nextId = globalRepo.multiply(curr.id, genId);

            if (!visited.has(nextId)) {
                visited.add(nextId);

                // Name Generation Logic
                let nextName = "";
                let nextPower = 1;
                
                if (curr.lastGen === genLabel) {
                    // Extension: a -> a^2
                    const baseName = curr.power > 1 
                        ? curr.name.substring(0, curr.name.lastIndexOf('^')) 
                        : curr.name;
                    
                    nextPower = curr.power + 1;
                    nextName = `${baseName}^${nextPower}`;
                } else {
                    // New generator direction
                    nextName = `${curr.name}${genLabel}`;
                    nextPower = 1;
                }

                nameMap.set(nextId, nextName);
                queue.push({ 
                    id: nextId, 
                    name: nextName, 
                    lastGen: genLabel, 
                    power: nextPower 
                });
            }
        }
    }

    // 3. Fallback for disconnected elements (sanity check)
    for (const id of allElementIds) {
        if (!nameMap.has(id)) {
            nameMap.set(id, decomposeToCycles(id));
        }
    }

    return nameMap;
}


/**
 * Generates a Multiplication (Cayley) Table for a group.
 * `inputIds` are treated as candidate generators. The function will determine a fundamental set of generators, expand the group to all its elements,
 * and generate names for them. The table will represent the full group.
 * 
 * return an object
 * A 2D array where `matrix[row][col]` is the permutation ID of `rowElement * colElement`.
 * A 2D array where `grid[row][col]` is the algebraic name (string) of `rowElement * colElement`.
 * A Map where keys are permutation IDs and values are their 1-based cycle notation strings (e.g., "(1 2 3)").
 * An HTML string representation of the Cayley table with semantic coloring and tooltips.
 * 
 * @param {number[]} inputIds - An array of candidate generator IDs.
 * @param {Map<number, string>} [nameMap=null] - Optional. A custom map of all permutation IDs to their display names. Use generateNames to generate.
 * @see generateNames
 * @returns {{
 *   matrix: number[][],
 *   grid: string[][],
 *   cycleMap: Map<number, string>,
 *   html: string,
 *   nameMap: Map<number, string>
 * }} An object containing the generated table data.
 * 
 * @throws {Error} If `nameMap` is provided in manual mode but is incomplete (missing names for `inputIds`).
 */
export function generateMultiplicationTable(inputIds, nameMap = null) {
    let tableElements;
    let finalNames = nameMap;

    // Step A: Analyze and clean generators
    const analysis = analyzeGenerators(inputIds);
    const fundamentalGens = analysis.fundamental;

    // Step B: Expand to find the Full Group
    tableElements = Array.from(generateGroup(fundamentalGens).indices);

    // Input is Generators -> Output is Full Table
    if (!finalNames) {
        finalNames = generateNames(tableElements, fundamentalGens);
    }
    else {
        // Ensure every element has a name
        for (const id of tableElements) {
            if (!finalNames.has(id)) {
                throw new Error(`Insufficient names: Element ID ${id} is missing from nameMap.`);
            }
        }
    }

    const size = tableElements.length;
    const matrix = new Array(size);
    const grid = new Array(size);
    const cycleMap = new Map();

    // Pre-calculate cycle notations for all elements in the table
    // (Using globalRepo.getAsCycles is efficient)
    for (const id of tableElements) {
        if (!cycleMap.has(id)) {
            cycleMap.set(id, globalRepo.getAsCycles(id));
        }
    }
    
    for (let r = 0; r < size; r++) {
        matrix[r] = new Int32Array(size);
        grid[r] = new Array(size);
        
        const rowId = tableElements[r];
        
        for (let c = 0; c < size; c++) {
            const colId = tableElements[c];
            const resId = globalRepo.multiply(rowId, colId);
            
            matrix[r][c] = resId;
            grid[r][c] = finalNames.get(resId);
            
            // Ensure cycle map has the result (should be in tableElements if closed, 
            // but safe to add if strictly multiplying outside closure in manual mode)
            if (!cycleMap.has(resId)) {
                cycleMap.set(resId, globalRepo.getAsCycles(resId));
            }
        }
    }

    // Pass matrix and cycleMap to helper for color lookup and tooltips
    const html = _renderHtmlTable(tableElements, grid, matrix, finalNames, cycleMap);
    return { matrix, grid, cycleMap, html, nameMap:finalNames };
}

/**
 * Renders an HTML string representation of a Cayley multiplication table.
 * The table includes semantic coloring, algebraic names, and cycle notation tooltips.
 * @param {number[]} elements - An array of permutation IDs representing the elements that form the table headers (both row and column).
 * @param {string[][]} grid - A 2D array of string names for the elements in the table cells.
 * @param {number[][]} matrix - A 2D array of permutation IDs for the elements in the table cells, used for coloring and cycle lookup.
 * @param {Map<number, string>} nameMap - A map from permutation ID to its algebraic name (e.g., 'e', 'a', 'ab').
 * @param {Map<number, string>} cycleMap - A map from permutation ID to its 1-based cycle notation string (e.g., "(1 2 3)").
 * @returns {string} An HTML string containing the formatted Cayley table.
 * @private
 */
function _renderHtmlTable(elements, grid, matrix, nameMap, cycleMap) {
    const size = elements.length;
    const idIdentity = globalRepo.identity;

    // 1. Generate Color Map (HSL)
    const colorMap = new Map();
    colorMap.set(idIdentity, '#ffffff');

    for (let i = 0; i < size; i++) {
        const id = elements[i];
        if (id === idIdentity) continue;
        const hue = Math.floor((i / size) * 360); 
        colorMap.set(id, `hsl(${hue}, 80%, 85%)`);
    }

    // Helper for name formatting
    const formatName = (name) => name.replace(/\^(\d+)/g, "<sup>$1</sup>");

    // Common Styles
    const tableStyle = 'border-collapse: collapse; text-align: center; font-family: sans-serif; cursor: default;';
    const cellStyleBase = 'padding: 8px; border: 1px solid #ccc; min-width: 30px;';

    let html = `<table class="cayley-table" style="${tableStyle}">\n`;

    // 2. Header Row
    html += '  <thead>\n    <tr>\n';
    html += `      <th class="cayley-corner" style="${cellStyleBase} background-color: #f0f0f0;">×</th>\n`;
    
    for (let i = 0; i < size; i++) {
        const id = elements[i];
        const name = formatName(nameMap.get(id));
        const cycles = cycleMap.get(id);
        const bg = colorMap.get(id);
        
        html += `      <th class="cayley-header" title="${cycles}" style="${cellStyleBase} background-color: ${bg};">${name}</th>\n`;
    }
    html += '    </tr>\n  </thead>\n';

    // 3. Body
    html += '  <tbody>\n';
    for (let r = 0; r < size; r++) {
        const rowId = elements[r];
        const rowName = formatName(nameMap.get(rowId));
        const rowCycles = cycleMap.get(rowId);
        const rowBg = colorMap.get(rowId);
        
        html += '    <tr>\n';
        
        // Row Header
        html += `      <th class="cayley-header" title="${rowCycles}" style="${cellStyleBase} background-color: ${rowBg};">${rowName}</th>\n`;

        for (let c = 0; c < size; c++) {
            const rawName = grid[r][c];
            const valName = formatName(rawName); // Apply superscript
            const valId = matrix[r][c];
            const valCycles = cycleMap.get(valId);
            
            const cellBg = colorMap.get(valId);
            const isIdentity = (valId === idIdentity);
            const cellClass = isIdentity ? 'cayley-cell cayley-identity' : 'cayley-cell';
            
            html += `      <td class="${cellClass}" title="${valCycles}" style="${cellStyleBase} background-color: ${cellBg};">${valName}</td>\n`;
        }
        html += '    </tr>\n';
    }
    html += '  </tbody>\n</table>';

    return html;
}