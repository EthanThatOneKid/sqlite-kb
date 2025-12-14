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
