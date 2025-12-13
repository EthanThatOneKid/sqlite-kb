import { createClient } from "@libsql/client";
import {
  createStatementsTable,
  insertStatement,
  selectStatements,
} from "./statements.ts";

async function main() {
  // Use in-memory database for testing
  const db = createClient({ url: ":memory:" });

  console.log("Initializing database...");
  await createStatementsTable(db);

  console.log("Inserting sample statements...");

  // 1. Asserted Triple (URI)
  await insertStatement(db, {
    subject: "http://example.org/alice",
    predicate: "http://example.org/knows",
    object: "http://example.org/bob",
    context: "default",
  });

  // 2. Literal with Language
  await insertStatement(db, {
    subject: "http://example.org/alice",
    predicate: "http://example.org/name",
    object: "Alice",
    context: "default",
    language: "en",
    termType: "Literal",
  });

  // 3. Type Assertion (using 'a')
  await insertStatement(db, {
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
}

main().catch(console.error);
