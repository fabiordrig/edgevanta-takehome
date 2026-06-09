import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import {
  IBidItemRepository,
  BidPriceRow,
  ContractorRow,
} from '../interfaces/bid-item.repository.interface';

/**
 * BidItemRepository — owns all SQL for the bid_items table.
 *
 * Implements IBidItemRepository so services depend on the interface token
 * (BID_ITEM_REPOSITORY) rather than this concrete class (D-02).
 *
 * Security (T-05-03): all user/LLM-supplied values (itemCode, filenameFilter)
 * are bound as parameterized `?` placeholders — no string interpolation into SQL.
 * Preserves T-03-06 and T-05-01 bindings verbatim from the original service code.
 */
@Injectable()
export class BidItemRepository implements IBidItemRepository {
  private readonly logger = new Logger(BidItemRepository.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Fetch bid_items rows for outlier detection.
   *
   * When itemCode is provided, results are scoped to that item_code group.
   * When omitted, all rows with non-null unit_price are returned.
   *
   * Security (T-03-06): itemCode bound as parameterized `?`.
   *
   * @param itemCode - Optional DOT item code to scope the analysis.
   */
  selectPricesForOutliers(itemCode?: string): BidPriceRow[] {
    const db = this.databaseService.database;

    const rows = itemCode
      ? (db
          .prepare(
            'SELECT id, description, unit_price FROM bid_items WHERE item_code = ? AND unit_price IS NOT NULL',
          )
          .all(itemCode) as BidPriceRow[])
      : (db
          .prepare(
            'SELECT id, description, unit_price FROM bid_items WHERE unit_price IS NOT NULL',
          )
          .all() as BidPriceRow[]);

    this.logger.debug(
      `selectPricesForOutliers: ${rows.length} rows${itemCode ? ` for item_code=${itemCode}` : ''}`,
    );
    return rows;
  }

  /**
   * Fetch contractor + total_price rows for aggregation.
   *
   * Returns only rows where contractor IS NOT NULL.
   * Optionally filtered to a document filename substring.
   *
   * Security (T-05-01): filenameFilter bound as parameterized `?` with `%...%`.
   *
   * @param filenameFilter - Optional filename substring to scope results.
   */
  getContractorRows(filenameFilter?: string): ContractorRow[] {
    const db = this.databaseService.database;

    const rows = filenameFilter
      ? (db
          .prepare(
            `SELECT b.contractor, b.total_price FROM bid_items b
             JOIN documents d ON b.document_id = d.id
             WHERE d.filename LIKE ? AND b.contractor IS NOT NULL`,
          )
          .all(`%${filenameFilter}%`) as ContractorRow[])
      : (db
          .prepare(
            'SELECT contractor, total_price FROM bid_items WHERE contractor IS NOT NULL',
          )
          .all() as ContractorRow[]);

    this.logger.debug(`getContractorRows: ${rows.length} rows`);
    return rows;
  }

  /**
   * Count total bid_items rows (including NULL-contractor rows) for the
   * NULL-skip note computation (D-08).
   *
   * Security (T-05-01): filenameFilter bound as parameterized `?` with `%...%`.
   *
   * @param filenameFilter - Optional filename substring to scope results.
   */
  countRows(filenameFilter?: string): number {
    const db = this.databaseService.database;

    const count = filenameFilter
      ? (
          db
            .prepare(
              `SELECT COUNT(*) as c FROM bid_items b
               JOIN documents d ON b.document_id = d.id
               WHERE d.filename LIKE ?`,
            )
            .get(`%${filenameFilter}%`) as { c: number }
        ).c
      : (
          db.prepare('SELECT COUNT(*) as c FROM bid_items').get() as {
            c: number;
          }
        ).c;

    return count;
  }

  /**
   * Insert one bid item row (8-column insert as established by Plan 01).
   *
   * @param row - All 8 bid_items columns.
   */
  insertBidItem(row: {
    documentId: string;
    itemCode: string | null;
    description: string | null;
    unit: string | null;
    quantity: number | null;
    unitPrice: number | null;
    totalPrice: number | null;
    contractor: string | null;
  }): void {
    const db = this.databaseService.database;

    db.prepare(
      'INSERT INTO bid_items (document_id, item_code, description, unit, quantity, unit_price, total_price, contractor) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      row.documentId,
      row.itemCode,
      row.description,
      row.unit,
      row.quantity,
      row.unitPrice,
      row.totalPrice,
      row.contractor,
    );

    this.logger.debug(
      `insertBidItem: inserted for document_id=${row.documentId}`,
    );
  }
}
