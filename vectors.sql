-- 1. Main document storage
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. A queue to notify the worker "Hey, chunk this!"
CREATE TABLE IF NOT EXISTS document_queue (
  doc_id INTEGER PRIMARY KEY,
  STATUS TEXT DEFAULT 'pending',  -- pending, processing, done
  FOREIGN KEY(doc_id) REFERENCES documents(id)
);

-- 3. The Trigger: This makes it "Automatic"
CREATE TRIGGER IF NOT EXISTS queue_new_document
AFTER
INSERT
  ON documents
BEGIN
INSERT INTO
  document_queue (doc_id)
VALUES
  (NEW.id);

END;

-- 4. The Chunks Table (using LibSQL native vector search)
-- We use FLOAT32(1536) for embeddings.
CREATE TABLE IF NOT EXISTS chunks (
  chunk_id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER,
  content TEXT,
  embedding FLOAT32(1536),
  FOREIGN KEY(doc_id) REFERENCES documents(id)
);

-- 5. Create a vector index on the embedding column
CREATE INDEX IF NOT EXISTS chunks_vector_idx ON chunks (libsql_vector_idx(embedding));

-- 6. FTS5 Virtual Table for Full-Text Search
-- using 'external content' to save space (content is stored in 'chunks')
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  content,
  content = 'chunks',
  content_rowid = 'chunk_id'
);

-- 7. Triggers to keep FTS index in sync with main chunks table
-- Trigger on INSERT
CREATE TRIGGER IF NOT EXISTS chunks_ai
AFTER
INSERT
  ON chunks
BEGIN
INSERT INTO
  chunks_fts(rowid, content)
VALUES
  (new.chunk_id, new.content);

END;

-- Trigger on DELETE
CREATE TRIGGER IF NOT EXISTS chunks_ad
AFTER
  DELETE ON chunks
BEGIN
INSERT INTO
  chunks_fts(chunks_fts, rowid, content)
VALUES
  ('delete', old.chunk_id, old.content);

END;

-- Trigger on UPDATE
CREATE TRIGGER IF NOT EXISTS chunks_au
AFTER
UPDATE
  ON chunks
BEGIN
INSERT INTO
  chunks_fts(chunks_fts, rowid, content)
VALUES
  ('delete', old.chunk_id, old.content);

INSERT INTO
  chunks_fts(rowid, content)
VALUES
  (new.chunk_id, new.content);

END;
