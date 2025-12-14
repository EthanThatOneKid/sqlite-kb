import { assertEquals } from "@std/assert";
import { createClient } from "@libsql/client";
import {
  createChunksTable,
  insertChunk,
  performHybridSearch,
} from "./chunks.ts";
import {
  createStatementsTable,
  insertStatement,
} from "#/tables/statements/statements.ts";
import { generateEmbedding } from "#/lib/embeddings.ts";

Deno.test("Hybrid Search Verification with USE", async (t) => {
  // Use in-memory DB for testing
  const db = createClient({
    url: "file::memory:",
  });

  await t.step("Create Tables", async () => {
    await createStatementsTable(db);
    await createChunksTable(db);
  });

  let statementId: number;
  await t.step("Insert Statement", async () => {
    // Insert statement 1: AI
    await insertStatement(db, {
      subject: "http://example.org/ai",
      predicate: "http://example.org/about",
      object: "Artificial Intelligence",
      context: "http://example.org/graph",
    });

    // Attempt to get ID (assuming 1)
    const res = await db.execute(
      "SELECT id FROM kb_statements WHERE object = 'Artificial Intelligence'",
    );
    statementId = Number(res.rows[0].id);
    console.log(`Inserted statement with ID: ${statementId}`);
  });

  await t.step("Insert Chunk with Real Embedding", async () => {
    const text = "artificial intelligence chunk";
    const vector = await generateEmbedding(text);
    assertEquals(vector.length, 512); // Verify USE dimensions

    await insertChunk(db, statementId, text, vector);
    console.log("Inserted chunk");
  });

  await t.step("Insert Another Chunk (Statement 2)", async () => {
    await insertStatement(db, {
      subject: "http://example.org/fruit",
      predicate: "http://example.org/type",
      object: "Banana",
      context: "http://example.org/graph",
    });
    const res = await db.execute(
      "SELECT id FROM kb_statements WHERE object = 'Banana'",
    );
    const otherId = Number(res.rows[0].id);

    const text = "bananas and fruit";
    const vector = await generateEmbedding(text);
    await insertChunk(db, otherId, text, vector);
    console.log(`Inserted chunk for statement ${otherId}`);
  });

  await t.step("Perform Hybrid Search", async () => {
    const queryText = "intelligence";
    const queryVector = await generateEmbedding(queryText);

    const results = await performHybridSearch(db, queryText, queryVector, 5);
    console.log("Search Results:", results);

    assertEquals(results.length > 0, true);
    // Should match AI statement
    assertEquals(results[0].object, "Artificial Intelligence");
    assertEquals(results[0].subject, "http://example.org/ai");
  });

  db.close();
});
