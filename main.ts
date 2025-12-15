import { createClient } from "@libsql/client";
import {
  createStatementsTable,
  selectStatements,
} from "./tables/statements/statements.ts";
import { createChunksTable } from "./tables/chunks/chunks.ts";
import { insertStatementWithChunks } from "./lib/kb.ts";

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
}

main().catch(console.error);
