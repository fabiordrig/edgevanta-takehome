import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import {
  IChunkRepository,
  KnnRow,
} from '../interfaces/chunk.repository.interface';

/**
 * ChunkRepository — owns all SQL for the chunks and vec_chunks tables.
 *
 * Implements IChunkRepository so services depend on the interface token
 * (CHUNK_REPOSITORY) rather than this concrete class (D-02).
 *
 * Rowid-alignment contract (D-05): the chunks INSERT and vec_chunks INSERT
 * MUST happen in the same `db.transaction` so SQLite auto-assigns consecutive
 * rowids — this is what allows the KNN rowid JOIN to work correctly.
 * `dualWriteChunk` owns that transaction so callers cannot break the contract.
 *
 * Float32Array binding (Pitfall 5): pass the typed array directly to
 * better-sqlite3 — sqlite-vec handles serialisation internally. Never call
 * .buffer or Buffer.from() on the array.
 *
 * Security (T-05-03): all user/LLM-supplied values (queryVec, k) are bound
 * as parameterized `?` placeholders — no string interpolation into SQL.
 */
@Injectable()
export class ChunkRepository implements IChunkRepository {
  private readonly logger = new Logger(ChunkRepository.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Atomically insert a text chunk and its embedding vector.
   *
   * Both inserts are wrapped in a `db.transaction` to preserve the
   * rowid-alignment contract: chunks.id must equal the vec_chunks virtual-table
   * rowid for every chunk so the KNN JOIN works (D-05).
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
  ): void {
    const db = this.databaseService.database;

    const insertChunk = db.prepare(
      'INSERT INTO chunks (document_id, content, metadata) VALUES (?, ?, ?)',
    );
    const insertVec = db.prepare(
      'INSERT INTO vec_chunks(embedding) VALUES (?)',
    );

    const write = db.transaction(() => {
      // INSERT chunks first → obtain lastInsertRowid (rowid-alignment contract D-05)
      const { lastInsertRowid } = insertChunk.run(documentId, content, metadata);
      if (!lastInsertRowid) {
        throw new Error(
          `chunks INSERT returned no rowid for document_id=${documentId}`,
        );
      }
      // INSERT vec_chunks — auto rowid aligns with chunks.id via shared transaction order
      insertVec.run(embedding);
    });

    write();
    this.logger.debug(`dualWriteChunk: wrote chunk for document_id=${documentId}`);
  }

  /**
   * KNN vector similarity search over vec_chunks.
   *
   * vec0 MATCH + JOIN chunks + JOIN documents — identical SQL to the original
   * vector-search.service.ts query (moved verbatim, T-05-03 / Pitfall 5).
   *
   * @param queryVec - Float32Array embedding of the query.
   * @param k        - Number of nearest neighbours to return (already clamped by caller).
   */
  knnSearch(queryVec: Float32Array, k: number): KnnRow[] {
    const db = this.databaseService.database;

    const rows = db
      .prepare(
        `
      SELECT
        c.id,
        c.document_id,
        c.content,
        c.metadata,
        d.filename,
        knn.distance
      FROM (
        SELECT rowid, distance
        FROM vec_chunks
        WHERE embedding MATCH ?
          AND k = ?
      ) knn
      JOIN chunks c ON c.id = knn.rowid
      JOIN documents d ON d.id = c.document_id
      ORDER BY knn.distance ASC
    `,
      )
      .all(queryVec, k) as KnnRow[];

    this.logger.debug(`knnSearch: returned ${rows.length} results`);
    return rows;
  }
}
