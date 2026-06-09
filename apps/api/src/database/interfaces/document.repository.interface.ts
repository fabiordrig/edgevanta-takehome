/**
 * Injection token for the IDocumentRepository interface.
 * Exported as a Symbol to avoid string-literal collision (D-02).
 */
export const DOCUMENT_REPOSITORY = Symbol('IDocumentRepository');

/**
 * Raw row returned by the documents SELECT.
 */
export interface DocRow {
  id: string;
  filename: string | null;
  mime_type: string | null;
  parse_log: string;
  created_at: string;
}

/**
 * IDocumentRepository — data access interface for the documents table.
 *
 * All SQL is owned by the implementing class; services depend only on this
 * interface via the DOCUMENT_REPOSITORY injection token so Phase 7 can mock
 * data access by providing an alternative implementation (D-02).
 */
export interface IDocumentRepository {
  /**
   * Return all ingested documents ordered by ingestion time (newest first).
   */
  listAll(): DocRow[];

  /**
   * Insert one document row.
   *
   * @param id           - UUID for this document.
   * @param filename     - Original filename from the uploaded file.
   * @param mimeType     - MIME type of the uploaded file.
   * @param parseLogJson - JSON-serialised ParseLog for this document.
   */
  insertDocument(
    id: string,
    filename: string,
    mimeType: string,
    parseLogJson: string,
  ): void;
}
