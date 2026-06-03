import { Injectable, Logger } from '@nestjs/common';
import { DocumentMeta, ParseLog } from '@edgevanta/types';
import { DatabaseService } from '../database/database.service';

/**
 * Raw row returned by the SELECT from the documents table.
 * Typed to avoid `any` (DOC-03).
 */
interface RawDocRow {
  id: string;
  filename: string | null;
  mime_type: string | null;
  parse_log: string;
  created_at: string;
}

/**
 * Minimal safe fallback for a corrupt or missing parse_log (T-03-05).
 * A single corrupt row must never crash the list call.
 */
const FALLBACK_PARSE_LOG: ParseLog = {
  columns_mapped: [],
  unmapped_columns: [],
  rows_processed: 0,
  rows_skipped: 0,
  skip_reasons: [],
  fallback_triggered: false,
  chunk_count: 0,
};

/**
 * DocumentsService — list_documents data source (AGT-04).
 *
 * Returns every ingested document from the documents table as DocumentMeta[].
 * parse_log JSON is decoded per row; parse failures fall back to a safe
 * default so one corrupt row cannot break the entire list (T-03-05).
 */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Return all ingested documents ordered by ingestion time (newest first).
   */
  list(): DocumentMeta[] {
    const rows = this.databaseService.database
      .prepare(
        `SELECT id, filename, mime_type, parse_log, created_at
         FROM documents
         ORDER BY created_at DESC`,
      )
      .all() as RawDocRow[];

    return rows.map((r) => {
      let parseLog: ParseLog;

      try {
        parseLog = JSON.parse(r.parse_log) as ParseLog;
      } catch (err) {
        this.logger.warn(
          `Failed to parse parse_log for document ${r.id} — using fallback`,
          err instanceof Error ? err.message : String(err),
        );
        parseLog = { ...FALLBACK_PARSE_LOG };
      }

      return {
        id: r.id,
        filename: r.filename,
        mimeType: r.mime_type,
        createdAt: r.created_at,
        parseLog,
      };
    });
  }
}
