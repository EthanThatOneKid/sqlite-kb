import { assertEquals } from "@std/assert";
import { createClient } from "@libsql/client";
import { generateEmbedding } from "#/kb/embeddings.ts";
import {
  createChunksTable,
  insertChunksForStatement,
  performHybridSearch,
} from "./chunks.ts";
import { createStatementsTable, insertStatement } from "./statements.ts";

Deno.test("Hybrid Search & Chunking Verification", async (t) => {
  // Use in-memory DB for testing
  const db = createClient({
    url: "file::memory:",
  });

  await t.step("Create Tables", async () => {
    await createStatementsTable(db);
    await createChunksTable(db);
  });

  let statementId: number;
  const stmt1 = {
    subject: "http://example.org/ai",
    predicate: "http://example.org/about",
    object: "Artificial Intelligence",
    context: "http://example.org/graph",
  };

  await t.step("Insert Statement & Chunks", async () => {
    // Insert statement 1: AI
    statementId = await insertStatement(db, stmt1);
    console.log(`Inserted statement with ID: ${statementId}`);

    // Automatically insert chunks
    await insertChunksForStatement(db, statementId, stmt1);
    console.log("Inserted chunks automatically");
  });

  await t.step("Insert Another Chunk (Statement 2)", async () => {
    const stmt2 = {
      subject: "http://example.org/fruit",
      predicate: "http://example.org/type",
      object: "Banana",
      context: "http://example.org/graph",
    };
    const otherId = await insertStatement(db, stmt2);

    // Manual insertion via helper
    await insertChunksForStatement(db, otherId, stmt2);
    console.log(`Inserted chunks for statement ${otherId}`);
  });

  await t.step("Perform Hybrid Search", async () => {
    const queryText = "intelligence";
    // Mock embedding for query (since we used zero-vectors for chunks, vector search won't be perfect,
    // but FTS should still work if configured, or at least we test the function runs).
    // Note: The previous test used real embeddings. To match that, we might need real embeddings again
    // IF we care about the search accuracy.
    // BUT `insertChunksForStatement` currently uses zero-vectors.
    // For this verification, we are mostly checking if chunks EXIST and are valid.

    const queryVector = await generateEmbedding(queryText);

    // To test search properly with zero vectors, we might relying on FTS mostly.
    const results = await performHybridSearch(db, queryText, queryVector, 5);
    console.log("Search Results:", results);

    // We expect at least the AI statement to be returned due to FTS match on "Intelligence"
    // (Assuming FTS is working on the content column we inserted).
    const match = results.find((r) => r.object === "Artificial Intelligence");
    assertEquals(!!match, true);
  });

  await t.step("Verify Cascade Delete", async () => {
    console.log("Deleting statement 1...");
    await db.execute({
      sql: "DELETE FROM kb_statements WHERE id = ?",
      args: [statementId],
    });

    const chunks = await db.execute({
      sql: "SELECT * FROM kb_chunks WHERE statement_id = ?",
      args: [statementId],
    });

    assertEquals(
      chunks.rows.length,
      0,
      "Chunks should be deleted when statement is deleted",
    );
    console.log("Cascade delete confirmed.");
  });

  db.close();
});
