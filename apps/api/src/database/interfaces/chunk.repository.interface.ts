/**
 * Injection token for the IChunkRepository interface.
 * Exported as a Symbol to avoid string-literal collision (D-02).
 */
export const CHUNK_REPOSITORY = Symbol('IChunkRepository');

/**
 * Raw row returned by the vec0 KNN + JOIN query.
 * Colocated with the interface so consuming services can reference the type
 * without importing from repository implementation files (D-02).
 */
export interface KnnRow {
  id: number;
  document_id: string;
  content: string;
  metadata: string | null;
  filename: string;
  distance: number;
}

/**
 * IChunkRepository — data access interface for the chunks / vec_chunks tables.
 *
 * All SQL is owned by the implementing class; services depend only on this
 * interface via the CHUNK_REPOSITORY injection token so Phase 7 can mock
 * data access by providing an alternative implementation (D-02).
 */
export interface IChunkRepository {
  /**
   * Atomically insert a text chunk and its embedding vector.
   *
   * Wraps both inserts in a `db.transaction` to preserve the rowid-alignment
   * contract required by sqlite-vec KNN (D-05): chunks.id must equal the
   * vec_chunks virtual-table rowid for every chunk.
   *
   * @param documentId - UUID of the owning document.
   * @param content    - Chunk text.
   * @param metadata   - JSON-serialised metadata object.
   * @param embedding  - Float32Array embedding (passed directly to sqlite-vec).
   */
  dualWriteChunk(
    documentId: string,
    content: string,
    metadata: string,
    embedding: Float32Array,
  ): void;

  /**
   * KNN vector similarity search over vec_chunks.
   *
   * Returns the top-k most similar chunks joined to chunks + documents.
   * Float32Array is passed directly to better-sqlite3 — sqlite-vec handles
   * serialisation internally (Pitfall 5).
   *
   * Security (T-03-03): k is bound as a parameterized placeholder.
   *
   * @param queryVec - Float32Array embedding of the query.
   * @param k        - Number of nearest neighbours to return.
   */
  knnSearch(queryVec: Float32Array, k: number): KnnRow[];
}
