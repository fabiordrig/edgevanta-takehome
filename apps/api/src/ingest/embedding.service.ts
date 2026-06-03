import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { EMBEDDING_DIM } from '@edgevanta/types';

/**
 * EmbeddingService — wraps OpenAI text-embedding-3-small.
 *
 * Batches input texts into groups of BATCH_SIZE, calls the OpenAI embeddings
 * API once per batch, sorts results by item.index (Pitfall 4 guard), asserts
 * each embedding dimension matches EMBEDDING_DIM, and returns a flat number[][].
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly openai: OpenAI;

  /** Maximum texts per OpenAI embeddings.create call. */
  private static readonly BATCH_SIZE = 100;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Generate embeddings for the provided texts.
   *
   * @param texts - Array of strings to embed.
   * @returns Promise resolving to a number[][] where each inner array is a
   *          1536-dimensional float vector aligned to the input index.
   * @throws Error with "Dim mismatch" message if any returned vector deviates
   *         from EMBEDDING_DIM (guards against model changes).
   */
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const results: number[][] = new Array(texts.length);
    const batchSize = EmbeddingService.BATCH_SIZE;

    for (let offset = 0; offset < texts.length; offset += batchSize) {
      const batch = texts.slice(offset, offset + batchSize);

      this.logger.debug(
        `Embedding batch ${Math.floor(offset / batchSize) + 1}/${Math.ceil(texts.length / batchSize)} (${batch.length} texts, model: text-embedding-3-small)`,
      );

      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: batch,
        encoding_format: 'float',
      });

      // Sort by item.index before mapping — Pitfall 4 guard: OpenAI API
      // contract does not guarantee response order matches input order.
      const sorted = response.data.slice().sort((a, b) => a.index - b.index);

      for (const item of sorted) {
        if (item.index < 0 || item.index >= batch.length) {
          throw new Error(
            `OpenAI returned out-of-range item.index ${item.index} for batch of ${batch.length}`,
          );
        }
        if (item.embedding.length !== EMBEDDING_DIM) {
          throw new Error(
            `Dim mismatch: got ${item.embedding.length}, expected ${EMBEDDING_DIM}`,
          );
        }
        results[offset + item.index] = item.embedding;
      }
    }

    return results;
  }
}
