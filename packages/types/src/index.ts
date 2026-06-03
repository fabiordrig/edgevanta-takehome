/**
 * @edgevanta/types — Domain interfaces shared across apps/api and apps/web.
 *
 * Phase 1 exports ONLY domain interfaces (D-10).
 * HTTP contract types (tool inputs/outputs) are deferred to Phase 3.
 */

/**
 * EMBEDDING_DIM: single source of truth for the OpenAI text-embedding-3-small
 * output dimension (D-09). Used in:
 *   - apps/api/src/database/migrations/001_init.sql — vec0(embedding float[1536])
 *   - apps/api Phase 2 call site — embedding array length assertion
 *
 * Never hardcode 1536 anywhere else. Always import this constant.
 */
export const EMBEDDING_DIM = 1536;

/**
 * Document — represents an ingested file (CSV or PDF).
 * Maps to the `documents` logical entity (not a DB table in Phase 1;
 * document_id is stored inline on chunks and bid_items).
 */
export interface Document {
  /** UUID or slug identifying this document. */
  id: string;
  /** Original filename as uploaded. */
  filename: string;
  /** File type — determines ingestion pipeline. */
  type: 'csv' | 'pdf';
  /** ISO 8601 timestamp of ingestion. */
  ingestedAt: string;
}

/**
 * Chunk — one text segment extracted from a document, with its embedding stored
 * in the vec_chunks virtual table. Mirrors the `chunks` table (D-06):
 *   id INTEGER PRIMARY KEY AUTOINCREMENT
 *   document_id TEXT
 *   content TEXT
 *   metadata TEXT (JSON)
 *   created_at DATETIME
 */
export interface Chunk {
  /** SQLite integer rowid — aligns with vec_chunks rowid (D-05). */
  id: number;
  /** FK to the source document. */
  documentId: string;
  /** Raw text content of this chunk. */
  content: string;
  /**
   * Flexible metadata blob (JSON-encoded in DB).
   * Typical keys: page (PDF), rowStart/rowEnd (CSV), itemCode.
   * Typed as Record<string, unknown> — not any — for strict-mode forward
   * compatibility (DOC-03).
   */
  metadata: Record<string, unknown>;
  /** ISO 8601 timestamp of chunk creation. */
  createdAt: string;
}

/**
 * BidItem — one structured row from a DOT bid tabulation CSV.
 * Mirrors the `bid_items` table (D-07):
 *   id INTEGER PRIMARY KEY AUTOINCREMENT
 *   document_id TEXT
 *   item_code TEXT
 *   description TEXT
 *   unit TEXT
 *   quantity REAL
 *   unit_price REAL
 *   total_price REAL
 *
 * Numeric fields are nullable — DOT CSVs have missing/malformed values.
 * All nullable columns typed `T | null` to match SQL REAL (nullable by default).
 */
export interface BidItem {
  /** SQLite integer rowid. */
  id: number;
  /** FK to the source CSV document. */
  documentId: string;
  /** DOT item code (e.g. "2021.501") — may be absent. */
  itemCode: string | null;
  /** Line item description — may be absent or truncated. */
  description: string | null;
  /** Unit of measure (e.g. "EACH", "LF", "CY") — may be absent. */
  unit: string | null;
  /** Bid quantity — nullable (missing or non-numeric in source). */
  quantity: number | null;
  /** Unit price in dollars — nullable. */
  unitPrice: number | null;
  /** Total price = quantity × unitPrice — nullable. */
  totalPrice: number | null;
}
