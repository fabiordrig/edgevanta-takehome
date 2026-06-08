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
 * Per-document ingestion summary (D-09). Stored as JSON in documents.parse_log column.
 */
export interface ParseLog {
  /** Header columns that matched an alias or canonical name. */
  columns_mapped: string[];
  /** Header columns with no alias (logged, row continues per D-05). */
  unmapped_columns: string[];
  /** Total rows parsed from CSV / total chunks from PDF. */
  rows_processed: number;
  /** Rows missing description AND unit_price (per D-06). */
  rows_skipped: number;
  /** One entry per skipped row with reason text. */
  skip_reasons: string[];
  /** True when avgCharsPerPage < 50 triggered vision path (INF-04). */
  fallback_triggered: boolean;
  /** Number of chunks created and stored. */
  chunk_count: number;
}

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
  /** Populated after ingestion. Stored as JSON in documents.parse_log column. */
  parseLog?: ParseLog;
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
 *   contractor TEXT
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
  /** Bidding contractor/company name — nullable (absent in non-bid-tabulation CSVs). */
  contractor: string | null;
}

// ─── Phase 3: Agent Tool I/O Contract Types ───────────────────────────────────
// HTTP contract types for Phase 3 agent tools. Defined here so both apps/api
// (tool implementations) and apps/web (chat UI types) consume the same shapes.
// Do NOT import from @anthropic-ai/sdk in this package — keep it dependency-free.
// ChatMessage is a structural mirror of Anthropic MessageParam, not an SDK re-export.

/**
 * ChunkSearchResult — one hit returned by VectorSearchService.knn (AGT-02).
 *
 * Maps a single vec_chunks KNN result row joined with chunks and documents tables.
 * `distance` is the L2 distance from the query vector; lower is more similar.
 */
export interface ChunkSearchResult {
  /** SQLite rowid of the matched chunk (aligns with vec_chunks rowid). */
  chunkId: number;
  /** UUID of the source document (FK to documents.id). */
  documentId: string;
  /** Raw text content of the chunk. */
  content: string;
  /**
   * Flexible metadata blob decoded from the chunks.metadata JSON column.
   * Typical keys: page (PDF), rowStart/rowEnd (CSV), itemCode.
   * Typed as Record<string, unknown> — not any — for strict-mode (DOC-03).
   */
  metadata: Record<string, unknown>;
  /** Original filename from documents.filename. */
  filename: string;
  /** L2 distance from query vector to this chunk's embedding. */
  distance: number;
}

/**
 * OutlierLabel — label taxonomy for BidAnalysisService outlier detection (AGT-03).
 *
 * Convention (MAD-based, threshold ±3.5):
 *   - 'statistical_high'  → modifiedZScore > +3.5  (above-median outlier)
 *   - 'token_bid'         → modifiedZScore < -3.5  (suspiciously low bid)
 *   - 'statistical_low'   → reserved for below-median outliers that are not
 *                            token bids; implementations may collapse into
 *                            'token_bid' — all three labels are exported per AGT-03.
 */
export type OutlierLabel = 'token_bid' | 'statistical_high' | 'statistical_low';

/**
 * Outlier — one flagged bid item from BidAnalysisService.detectOutliers (AGT-03).
 */
export interface Outlier {
  /** SQLite rowid of the bid_items row. */
  id: number;
  /** Line item description — may be null for rows with missing descriptions. */
  description: string | null;
  /** Unit price in dollars. */
  unitPrice: number;
  /** Modified Z-Score (MAD-based): M_i = 0.6745 × (x_i − median) / MAD. */
  modifiedZScore: number;
  /** Outlier classification label. */
  label: OutlierLabel;
}

/**
 * OutlierResult — full response from BidAnalysisService.detectOutliers (AGT-03).
 *
 * `disclaimer` is always present and contains FHWA guidance text.
 * `median` and `note` are optional (absent when fewer than 3 data points).
 */
export interface OutlierResult {
  /** Array of flagged bid items. Empty when no outliers or insufficient data. */
  outliers: Outlier[];
  /** Median unit_price across the analysed item set. */
  median?: number;
  /** Human-readable note (e.g. "Insufficient data for statistical analysis"). */
  note?: string;
  /**
   * FHWA guidance disclaimer — always present.
   * Text: "Statistical outlier detection uses Modified Z-Score (MAD-based,
   * threshold ±3.5) per FHWA guidance. Results are indicative only and should
   * be verified against project-specific conditions before use in bid decisions."
   */
  disclaimer: string;
}

/**
 * DocumentMeta — one row from the documents table (AGT-04 / list_documents tool).
 *
 * Column mapping:
 *   documents.id          → id
 *   documents.filename    → filename
 *   documents.mime_type   → mimeType
 *   documents.created_at  → createdAt
 *   documents.parse_log   → parseLog (JSON-decoded)
 */
export interface DocumentMeta {
  /** UUID v4 primary key. */
  id: string;
  /** Original filename as uploaded — nullable (SQL column allows NULL). */
  filename: string | null;
  /** MIME type (e.g. "text/csv", "application/pdf") — nullable. */
  mimeType: string | null;
  /** ISO 8601 timestamp of ingestion (documents.created_at). */
  createdAt: string;
  /** Ingestion summary decoded from the parse_log JSON column. */
  parseLog: ParseLog;
}

/**
 * ChatMessage — one turn in a client-facing conversation (AGT-07).
 *
 * Structural mirror of Anthropic MessageParam (role + string content).
 * The server maps this to MessageParam before passing to toolRunner.
 * Do NOT import MessageParam from @anthropic-ai/sdk here — keep this package
 * dependency-free.
 */
export interface ChatMessage {
  /** Conversation participant. */
  role: 'user' | 'assistant';
  /** Text content of the turn. */
  content: string;
}

/**
 * ChatRequest — POST /agent/chat request body shape (AGT-07).
 *
 * The client sends the full message history each turn; the server passes it
 * directly to toolRunner (no server-side session storage).
 */
export interface ChatRequest {
  /** Full conversation history including the new user message at the end. */
  messages: ChatMessage[];
}
