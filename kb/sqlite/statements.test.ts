import { createClient } from "@libsql/client";
import {
  createStatementsTable,
  insertStatement,
  selectStatements,
} from "./statements.ts";
import { assertEquals } from "@std/assert";

Deno.test("Statements Verification", async (t) => {
  const db = createClient({
    url: "file::memory:",
  });

  await t.step("Create Table", async () => {
    await createStatementsTable(db);
  });

  await t.step("Insert Statement", async () => {
    const id = await insertStatement(db, {
      subject: "http://example.org/s1",
      predicate: "http://example.org/p1",
      object: "http://example.org/o1",
      context: "http://example.org/c1",
    });
    assertEquals(typeof id, "number");
    console.log(`Inserted statement with ID: ${id}`);
  });

  await t.step("Select Statement", async () => {
    const results = await selectStatements(db, {
      subject: "http://example.org/s1",
    });
    console.log("Statements found:", results);
    assertEquals(results.length, 1);
    assertEquals(results[0].subject, "http://example.org/s1");
    assertEquals(results[0].predicate, "http://example.org/p1");
  });

  await t.step("Insert & Select with Literal", async () => {
    await insertStatement(db, {
      subject: "http://example.org/s2",
      predicate: "http://example.org/p2",
      object: "some literal value",
      context: "http://example.org/c1",
      termType: "Literal",
      language: "en",
    });

    const results = await selectStatements(db, {
      subject: "http://example.org/s2",
    });
    assertEquals(results.length, 1);
    assertEquals(results[0].object, "some literal value");
    assertEquals(results[0].language, "en");
    assertEquals(results[0].termType, "Literal");
  });

  db.close();
});
