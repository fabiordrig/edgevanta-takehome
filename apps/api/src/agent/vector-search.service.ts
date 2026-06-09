import { Injectable, Inject, Logger } from '@nestjs/common';
import { ChunkSearchResult } from '@edgevanta/types';
import { EmbeddingService } from '../ingest/embedding.service';
import {
  CHUNK_REPOSITORY,
  IChunkRepository,
} from '../database/interfaces/chunk.repository.interface';

/**
 * VectorSearchService — semantic KNN search over vec_chunks (AGT-02).
 *
 * Embeds a natural-language query with EmbeddingService, then delegates to
 * IChunkRepository.knnSearch which runs the parameterised vec0 MATCH query
 * against vec_chunks joined to chunks and documents.
 *
 * All SQL lives in ChunkRepository. This service owns the embedding call,
 * the k clamp, and the result mapping only.
 *
 * Float32Array binding note: passed directly to better-sqlite3 via the
 * repository — sqlite-vec handles serialisation internally (Pitfall 5).
 */
@Injectable()
export class VectorSearchService {
  private readonly logger = new Logger(VectorSearchService.name);

  constructor(
    @Inject(CHUNK_REPOSITORY)
    private readonly chunkRepo: IChunkRepository,
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

    const rows = this.chunkRepo.knnSearch(queryVec, safeK);

    this.logger.debug(`knn returned ${rows.length} results`);

    return rows.map((r) => ({
      chunkId: r.id,
      documentId: r.document_id,
      content: r.content,
      metadata: (() => {
        try {
          return JSON.parse(r.metadata ?? '{}') as Record<string, unknown>;
        } catch {
          return {};
        }
      })(),
      filename: r.filename,
      distance: r.distance,
    }));
  }
}
