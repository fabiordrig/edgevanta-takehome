import { Injectable, Inject, Logger } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { ParseLog } from '@edgevanta/types';
import { EmbeddingService } from './embedding.service';
import columnAliases from './column-aliases.json';
import {
  CHUNK_REPOSITORY,
  IChunkRepository,
} from '../database/interfaces/chunk.repository.interface';
import {
  BID_ITEM_REPOSITORY,
  IBidItemRepository,
} from '../database/interfaces/bid-item.repository.interface';
import {
  DOCUMENT_REPOSITORY,
  IDocumentRepository,
} from '../database/interfaces/document.repository.interface';

/**
 * CsvIngestService — parses a DOT bid tabulation CSV, resolves column aliases,
 * generates OpenAI embeddings, and dual-writes to chunks + vec_chunks + bid_items.
 *
 * Partial-ingest model (D-12): valid rows are committed even if other rows have
 * parse errors. No full-document rollback.
 *
 * All SQL is delegated to repository interfaces (ENG-06):
 *   - IChunkRepository.dualWriteChunk — chunks + vec_chunks atomic write (D-05)
 *   - IBidItemRepository.insertBidItem — bid_items row write
 *   - IDocumentRepository.insertDocument — documents row write
 */
@Injectable()
export class CsvIngestService {
  private readonly logger = new Logger(CsvIngestService.name);

  /** Alias map from column-aliases.json (keys are post-normalization form). */
  private readonly aliasMap: Record<string, string> =
    columnAliases as Record<string, string>;

  constructor(
    @Inject(CHUNK_REPOSITORY)
    private readonly chunkRepo: IChunkRepository,
    @Inject(BID_ITEM_REPOSITORY)
    private readonly bidItemRepo: IBidItemRepository,
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documentRepo: IDocumentRepository,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Resolve a CSV record's value for a canonical field name.
   *
   * Lookup strategy (in order):
   * 1. Exact match: record[canonicalName] (header already equals canonical form)
   * 2. Alias match: find all alias-map keys whose value === canonicalName,
   *    return the first non-null record[aliasKey]
   *
   * @param record - Normalised CSV row (keys already lowercased + underscore).
   * @param canonicalName - Canonical field name (e.g. "description", "unit_price").
   * @param aliases - The loaded alias map.
   * @returns The raw string value, or null if not found.
   */
  private resolveField(
    record: Record<string, string>,
    canonicalName: string,
    aliases: Record<string, string>,
  ): string | null {
    // 1. Direct canonical key match (e.g. header already is "description")
    if (record[canonicalName] !== undefined && record[canonicalName] !== '') {
      return record[canonicalName];
    }

    // 2. Alias lookup — find keys in alias map whose value is the canonical name
    for (const [aliasKey, targetName] of Object.entries(aliases)) {
      if (targetName === canonicalName && record[aliasKey] !== undefined) {
        const val = record[aliasKey];
        if (val !== '') return val;
      }
    }

    return null;
  }

  /**
   * Strip commas from a numeric string and parse as float.
   * Returns null when the result is NaN (missing or non-numeric source value).
   */
  private parseNumeric(raw: string | null): number | null {
    if (raw === null || raw.trim() === '') return null;
    const cleaned = raw.replace(/,/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  /**
   * Ingest a CSV file: parse → alias map → generate embeddings → dual-write DB.
   *
   * @param file - Multer file with buffer, originalname, mimetype.
   * @param documentId - UUID for this document (caller-supplied).
   * @returns Result envelope with document_id, status, and chunks_created count.
   */
  async ingest(
    file: Express.Multer.File,
    documentId: string,
  ): Promise<{ document_id: string; status: string; chunks_created: number }> {
    // ── Step 1: Parse CSV from Buffer ────────────────────────────────────────
    const records = parse(file.buffer, {
      columns: (headers: string[]) =>
        headers.map((h) =>
          h
            .trim()
            .toLowerCase()
            .replace(/[\s.\-\/]+/g, '_'),
        ),
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
      bom: true,
    }) as Record<string, string>[];

    this.logger.log(
      `Parsed ${records.length} rows from ${file.originalname} (document_id: ${documentId})`,
    );

    // ── Step 2: Classify columns ─────────────────────────────────────────────
    const columnsMapped: string[] = [];
    const unmappedColumns: string[] = [];

    if (records.length > 0) {
      const firstRowKeys = Object.keys(records[0]);
      for (const key of firstRowKeys) {
        // A column is "mapped" if it is itself a canonical name (matches a value
        // in aliasMap) OR if it directly appears as a key in aliasMap.
        const isAliasKey = this.aliasMap[key] !== undefined;
        const isCanonicalTarget = Object.values(this.aliasMap).includes(key);
        if (isAliasKey || isCanonicalTarget) {
          columnsMapped.push(key);
        } else {
          unmappedColumns.push(key);
        }
      }
    }

    this.logger.log(
      `Columns mapped: [${columnsMapped.join(', ')}] | Unmapped: [${unmappedColumns.join(', ')}]`,
    );

    // ── Step 3: Process rows ─────────────────────────────────────────────────
    const chunkTexts: string[] = [];
    const validRowIndices: number[] = [];

    /** Metadata for each valid row (aligned with chunkTexts). */
    const rowMeta: Array<{
      item_code: string | null;
      description: string | null;
      unit: string | null;
      quantity: number | null;
      unit_price: number | null;
      total_price: number | null;
      contractor: string | null;
      row_index: number;
    }> = [];

    let rowsSkipped = 0;
    const skipReasons: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];

      const description = this.resolveField(record, 'description', this.aliasMap);
      const unitPriceRaw = this.resolveField(record, 'unit_price', this.aliasMap);

      // D-06: skip row if description is absent or too short (< 3 chars) —
      // rows without a meaningful description produce semantically poor embeddings.
      if (description === null || description.trim().length < 3) {
        rowsSkipped++;
        skipReasons.push(`row_${i}: description absent or too short`);
        this.logger.debug(`Skipping row ${i}: description absent or too short`);
        continue;
      }

      const item_code = this.resolveField(record, 'item_code', this.aliasMap);
      const unit = this.resolveField(record, 'unit', this.aliasMap);
      const quantityRaw = this.resolveField(record, 'quantity', this.aliasMap);
      const totalPriceRaw = this.resolveField(record, 'total_price', this.aliasMap);
      // Contractor is now a mapped canonical field — resolves from contractor/bidder/company/etc.
      // null when not present in source CSV; does NOT gate row inclusion.
      const contractor = this.resolveField(record, 'contractor', this.aliasMap);

      const unit_price = this.parseNumeric(unitPriceRaw);
      const quantity = this.parseNumeric(quantityRaw);
      const total_price = this.parseNumeric(totalPriceRaw);

      // D-01: pipe-separated KV chunk text — canonical fields + non-empty unmapped columns
      const kvParts: string[] = [];
      if (item_code) kvParts.push(`item_code: ${item_code}`);
      if (description) kvParts.push(`description: ${description}`);
      if (unit) kvParts.push(`unit: ${unit}`);
      if (unit_price !== null) kvParts.push(`unit_price: ${unit_price}`);
      if (total_price !== null) kvParts.push(`total_price: ${total_price}`);
      if (quantity !== null) kvParts.push(`quantity: ${quantity}`);

      // Append unmapped columns that have values — contractor is now mapped, so it
      // will NOT appear in unmappedColumns and is excluded from chunk text (correct:
      // the typed bid_items.contractor column replaces the free-text capture).
      for (const key of unmappedColumns) {
        const val = record[key];
        if (val && val.trim()) kvParts.push(`${key}: ${val.trim()}`);
      }

      const chunkText = kvParts.join(' | ');
      chunkTexts.push(chunkText);
      validRowIndices.push(i);

      rowMeta.push({
        item_code,
        description,
        unit,
        quantity,
        unit_price,
        total_price,
        contractor,
        row_index: i,
      });
    }

    const rowsProcessed = records.length - rowsSkipped;

    // ── Step 4: Batch embed all valid chunk texts ─────────────────────────────
    this.logger.log(
      `Generating embeddings for ${chunkTexts.length} chunks (rows_processed: ${rowsProcessed}, rows_skipped: ${rowsSkipped})`,
    );

    const embeddings = await this.embeddingService.embed(chunkTexts);

    // ── Step 5: Dual-write in per-row transactions ───────────────────────────
    let chunkCount = 0;

    for (let j = 0; j < chunkTexts.length; j++) {
      const chunkText = chunkTexts[j];
      const embedding = embeddings[j];
      const meta = rowMeta[j];

      // D-03: chunks.metadata schema
      const metadata = {
        source_type: 'csv',
        row_index: meta.row_index,
        document_id: documentId,
      };

      // dualWriteChunk wraps both chunks + vec_chunks inserts in a db.transaction
      // — rowid-alignment contract (D-05) is maintained inside the repository.
      this.chunkRepo.dualWriteChunk(
        documentId,
        chunkText,
        JSON.stringify(metadata),
        new Float32Array(embedding),
      );

      // INSERT bid_items for Phase 3 statistical queries
      this.bidItemRepo.insertBidItem({
        documentId,
        itemCode: meta.item_code,
        description: meta.description,
        unit: meta.unit,
        quantity: meta.quantity,
        unitPrice: meta.unit_price,
        totalPrice: meta.total_price,
        contractor: meta.contractor,
      });

      chunkCount++;
    }

    this.logger.log(
      `Dual-write complete: ${chunkCount} chunks + ${chunkCount} vec_chunks + ${chunkCount} bid_items written`,
    );

    // ── Step 6: Write documents row ──────────────────────────────────────────
    const parseLog: ParseLog = {
      columns_mapped: columnsMapped,
      unmapped_columns: unmappedColumns,
      rows_processed: rowsProcessed,
      rows_skipped: rowsSkipped,
      skip_reasons: skipReasons,
      fallback_triggered: false, // always false for CSV (PDF-only concept)
      chunk_count: chunkCount,
    };

    this.documentRepo.insertDocument(
      documentId,
      file.originalname,
      file.mimetype,
      JSON.stringify(parseLog),
    );

    this.logger.log(`Document record inserted (id: ${documentId})`);

    // ── Step 7: Return result ─────────────────────────────────────────────────
    return { document_id: documentId, status: 'ok', chunks_created: chunkCount };
  }
}
