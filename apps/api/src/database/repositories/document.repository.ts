import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import {
  IDocumentRepository,
  DocRow,
} from '../interfaces/document.repository.interface';

/**
 * DocumentRepository — owns all SQL for the documents table.
 *
 * Implements IDocumentRepository so services depend on the interface token
 * (DOCUMENT_REPOSITORY) rather than this concrete class (D-02).
 *
 * Security (T-05-03): all values are bound as parameterized `?` placeholders —
 * no string interpolation into SQL.
 */
@Injectable()
export class DocumentRepository implements IDocumentRepository {
  private readonly logger = new Logger(DocumentRepository.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Return all ingested documents ordered by ingestion time (newest first).
   */
  listAll(): DocRow[] {
    const db = this.databaseService.database;

    const rows = db
      .prepare(
        `SELECT id, filename, mime_type, parse_log, created_at
         FROM documents
         ORDER BY created_at DESC`,
      )
      .all() as DocRow[];

    this.logger.debug(`listAll: returned ${rows.length} documents`);
    return rows;
  }

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
  ): void {
    const db = this.databaseService.database;

    db.prepare(
      'INSERT INTO documents (id, filename, mime_type, parse_log) VALUES (?, ?, ?, ?)',
    ).run(id, filename, mimeType, parseLogJson);

    this.logger.debug(`insertDocument: inserted document id=${id}`);
  }
}
