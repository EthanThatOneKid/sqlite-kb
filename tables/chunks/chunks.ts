import { createClient } from "@libsql/client";
import chunksSql from "./chunks.sql" with {
  type: "text",
};
import { RDFStatement } from "../statements/statements.ts";

export interface Chunk {
  chunk_id: number;
  statement_id: number;
  content: string;
  embedding: number[]; // or Float32Array
}

export interface SearchResult extends RDFStatement {
  score: number;
}

export async function createChunksTable(db: ReturnType<typeof createClient>) {
  await db.executeMultiple(chunksSql);
}

// NOTE: This assumes the chunks are already generated and processed by a worker.
// This function strictly inserts the chunk data.
export async function insertChunk(
  db: ReturnType<typeof createClient>,
  statementId: number,
  content: string,
  embedding: number[],
) {
  // LibSQL node client might expect JSON string or Float32Array for vectors depending on version.
  // Usually `vector(...)` syntax is for literals in SQL, but parameterized insert often takes an array.
  // We'll pass the array directly; libSQL client handles serialization for configured vector columns.
  await db.execute({
    sql:
      "INSERT INTO kb_chunks (statement_id, content, embedding) VALUES (?, ?, vector(?))",
    args: [statementId, content, JSON.stringify(embedding)],
  });
}

export async function performHybridSearch(
  db: ReturnType<typeof createClient>,
  queryText: string,
  queryVector: number[],
  limit: number = 10,
  k: number = 60,
): Promise<SearchResult[]> {
  const sql = `
    WITH 
    -- 1. Get Vector Candidates (Semantic)
    vec_matches AS (
      SELECT 
        statement_id as id, 
        row_number() OVER () as rank 
      FROM vector_top_k('kb_chunks_vector_idx', vector(?), ?)
      JOIN kb_chunks ON kb_chunks.rowid = vector_top_k.rowid
    ),

    -- 2. Get FTS Candidates (Keyword)
    fts_matches AS (
      SELECT 
        c.statement_id as id, 
        row_number() OVER (ORDER BY fts.rank) as rank 
      FROM kb_chunks_fts fts
      JOIN kb_chunks c ON fts.rowid = c.chunk_id
      WHERE fts.content MATCH ? 
      LIMIT ?
    ),

    -- 3. Fusion (RRF)
    merged_scores AS (
      SELECT 
        id,
        sum(1.0 / (? + rank)) as rrf_score
      FROM (
        SELECT id, rank FROM vec_matches
        UNION ALL
        SELECT id, rank FROM fts_matches
      )
      GROUP BY id
    )

    -- 4. Final Retrieval
    SELECT 
      s.*,
      m.rrf_score as score
    FROM merged_scores m
    JOIN kb_statements s ON s.id = m.id
    ORDER BY m.rrf_score DESC
    LIMIT ?;
  `;

  // Note on vector_top_k: The usage might depend on exact libsql version.
  // If vector_top_k requires index name string literal, we can't bind it easily?
  // Docs say: vector_top_k('chunks_vector_idx', vector(?), ?)

  // Also, we need to map the result rows back to RDFStatement format.

  const result = await db.execute({
    sql,
    args: [
      JSON.stringify(queryVector),
      limit, // for vector_top_k
      queryText,
      limit, // for FTS
      k, // for RRF k
      limit, // final limit
    ],
  });

  return result.rows.map((row) => ({
    subject: row.subject as string,
    predicate: row.predicate as string,
    object: row.object as string,
    context: row.context as string,
    language: row.object_language as string,
    datatype: row.object_datatype as string,
    termType: row.term_type as RDFStatement["termType"],
    score: Number(row.score),
  }));
}
