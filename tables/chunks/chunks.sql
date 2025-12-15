-- 1. Chunks Table (Linked to kb_statements)
-- We use FLOAT32(512) for TensorFlow USE embeddings.
CREATE TABLE IF NOT EXISTS kb_chunks (
  chunk_id INTEGER PRIMARY KEY AUTOINCREMENT,
  statement_id INTEGER,
  content TEXT,
  embedding FLOAT32(512),
  FOREIGN KEY(statement_id) REFERENCES kb_statements(id) ON DELETE CASCADE
);

-- 2. Create a vector index on the embedding column
CREATE INDEX IF NOT EXISTS kb_chunks_vector_idx ON kb_chunks (libsql_vector_idx(embedding));

-- 3. FTS5 Virtual Table for Full-Text Search
-- using 'external content' to save space (content is stored in 'kb_chunks')
CREATE VIRTUAL TABLE IF NOT EXISTS kb_chunks_fts USING fts5(
  content,
  content = 'kb_chunks',
  content_rowid = 'chunk_id'
);

-- 4. Triggers to keep FTS index in sync with main chunks table
-- Trigger on INSERT
CREATE TRIGGER IF NOT EXISTS kb_chunks_ai
AFTER
INSERT
  ON kb_chunks
BEGIN
INSERT INTO
  kb_chunks_fts(rowid, content)
VALUES
  (new.chunk_id, new.content);

END;

-- Trigger on DELETE
CREATE TRIGGER IF NOT EXISTS kb_chunks_ad
AFTER
  DELETE ON kb_chunks
BEGIN
INSERT INTO
  kb_chunks_fts(kb_chunks_fts, rowid, content)
VALUES
  ('delete', old.chunk_id, old.content);

END;

-- Trigger on UPDATE
CREATE TRIGGER IF NOT EXISTS kb_chunks_au
AFTER
UPDATE
  ON kb_chunks
BEGIN
INSERT INTO
  kb_chunks_fts(kb_chunks_fts, rowid, content)
VALUES
  ('delete', old.chunk_id, old.content);

INSERT INTO
  kb_chunks_fts(rowid, content)
VALUES
  (new.chunk_id, new.content);

END;
