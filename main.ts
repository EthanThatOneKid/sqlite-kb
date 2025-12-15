import { createClient } from "@libsql/client";
import {
  createChunksTable,
  createStatementsTable,
  insertStatementWithChunks,
  performHybridSearch,
  selectStatements,
} from "#/kb/sqlite/kb.ts";
import { generateEmbedding } from "#/kb/embeddings.ts";

async function main() {
  // Use in-memory database for testing
  const db = createClient({ url: "file::memory:?cache=shared" });

  console.log("Initializing database...");
  await createStatementsTable(db);
  await createChunksTable(db);

  console.log("Inserting sample statements...");

  // 1. Asserted Triple (URI)
  console.log("Inserting statement 1...");
  const id1 = await insertStatementWithChunks(db, {
    subject: "http://example.org/alice",
    predicate: "http://example.org/knows",
    object: "http://example.org/bob",
    context: "default",
  });

  // 2. Literal with Language
  console.log("Inserting statement 2...");
  await insertStatementWithChunks(db, {
    subject: "http://example.org/alice",
    predicate: "http://example.org/name",
    object: "Alice",
    context: "default",
    language: "en",
    termType: "Literal",
  });

  // 3. Type Assertion (using 'a')
  console.log("Inserting statement 3...");
  await insertStatementWithChunks(db, {
    subject: "http://example.org/alice",
    predicate: "a",
    object: "http://example.org/Person",
    context: "default",
  });

  console.log("\nQuerying all statements:");
  const allStatements = await selectStatements(db, {});

  for (const row of allStatements) {
    console.log("---");
    console.log(`S: ${row.subject}`);
    console.log(`P: ${row.predicate}`);
    console.log(`O: ${row.object}`);
    if (row.language) console.log(`Lang: ${row.language}`);
    if (row.datatype) console.log(`Dt: ${row.datatype}`);
    console.log(`Type: ${row.termType}`);
  }

  console.log("\nQuerying all chunks:");
  const chunksResult = await db.execute("SELECT * FROM kb_chunks");
  for (const row of chunksResult.rows) {
    console.log(
      `Chunk ID: ${row.chunk_id}, Stmt ID: ${row.statement_id}, Content: "${row.content}"`,
    );
  }

  console.log("\nQuerying specific subject (Alice):");
  const aliceStatements = await selectStatements(db, {
    subject: "http://example.org/alice",
  });
  console.log(`Found ${aliceStatements.length} statements for Alice.`);

  // Verify 'a' mapped to rdf:type
  const typeRow = allStatements.find((r) =>
    r.object === "http://example.org/Person"
  );
  if (
    typeRow &&
    typeRow.predicate === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
  ) {
    console.log(
      "\nSUCCESS: 'a' predicate was correctly mapped to rdf:type full URI.",
    );
  } else {
    console.error("\nFAILURE: 'a' predicate mapping failed.");
  }

  // 4. Verify Cascade Delete
  console.log("\nVerifying Cascade Delete...");
  console.log(`Deleting statement 1 (ID: ${id1})...`);

  await db.execute({
    sql: "DELETE FROM kb_statements WHERE id = ?",
    args: [id1],
  });

  const remainingChunks = await db.execute({
    sql: "SELECT * FROM kb_chunks WHERE statement_id = ?",
    args: [id1],
  });

  if (remainingChunks.rows.length === 0) {
    console.log("SUCCESS: Chunks for statement 1 were automatically deleted.");
  } else {
    console.error(
      `FAILURE: Found ${remainingChunks.rows.length} orphaned chunks.`,
    );
  }

  // 5. Hybrid Search Demo
  console.log("\n--- Hybrid Search Demo ---");

  // Insert some AI/Knowledge Graph related statements
  console.log("Inserting AI-related statements...");
  await insertStatementWithChunks(db, {
    subject: "http://example.org/kb",
    predicate: "http://example.org/topic",
    object: "Knowledge Graphs",
    context: "tech",
  });
  await insertStatementWithChunks(db, {
    subject: "http://example.org/ai",
    predicate: "http://example.org/description",
    object: "Artificial Intelligence transforms data into knowledge.",
    context: "tech",
  });

  const query = "knowledge transformation";
  console.log(`\nSearching for: "${query}"`);

  const queryVector = await generateEmbedding(query);
  const results = await performHybridSearch(db, query, queryVector, 5);

  console.log("Search Results:");
  results.forEach((r, i) => {
    console.log(
      `[${i + 1}] Score: ${r.score.toFixed(4)} | Content: ${r.object}`,
    );
  });

  // 6. Debugging Accuracy
  console.log("\n--- Debugging: why is Alice #1? ---");
  const vecAlice = await generateEmbedding("Alice");
  const vecQuery = await generateEmbedding("knowledge transformation");

  // Simple Cosine Sim
  const dot = (a: number[], b: number[]) =>
    a.reduce((sum, v, k) => sum + v * b[k], 0);
  console.log(
    "Dot Product (Alice vs Query):",
    dot(vecAlice, vecQuery).toFixed(4),
  );

  const vecAI = await generateEmbedding(
    "Artificial Intelligence transforms data into knowledge.",
  );
  console.log("Dot Product (AI vs Query):   ", dot(vecAI, vecQuery).toFixed(4));

  console.log("\n--- Trying Keyword Match 'transforms' ---");
  const query2 = "transforms";
  const vecQuery2 = await generateEmbedding(query2);
  const results2 = await performHybridSearch(db, query2, vecQuery2, 5);
  results2.forEach((r, i) => {
    console.log(
      `[${i + 1}] Score: ${r.score.toFixed(4)} | Content: ${r.object}`,
    );
  });
}

main().catch(console.error);
