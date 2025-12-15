import { assertEquals } from "@std/assert";
import { createClient } from "@libsql/client";
import {
  createChunksTable,
  createStatementsTable,
  insertStatementWithChunks,
} from "./kb.ts";

Deno.test("Unified KB Helper Verification", async (t) => {
  const db = createClient({
    url: "file::memory:?cache=shared",
  });

  await t.step("Setup Tables", async () => {
    await createStatementsTable(db);
    await createChunksTable(db);
  });

  await t.step("insertStatementWithChunks", async () => {
    const stmt = {
      subject: "http://example.org/kb_test",
      predicate: "http://example.org/tests",
      object: "Unified Helper",
      context: "test_context",
    };

    const id = await insertStatementWithChunks(db, stmt);
    console.log(`Inserted statement ID: ${id}`);

    // Verify Statement Exists
    const stmtCheck = await db.execute({
      sql: "SELECT * FROM kb_statements WHERE id = ?",
      args: [id],
    });
    assertEquals(stmtCheck.rows.length, 1);
    assertEquals(stmtCheck.rows[0].object, "Unified Helper");

    // Verify Chunks Exist
    const chunksCheck = await db.execute({
      sql: "SELECT * FROM kb_chunks WHERE statement_id = ?",
      args: [id],
    });
    assertEquals(chunksCheck.rows.length > 0, true);
    console.log("Chunks found:", chunksCheck.rows);
  });

  db.close();
});
