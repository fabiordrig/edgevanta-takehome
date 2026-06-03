import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PDFParse } from 'pdf-parse';
import { ParseLog } from '@edgevanta/types';
import { DatabaseService } from '../database/database.service';
import { EmbeddingService } from './embedding.service';

/**
 * PdfIngestService — handles PDF text extraction via pdf-parse, falls back to
 * gpt-4o-mini vision when the text layer is sparse (avgCharsPerPage < 50),
 * chunks the extracted text into ~512-token paragraph segments (~2000 chars),
 * embeds all chunks, and dual-writes to chunks + vec_chunks + documents.
 *
 * Satisfies INF-04 (PDF extraction + vision fallback), INF-05 (PDF chunking),
 * and INF-06 (parse log with fallback_triggered).
 */
@Injectable()
export class PdfIngestService {
  private readonly logger = new Logger(PdfIngestService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly embeddingService: EmbeddingService,
    private readonly config: ConfigService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Ingest a PDF file: extract text (or fall back to vision OCR), chunk,
   * embed, and dual-write to the database.
   *
   * @param file - The uploaded PDF file from Express.Multer.
   * @param documentId - UUID identifying this document.
   * @returns Ingestion result with document_id, status, and chunks_created.
   */
  async ingest(
    file: Express.Multer.File,
    documentId: string,
  ): Promise<{ document_id: string; status: string; chunks_created: number }> {
    // Step 1 — Extract text via pdf-parse v2 class API
    let pdfData: Awaited<ReturnType<InstanceType<typeof PDFParse>['getText']>>;
    try {
      const parser = new PDFParse({ data: file.buffer });
      pdfData = await parser.getText();
    } catch (err) {
      this.logger.error(`pdf-parse failed for ${file.originalname}: ${err}`);
      throw new BadRequestException(
        `Failed to parse PDF: ${(err as Error).message}`,
      );
    }

    // pdfData.total = number of pages; pdfData.text = full document text
    const numPages = pdfData.total;
    const avgCharsPerPage =
      pdfData.text.trim().length / Math.max(numPages, 1);

    this.logger.log(
      `PDF: numpages=${numPages}, avgCharsPerPage=${avgCharsPerPage.toFixed(2)}, fallback=${avgCharsPerPage < 50}`,
    );

    // Step 2 — Vision fallback gate (INF-04: exact threshold per CONTEXT.md)
    let fallbackTriggered: boolean;
    let fullText: string;

    if (avgCharsPerPage < 50) {
      fallbackTriggered = true;
      const base64Pages = await this.convertPdfToBase64Pages(file.buffer);
      fullText = await this.extractTextViaVision(base64Pages);
    } else {
      fallbackTriggered = false;
      fullText = pdfData.text;
    }

    // Step 3 — Chunk text (~512 tokens ≈ ~2000 chars) on paragraph boundaries
    const chunkTexts = this.chunkText(fullText);

    this.logger.log(
      `PDF chunked: ${chunkTexts.length} chunks, fallback=${fallbackTriggered}`,
    );

    // Step 4 — Batch embed all chunk texts
    const embeddings = await this.embeddingService.embed(chunkTexts);

    // Step 5 — Dual-write chunks + vec_chunks (rowid alignment D-05)
    const db = this.databaseService.database;

    const insertChunk = db.prepare(
      'INSERT INTO chunks (document_id, content, metadata) VALUES (?, ?, ?)',
    );
    const insertVec = db.prepare(
      'INSERT INTO vec_chunks(embedding) VALUES (?)',
    );

    const dualWrite = db.transaction(() => {
      for (let i = 0; i < chunkTexts.length; i++) {
        const metadata: Record<string, unknown> = {
          source_type: 'pdf',
          chunk_index: i,
          document_id: documentId,
        };

        const { lastInsertRowid } = insertChunk.run(
          documentId,
          chunkTexts[i],
          JSON.stringify(metadata),
        );

        if (!lastInsertRowid) {
          throw new Error(
            `chunks INSERT returned no rowid for chunk_index ${i}`,
          );
        }

        insertVec.run(new Float32Array(embeddings[i]));
      }
    });

    dualWrite();

    // Step 6 — Write documents row with 7-field D-09 parse log
    const parseLog: ParseLog = {
      columns_mapped: [],
      unmapped_columns: [],
      rows_processed: chunkTexts.length,
      rows_skipped: 0,
      skip_reasons: [],
      fallback_triggered: fallbackTriggered,
      chunk_count: chunkTexts.length,
    };

    db.prepare(
      'INSERT INTO documents (id, filename, mime_type, parse_log) VALUES (?, ?, ?, ?)',
    ).run(
      documentId,
      file.originalname,
      file.mimetype,
      JSON.stringify(parseLog),
    );

    // Step 7 — Return result
    return {
      document_id: documentId,
      status: 'ok',
      chunks_created: chunkTexts.length,
    };
  }

  /**
   * Convert a PDF Buffer to an array of base64-encoded PNG strings (one per page)
   * using pdf-to-img with scale=2 for higher resolution.
   *
   * Uses dynamic import to avoid ERR_REQUIRE_ESM — pdf-to-img is ESM-only.
   */
  private async convertPdfToBase64Pages(buffer: Buffer): Promise<string[]> {
    const { pdf: pdfToImg } = await import('pdf-to-img');
    const base64Pages: string[] = [];
    const doc = await pdfToImg(buffer, { scale: 2 });

    try {
      for await (const pageBuffer of doc) {
        base64Pages.push(pageBuffer.toString('base64'));
      }
    } finally {
      await doc.destroy();
    }

    return base64Pages;
  }

  /**
   * Extract text from scanned PDF pages via gpt-4o-mini vision.
   * Calls OpenAI once per page with an image_url data URI.
   *
   * @param pages - Array of base64-encoded PNG strings (one per page).
   * @returns Concatenated text from all pages, joined with double-newlines.
   */
  private async extractTextViaVision(pages: string[]): Promise<string> {
    const pageTexts: string[] = [];

    for (let i = 0; i < pages.length; i++) {
      this.logger.debug(`Vision OCR: processing page ${i + 1}/${pages.length}`);

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract all text visible in this construction plan image. Output only the text content, no commentary.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${pages[i]}`,
                },
              },
            ],
          },
        ],
      });

      const pageText = response.choices[0]?.message?.content ?? '';
      pageTexts.push(pageText);
    }

    return pageTexts.join('\n\n');
  }

  /**
   * Split fullText into ~2000-char paragraph chunks.
   * Splits on double-newline boundaries; merges greedily up to 2000 chars.
   * Filters out empty-string chunks.
   *
   * @param fullText - The extracted text to chunk.
   * @returns Array of non-empty text chunks.
   */
  private chunkText(fullText: string): string[] {
    const paragraphs = fullText.split(/\n{2,}/);
    const chunks: string[] = [];
    let current = '';

    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) {
        continue;
      }

      const joined = current ? `${current}\n\n${trimmed}` : trimmed;

      if (joined.length <= 2000) {
        current = joined;
      } else {
        if (current) {
          chunks.push(current);
        }
        // If a single paragraph exceeds 2000 chars, push it as its own chunk
        current = trimmed;
      }
    }

    if (current.trim()) {
      chunks.push(current);
    }

    return chunks.filter((c) => c.trim().length > 0);
  }
}
