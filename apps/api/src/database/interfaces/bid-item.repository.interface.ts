/**
 * Injection token for the IBidItemRepository interface.
 * Exported as a Symbol to avoid string-literal collision (D-02).
 */
export const BID_ITEM_REPOSITORY = Symbol('IBidItemRepository');

/**
 * Raw row returned by the detectOutliers SELECT.
 */
export interface BidPriceRow {
  id: number;
  description: string | null;
  unit_price: number;
}

/**
 * Raw row returned by the contractor-totals SELECT (ENG-07).
 */
export interface ContractorRow {
  contractor: string | null;
  total_price: number | null;
}

/**
 * IBidItemRepository — data access interface for the bid_items table.
 *
 * All SQL is owned by the implementing class; services depend only on this
 * interface via the BID_ITEM_REPOSITORY injection token (D-02).
 *
 * Security (T-05-03): all user/LLM values are bound as parameterized `?`
 * placeholders inside the implementing class — never interpolated.
 */
export interface IBidItemRepository {
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
  selectPricesForOutliers(itemCode?: string): BidPriceRow[];

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
  getContractorRows(filenameFilter?: string): ContractorRow[];

  /**
   * Count total bid_items rows (including NULL-contractor rows) for the
   * NULL-skip note computation (D-08).
   *
   * @param filenameFilter - Optional filename substring to scope results.
   */
  countRows(filenameFilter?: string): number;

  /**
   * Insert one bid item row (8-column insert as left by Plan 01).
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
  }): void;
}
