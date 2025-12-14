import { createClient } from "@libsql/client";
import {
  createVectorsTable,
  insertChunk,
  insertDocument,
  performHybridSearch,
} from "./vectors.ts";
import { assertEquals } from "jsr:@std/assert";

Deno.test("Hybrid Search Verification", async (t) => {
  // Use in-memory DB for testing
  const db = createClient({
    url: "file::memory:",
  });

  await t.step("Create Tables", async () => {
    await createVectorsTable(db);
  });

  let docId: number;
  await t.step("Insert Document", async () => {
    docId = await insertDocument(
      db,
      "This is a test document about artificial intelligence.",
    );
    console.log(`Inserted document with ID: ${docId}`);
    assertEquals(typeof docId, "number");
  });

  await t.step("Insert Chunk with Vector", async () => {
    const vector = new Array(1536).fill(0.1); // Dummy vector
    // Make it slightly distinct at an index to test search?
    // For now uniform is fine for a syntax check.

    await insertChunk(db, docId, "artificial intelligence chunk", vector);
    console.log("Inserted chunk");
  });

  await t.step("Insert Another Chunk", async () => {
    const vector = new Array(1536).fill(0.9); // Distinct vector
    await insertChunk(db, docId, "bananas and fruit", vector);
    console.log("Inserted chunk 2");
  });

  await t.step("Perform Hybrid Search", async () => {
    const queryVector = new Array(1536).fill(0.1);
    const queryText = "intelligence";

    const results = await performHybridSearch(db, queryText, queryVector, 5);
    console.log("Search Results:", results);

    // We expect the first chunk to rank higher because:
    // 1. Text match "intelligence" matches "artificial intelligence chunk"
    // 2. Vector match (0.1 vs 0.1) is closer than (0.1 vs 0.9)

    assertEquals(results.length > 0, true);
    assertEquals(results[0].content, "artificial intelligence chunk");
  });

  db.close();
});
