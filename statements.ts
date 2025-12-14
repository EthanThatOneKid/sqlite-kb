import { createClient } from "@libsql/client";
import statementsSql from "./statements.sql" with { type: "text" };

export async function createStatementsTable(
  db: ReturnType<typeof createClient>,
) {
  await db.executeMultiple(statementsSql);
}

// TODO: Replace with @rdfjs/types types.
export interface RDFStatement {
  subject: string;
  predicate: string;
  object: string;
  context: string;
  language?: string;
  datatype?: string;
  termType?: "NamedNode" | "BlankNode" | "Literal" | "Quad";
}

export async function insertStatement(
  db: ReturnType<typeof createClient>,
  stmt: RDFStatement,
) {
  let {
    subject,
    predicate,
    object,
    context,
    language,
    datatype,
    termType,
  } = stmt;

  // Defaults
  language ??= "";
  datatype ??= "";
  termType ??= "NamedNode";

  // Special handling for Type assertion (optimization/mapping if needed,
  // though typically standard insertion works if predicate is full URI)
  if (predicate === "a") {
    predicate = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
  }

  const sql = `
    INSERT INTO kb_statements (subject, predicate, object, context, term_type, object_language, object_datatype)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT DO NOTHING
  `;

  await db.execute({
    sql,
    args: [subject, predicate, object, context, termType, language, datatype],
  });
}

export async function selectStatements(
  db: ReturnType<typeof createClient>,
  pattern: Partial<
    Pick<RDFStatement, "subject" | "predicate" | "object" | "context">
  >,
): Promise<RDFStatement[]> {
  const conditions: string[] = [];
  const args: (string | number | null)[] = [];

  if (pattern.subject) {
    conditions.push("subject = ?");
    args.push(pattern.subject);
  }
  if (pattern.predicate) {
    conditions.push("predicate = ?");
    args.push(pattern.predicate);
  }
  if (pattern.object) {
    conditions.push("object = ?");
    args.push(pattern.object);
  }
  if (pattern.context) {
    conditions.push("context = ?");
    args.push(pattern.context);
  }

  let sql = `SELECT * FROM kb_statements`;
  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  const result = await db.execute({ sql, args });

  return result.rows.map((row) => ({
    subject: row.subject as string,
    predicate: row.predicate as string,
    object: row.object as string,
    context: row.context as string,
    language: row.object_language as string,
    datatype: row.object_datatype as string,
    termType: row.term_type as RDFStatement["termType"],
  }));
}
