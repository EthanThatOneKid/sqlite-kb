CREATE TABLE IF NOT EXISTS kb_statements (
  id INTEGER PRIMARY KEY,
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object TEXT NOT NULL,
  context TEXT NOT NULL,
  -- The type of the object (NamedNode, BlankNode, Literal, etc.)
  term_type TEXT NOT NULL DEFAULT 'NamedNode',
  -- Metadata for Literals.
  object_language TEXT NOT NULL DEFAULT '',
  object_datatype TEXT NOT NULL DEFAULT '',
  -- One constraint to rule them all:
  CONSTRAINT kb_statement_unique UNIQUE (
    subject,
    predicate,
    object,
    context,
    term_type,
    object_language,
    object_datatype
  )
);

CREATE INDEX IF NOT EXISTS kb_s_index ON kb_statements (subject);

CREATE INDEX IF NOT EXISTS kb_p_index ON kb_statements (predicate);

CREATE INDEX IF NOT EXISTS kb_o_index ON kb_statements (object);

CREATE INDEX IF NOT EXISTS kb_c_index ON kb_statements (context);

CREATE INDEX IF NOT EXISTS kb_sp_index ON kb_statements (subject, predicate);

CREATE INDEX IF NOT EXISTS kb_po_index ON kb_statements (predicate, object);
