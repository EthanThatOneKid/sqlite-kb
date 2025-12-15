import { createClient } from "@libsql/client";
import { insertStatement, RDFStatement } from "./statements.ts";
import { insertChunksForStatement } from "./chunks.ts";

export * from "./statements.ts";
export * from "./chunks.ts";

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
  const tx = await db.transaction("write");
  try {
    // 1. Insert Statement (or get existing ID)
    const id = await insertStatement(tx, stmt);

    // 2. Insert Chunks linked to that ID
    await insertChunksForStatement(tx, id, stmt);

    await tx.commit();
    return id;
  } catch (e) {
    tx.close();
    throw e;
  }
}
