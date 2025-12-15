import { createClient } from "@libsql/client";
import {
  insertStatement,
  RDFStatement,
} from "#/tables/statements/statements.ts";
import { insertChunksForStatement } from "#/tables/chunks/chunks.ts";

/**
 * Inserts a statement and automatically generates/inserts its chunks.
 * @param db The database client.
 * @param stmt The RDF statement to insert.
 * @returns The ID of the inserted (or existing) statement.
 */
export async function insertStatementWithChunks(
  db: ReturnType<typeof createClient>,
  stmt: RDFStatement,
): Promise<number> {
  // 1. Insert Statement (or get existing ID)
  const id = await insertStatement(db, stmt);

  // 2. Insert Chunks linked to that ID
  await insertChunksForStatement(db, id, stmt);

  return id;
}
