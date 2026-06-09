export declare const EMBEDDING_DIM = 1536;
export interface ParseLog {
  columns_mapped: string[];
  unmapped_columns: string[];
  rows_processed: number;
  rows_skipped: number;
  skip_reasons: string[];
  fallback_triggered: boolean;
  chunk_count: number;
}
export interface Document {
  id: string;
  filename: string;
  type: 'csv' | 'pdf';
  ingestedAt: string;
  parseLog?: ParseLog;
}
export interface Chunk {
  id: number;
  documentId: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}
export interface BidItem {
  id: number;
  documentId: string;
  itemCode: string | null;
  description: string | null;
  unit: string | null;
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
}
