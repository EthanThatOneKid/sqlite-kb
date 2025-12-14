# sqlite-kb

A local-first Knowledge Base built on **SQLite** (LibSQL), **RDF**, and **Hybrid
Search**.

This project implements a semantic search engine that combines the precision of
keyword matching (FTS5) with the understanding of vector embeddings (TensorFlow
Universal Sentence Encoder), fused together using Reciprocal Rank Fusion (RRF).

## Features

- **RDF Graph Storage**: Knowledge is stored as atomic Subject-Predicate-Object
  statements in the `kb_statements` table.
- **Local AI Embeddings**: Uses **TensorFlow.js** and the **Universal Sentence
  Encoder (USE)** to generate 512-dimensional embeddings locally (CPU backend).
  No external API keys required.
- **Hybrid Search**:
  - **Vector Search**: LibSQL native `libsql_vector_idx` (DiskANN) for semantic
    similarity.
  - **Full-Text Search**: SQLite `FTS5` extension for exact keyword matching.
  - **RRF Fusion**: Combines rankings from both engines to surface the best
    results.

## RRF Query Strategy

Instead of complex application-side logic, we use a single efficient SQL query
to perform RRF:

1. **CTE 1 (Vectors)**: Fetch top K results using `vector_top_k`.
2. **CTE 2 (FTS)**: Fetch top K results using `MATCH` and `rank`.
3. **CTE 3 (Fusion)**: Combine them via `UNION ALL` and sum their reciprocal
   ranks: `sum(1.0 / (k + rank))`.
4. **Final Select**: Join with `kb_statements` to return specific knowledge
   graph nodes.

## TensorFlow.js embeddings benchmark results

```
| benchmark                       | time/iter (avg) |        iter/s |      (min … max)      |      p75 |      p99 |     p995 |
| ------------------------------- | --------------- | ------------- | --------------------- | -------- | -------- | -------- |
| TensorFlow USE - CPU Backend    |        250.5 ms |           4.0 | (225.1 ms … 292.4 ms) | 261.3 ms | 292.4 ms | 292.4 ms |
| TensorFlow USE - WASM Backend   |         20.0 ms |          50.1 | ( 16.3 ms …  32.8 ms) |  21.6 ms |  32.8 ms |  32.8 ms |
```

---

Built with 🧪 [**@FartLabs**](https://github.com/FartLabs)
