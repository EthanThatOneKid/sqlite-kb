# Best Practices: Hybrid Search with LibSQL, FTS5 & RRF

## 1\. Executive Summary

Hybrid search combines the semantic understanding of **Vector Search** with the
precise keyword matching of **Full-Text Search (FTS)**. The most robust way to
merge these results in LibSQL is using **Reciprocal Rank Fusion (RRF)**.

**Core Components:**

- **Database:** LibSQL (via Turso or local file).
- **Vector Engine:** Native `libsql_vector_idx` (uses DiskANN for efficiency).
- **Keyword Engine:** SQLite `FTS5` extension (built-in).
- **Fusion Algorithm:** RRF (merges results by rank, not raw score).

---

## 2\. Data Pipeline & Preparation

**Crucial Note:** LibSQL does not chunk text or generate embeddings
automatically. You must process data _before_ insertion.

### Step 1: Chunking (Manual)

Vectors lose meaning if they represent too much text. Split your documents into
smaller, coherent segments.

- **Recommended Size:** 256–512 tokens (approx. 150–400 words) per chunk.
- **Overlap:** Include 10–20% overlap between chunks to preserve context at
  boundaries.

### Step 2: Embedding

Generate vectors using an external model (e.g., OpenAI `text-embedding-3-small`,
HuggingFace `all-MiniLM-L6-v2`) for each chunk.

---

## 3\. Database Schema

For best performance and maintainability, use a **Dual-Table approach**: one
"base" table for vectors/metadata and a virtual table for FTS.

```sql
-- 1. Base Table (Stores Vectors + Content)
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT,
  metadata TEXT,  -- JSON string for filters (e.g., {"year": 2023})
  embedding F32_BLOB(1536) -- Match your model dimensions
);

-- 2. Vector Index (Native DiskANN)
-- speeds up vector_top_k queries
CREATE INDEX chunks_vec_idx ON chunks (libsql_vector_idx(embedding));

-- 3. FTS5 Virtual Table (Stores Keywords)
-- 'content' refers to the column; 'tokenize' can be tuned (e.g., 'trigram')
CREATE VIRTUAL TABLE chunks_fts USING fts5(content, tokenize = 'porter unicode61');

-- 4. Triggers (Optional but Recommended)
-- Automatically sync FTS table when the Base Table changes
CREATE TRIGGER chunks_ai
AFTER
INSERT
  ON chunks
BEGIN
INSERT INTO
  chunks_fts(rowid, content)
VALUES
  (new.id, new.content);

END;
```

---

## 4\. The RRF Hybrid Query

This is the standard, high-performance query pattern. It avoids complex
`FULL OUTER JOIN` emulations by using `UNION ALL` + `GROUP BY`.

**Algorithm:** $Score = \sum \frac{1}{k + rank}$ **Recommended $k$:** 60

### SQL Implementation

```sql
-- Parameters:
-- :q_vec  -> The query embedding (binary/blob)
-- :q_text -> The text keyword query (string)
-- :limit  -> Number of results to fetch from EACH method (e.g., 20)
-- :k      -> RRF constant (usually 60)
WITH
-- 1. Get Vector Candidates (Semantic)
vec_matches AS (
  SELECT
    id,
    row_number() OVER () AS rank
  FROM
    vector_top_k('chunks_vec_idx', vector(:q_vec), :limit)
),
-- 2. Get FTS Candidates (Keyword)
fts_matches AS (
  SELECT
    rowid AS id,
    row_number() OVER (
      ORDER BY
        rank
    ) AS rank
  FROM
    chunks_fts
  WHERE
    chunks_fts MATCH :q_text
  LIMIT
    :limit
),
-- 3. Fusion (RRF)
merged_scores AS (
  SELECT
    id,
    sum(1.0 / (:k + rank)) AS rrf_score
  FROM
    (
      SELECT
        id,
        rank
      FROM
        vec_matches
      UNION
      ALL
      SELECT
        id,
        rank
      FROM
        fts_matches
    )
  GROUP BY
    id
)
-- 4. Final Retrieval
SELECT
  c.content,
  c.metadata,
  m.rrf_score
FROM
  merged_scores m
  JOIN chunks c ON c.id = m.id
ORDER BY
  m.rrf_score DESC
LIMIT
  10;
```

---

## 5\. Performance & Tuning Tips

### Indexing (`libsql_vector_idx`)

- **DiskANN:** The native index uses DiskANN. It is optimized for fast
  approximate nearest neighbor search on disk.
- **Re-indexing:** Unlike B-Trees, approximate vector indexes sometimes need
  maintenance if data drifts significantly, but LibSQL handles basic updates
  automatically.
- **Vector Type:** Use `F32_BLOB` for standard precision. If storage is tight,
  LibSQL supports quantization, but start with F32.

### FTS5 Tuning

- **Ranking:** The query above uses `ORDER BY rank`. FTS5's standard `rank`
  function (Bm25) is usually sufficient.
- **Tokenizers:** If your domain has specific codes (e.g., `Part-123`), the
  default tokenizer might split them. Use the `trigram` tokenizer for better
  fuzzy matching on partial words.

### Chunk Size

- **Small Chunks:** Better for finding specific facts (higher FTS precision).
- **Large Chunks:** Better for "thematic" questions (higher Vector recall).
- **Hybrid Sweet Spot:** 256 tokens is widely considered the best balance for
  hybrid retrieval.

## 6\. Summary of Key Differences

| Feature             | LibSQL Native (`libsql_vector_idx`) | `sqlite-vec` (Extension)          |
| :------------------ | :---------------------------------- | :-------------------------------- |
| **Search Function** | `vector_top_k('idx', ...)`          | `vec0` virtual table select       |
| **Index Algorithm** | DiskANN (Disk-optimized)            | Varies (often brute force or IVF) |
| **Storage**         | Native Column (`F32_BLOB`)          | Virtual Table                     |
| **Recommendation**  | **Use this for Turso/LibSQL**       | Use this for generic SQLite       |

### 7. References

- [Turso Brings Native Vector Search to SQLite](https://turso.tech/blog/turso-brings-native-vector-search-to-sqlite)
- [Hybrid Search with SQLite-vec and FTS5](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html)
- [Hybrid full-text search and vector search with SQLite](https://simonwillison.net/2024/Oct/4/hybrid-full-text-search-and-vector-search-with-sqlite/)
- [FTS5 Documentation](https://www.sqlite.org/fts5.html)

## Similar Projects / Prior Art

- [Supabase Hybrid Search](https://supabase.com/docs/guides/ai/hybrid-search)
- [Supermemory.ai](https://supermemory.ai/docs/intro)
- [Orama.js Hybrid Search](https://docs.askorama.ai/docs/orama-js/search/hybrid-search)
- [ChromaDB Hybrid Search with RRF](https://docs.trychroma.com/cloud/search-api/hybrid-search#hybrid-search-with-rrf)
