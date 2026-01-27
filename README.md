# Permutation Group Theory Engine for JavaScript

This project provides a high-performance JavaScript library for computational group theory, focusing on permutation groups. It offers efficient data structures and algorithms for handling permutations, performing group operations, analyzing group structure, and generating data for visualization.

##  Features

*   **High-Performance Permutation Handling**: Optimized `PermutationRepository` for efficient storage and retrieval of unique permutations using a Trie-like structure and `Int32Array` for zero-copy views.
*   **Permutation Set Operations**: `PermutationSet` for representing collections of permutations, supporting core algebraic operations (multiplication, inverse) and set operations (union, intersection, difference).
*   **Schreier-Sims Algorithm (SSA)**: Robust implementation for computing Base and Strong Generating Sets (BSGS), membership testing, order calculation, and stabilizer subgroups.
*   **Group Structural Analysis**: Functions to check subgroup and normality, compute normal closures, commutator subgroups, lower central series, and determine properties like solvability and nilpotency.
*   **Standard Group Generators**: Factory methods for generating common groups such as Symmetric ($S_n$), Alternating ($A_n$), Cyclic ($C_n$), Dihedral ($D_n$), Klein Four ($V_4$), and Quaternion ($Q_8$) groups.
*   **Visualization Utilities**: Tools for generating human-readable names for group elements, creating Cayley multiplication tables (with HTML output), and preparing Cayley graph data for 3D plotting (e.g., with Plotly).
*   **Memory Efficiency**: Designed with `Int32Array` and optimized algorithms to reduce garbage collection overhead and improve performance.

##  Installation

Assuming you have Node.js and npm/yarn installed:

```bash
npm install groupsjs
# or
yarn add groupsjs
```

If you are running this project locally, you can clone the repository:

```bash
git clone https://github.com/kikoqiu/groups.js.git
cd groups.js
npm install
```

##  Usage

[HERE](https://kikoqiu.github.io/jslab/jslab.html?zcode=pVbbbttGEH3nVwyEAF4GqmRLdB8iCAUhI26AuDXCIC-u4azJkbjwcpfYXTpVFf17sBdS1MVOiz4RXM6cOXPmshyPYaGQGgQKt6iqxlDDpMjQwFLJClYoUFEjlY5yKbSBbPqwQqFhDislm1qPcueerasKjWI5mcazCPNSkrNs2nN_B2fD1jmeRRFHA1XDD3HeK1kt1jnHzCgmVprcDcgUknhw38J-tdxuGm5Yzdfv4M0mgG7h7V_izaZq-Bbmu-NRFUxJ1fB4-9XGHo_h2hNDMCXCsuHc0-glaV937EIieG1fyS4Pn-mfqkAFcgnZtMvTGo40-wfjGYzHkJWy4QU8IvwaOQZB9k44HwmyBKgoIOUGlaCGiVX4kCYtueQnFUjiWWe6s8ryUiFDlbFKp3wlFTNlNcplVTcGSQC16njX9HSUHq9enPRfx0l3cbx0H7T1pqCbR5-nVTH5zamYjHIpDGVCkzQZ7XpptOTUkPju_D724i5KzJ-ALWHJlDa26yxMmgDTwISV4SCakKqi_FTQkAXTfzgTkiVDSJP4sIhGNRjtCpLLyo2OVP2WMYvuOAuRSJac6JoEegAtKd9JfeyRtB6HVL6nyXeYw8WkJ2mWgJb8mT5y3M8qC6eWx8mc-jppVtVHAO6MnJDkHIhXXEgTXIfADJRUw5cEqD5UPY78GtjAistHyj9hLWHbCegH9ROumDaogImCPbOioRzq3aJq11J98cAK69ohjVTwJIF7TZVGt1s0OSMXMIFpfBZ3PVxP_juC9w-a9dYnBHibNFWKrl0te8grNMRRDiqe__JINRbe-AW8n6BNPJoTrV2PJ5VSsmhyc5Rstycdr6HXw7Nrs3kbeMztcxoHnsdfj9ilOqi2C95S_SCeUWkM5Jh4fjhRSuaNgmSOU_Cz49MSYNrxgknL7ITNa-S64C23F25Gjy7wWzsV-5_JXV_Bewfm-lxfzl_Y2JfxLNpEAA54UHM7QJeDOAJw81FQQ4fA6Vo2Zjs_uJEWdM1xfa1oXb6X6pZLw9dEW0SA2r85f-8ez6Jty-Yhl3-jQdUiLpkoFv7oI3vC627fergjghD8gbMn_H9sWyqvsrbnPX-yJ-YVU5ibW99f5JU7a7h_odnas5xMYl8n34ZXpy-_K1ZioSgn3Q4fdP8RYXxY7gfW2CU76JbLBkpTcRvaNoagFd7QurfrOn1u9mA-u1V9lfT_Nn7_fPORWLR4Fv0A)  are some examples of how to use the library.

## API Reference

Detailed API documentation can be generated from the [JSDoc](https://kikoqiu.github.io/groups.js) comments within the source code. You can use tools like JSDoc to create comprehensive documentation.

## Contributing

Contributions are welcome! Please feel free to open issues or submit pull requests.

## License

This project is licensed under the [MIT License](LICENSE).