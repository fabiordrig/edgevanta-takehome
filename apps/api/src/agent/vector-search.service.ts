import { Injectable, Logger } from '@nestjs/common';
import { ChunkSearchResult } from '@edgevanta/types';
import { DatabaseService } from '../database/database.service';
import { EmbeddingService } from '../ingest/embedding.service';

/**
 * Raw row returned by the vec0 KNN + JOIN query.
 * Typed to avoid `any` (DOC-03).
 */
interface RawKnnRow {
  id: number;
  document_id: string;
  content: string;
  metadata: string | null;
  filename: string;
  distance: number;
}

/**
 * VectorSearchService — semantic KNN search over vec_chunks (AGT-02).
 *
 * Embeds a natural-language query with EmbeddingService, then runs a
 * parameterised vec0 MATCH query against vec_chunks joined to chunks and
 * documents. All user/LLM-supplied values (query, k) are bound as
 * parameterised placeholders — no string interpolation into SQL (T-03-03).
 *
 * Float32Array binding note: pass the typed array directly to better-sqlite3;
 * pass the typed array directly — sqlite-vec handles serialisation internally (Pitfall 5).
 */
@Injectable()
export class VectorSearchService {
  private readonly logger = new Logger(VectorSearchService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Return the top-k chunks most semantically similar to `query`.
   *
   * @param query - Natural language query string.
   * @param k     - Number of results to return. Values < 1 are clamped to 1.
   * @returns     Ranked ChunkSearchResult[] in ascending distance order.
   */
  async knn(query: string, k: number): Promise<ChunkSearchResult[]> {
    // Clamp k to a positive integer (T-03-04 / AGT-02 validation).
    const safeK = Math.max(1, Math.floor(k));

    this.logger.debug(
      `knn called — query length: ${query.length}, k: ${safeK}`,
    );

    const [embedding] = await this.embeddingService.embed([query]);

    if (embedding === undefined) {
      throw new Error(
        'EmbeddingService.embed returned no embedding for the query',
      );
    }

    // Pass Float32Array directly — sqlite-vec handles serialisation (Pitfall 5 / A5).
    const queryVec = new Float32Array(embedding);

    // vec0 KNN: rowid from vec_chunks aligns with chunks.id (D-05 rowid contract).
    // Join uses c.id = knn.rowid (not c.rowid) — Pitfall 4.
    const rows = this.databaseService.database
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
      .all(queryVec, safeK) as RawKnnRow[];

    this.logger.debug(`knn returned ${rows.length} results`);

    return rows.map((r) => ({
      chunkId: r.id,
      documentId: r.document_id,
      content: r.content,
      metadata: (() => { try { return JSON.parse(r.metadata ?? '{}') as Record<string, unknown>; } catch { return {}; } })(),
      filename: r.filename,
      distance: r.distance,
    }));
  }
}
