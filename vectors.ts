import { createClient } from "@libsql/client";
import vectorsSql from "./vectors.sql" with { type: "text" };

export interface Chunk {
  chunk_id: number;
  doc_id: number;
  content: string;
  embedding: number[]; // or Float32Array
}

export interface SearchResult extends Chunk {
  score: number;
}

export async function createVectorsTable(db: ReturnType<typeof createClient>) {
  await db.executeMultiple(vectorsSql);
}

export async function insertDocument(
  db: ReturnType<typeof createClient>,
  content: string,
): Promise<number> {
  const result = await db.execute({
    sql: "INSERT INTO documents (content) VALUES (?) RETURNING id",
    args: [content],
  });
  return Number(result.rows[0].id);
}

// NOTE: This assumes the chunks are already generated and processed by a worker.
// This function strictly inserts the chunk data.
export async function insertChunk(
  db: ReturnType<typeof createClient>,
  docId: number,
  content: string,
  embedding: number[],
) {
  // LibSQL node client might expect JSON string or Float32Array for vectors depending on version.
  // Usually `vector(...)` syntax is for literals in SQL, but parameterized insert often takes an array.
  // We'll pass the array directly; libSQL client handles serialization for configured vector columns.
  await db.execute({
    sql:
      "INSERT INTO chunks (doc_id, content, embedding) VALUES (?, ?, vector(?))",
    args: [docId, content, JSON.stringify(embedding)],
  });
}

export async function searchVectors(
  db: ReturnType<typeof createClient>,
  embedding: number[],
  limit: number = 10,
): Promise<SearchResult[]> {
  // Native LibSQL vector search using vector_top_k or ORDER BY vector_distance
  // Syntax: SELECT ... FROM ... ORDER BY vector_distance_cos(embedding, vector(?)) LIMIT ?
  const sql = `
    SELECT 
      chunk_id, doc_id, content,
      vector_distance_cos(embedding, vector(?)) as distance
    FROM chunks
    ORDER BY distance ASC
    LIMIT ?
  `;

  const result = await db.execute({
    sql,
    args: [JSON.stringify(embedding), limit],
  });

  return result.rows.map((row) => ({
    chunk_id: Number(row.chunk_id),
    doc_id: Number(row.doc_id),
    content: String(row.content),
    // We don't necessarily need to return the full embedding back
    embedding: [],
    // Convert distance to a similarity score (approximate inverse)
    // Cosine distance is 0..2 (1 - cosine_similarity).
    // Similarity = 1 - distance.
    score: 1.0 - Number(row.distance),
  }));
}

export async function searchFTS(
  db: ReturnType<typeof createClient>,
  query: string,
  limit: number = 10,
): Promise<SearchResult[]> {
  // Use FTS5 MATCH query.
  // We select from chunks_fts but also need doc_id from main chunks table if we want it,
  // or we can select from chunks JOIN chunks_fts.
  // Actually simpler: select rowid from chunks_fts match ? order by rank.
  // But we need doc_id.

  const sql = `
    SELECT 
      fts.rowid as chunk_id, 
      c.doc_id, 
      fts.content,
      fts.rank
    FROM chunks_fts fts
    JOIN chunks c ON fts.rowid = c.chunk_id
    WHERE fts.content MATCH ?
    ORDER BY fts.rank
    LIMIT ?
  `;

  const result = await db.execute({
    sql,
    args: [query, limit],
  });

  return result.rows.map((row) => ({
    chunk_id: Number(row.chunk_id),
    doc_id: Number(row.doc_id),
    content: String(row.content),
    embedding: [],
    // FTS rank is "smaller is better" (more relevant).
    // RRF expects just a ranking, so the raw rank value is useful for sorting,
    // but for our internal 'score' attribute (which is usually similarity 0..1),
    // we don't have a direct equivalent.
    // We'll store the 'rank' in a way we can sort by it later, or just return it.
    // Let's just mock score as 1.0 for now, RRF relies on list position.
    score: 1.0,
  }));
}

// Reciprocal Rank Fusion
export function reciprocalRankFusion(
  listA: SearchResult[],
  listB: SearchResult[],
  k: number = 60,
): SearchResult[] {
  const scores = new Map<number, number>();
  const verifyMap = new Map<number, SearchResult>();

  // Helper to accumulate RRF scores
  const fuse = (list: SearchResult[]) => {
    list.forEach((item, index) => {
      const rank = index + 1;
      const rrfScore = 1 / (k + rank);
      const currentScore = scores.get(item.chunk_id) || 0;
      scores.set(item.chunk_id, currentScore + rrfScore);
      if (!verifyMap.has(item.chunk_id)) {
        verifyMap.set(item.chunk_id, item);
      }
    });
  };

  fuse(listA);
  fuse(listB);

  // Sort by final score desc
  const sortedIds = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1]) // Sort by score descending
    .map(([id]) => id);

  return sortedIds.map((id) => verifyMap.get(id)!);
}

export async function performHybridSearch(
  db: ReturnType<typeof createClient>,
  queryText: string,
  queryVector: number[],
  limit: number = 10,
): Promise<SearchResult[]> {
  const [ftsResults, vecResults] = await Promise.all([
    searchFTS(db, queryText, limit * 2), // Fetch more to fuse
    searchVectors(db, queryVector, limit * 2),
  ]);

  const fused = reciprocalRankFusion(ftsResults, vecResults);
  return fused.slice(0, limit);
}
