import { Injectable, Inject, Logger } from '@nestjs/common';
import { Outlier, OutlierLabel, OutlierResult } from '@edgevanta/types';
import {
  BID_ITEM_REPOSITORY,
  IBidItemRepository,
} from '../database/interfaces/bid-item.repository.interface';

/**
 * FHWA disclaimer text appended to every OutlierResult (AGT-03).
 * Always present — this is a correctness control, not optional metadata.
 */
export const FHWA_DISCLAIMER =
  'Statistical outlier detection uses Modified Z-Score (MAD-based, threshold +/-3.5) per FHWA guidance. ' +
  'Results are indicative only and should be verified against project-specific conditions before use in bid decisions.';

export interface ContractorTotal {
  contractor: string;
  total_bid: number;
  items_found: number;
}

export interface ContractorTotalsResult {
  contractors: ContractorTotal[];
  note?: string;
}

/**
 * Compute the median of a non-empty numeric array.
 * - Creates a sorted copy (does not mutate input).
 * - Even-length: returns average of the two middle values.
 * - Odd-length: returns the middle value.
 *
 * @param values - Non-empty array of numbers.
 * @returns Median value.
 */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Compute Modified Z-Scores for each value using the MAD formula:
 *   M_i = 0.6745 × (x_i − median) / MAD
 *
 * Edge case (Pitfall 5): when MAD = 0 (all values identical), no spread exists
 * and division would be undefined. Guard returns all-zero scores — no outliers.
 *
 * @param values - Array of numbers (at least 1 element).
 * @returns Modified Z-Score for each input value, in the same order.
 */
export function modifiedZScores(values: number[]): number[] {
  const med = median(values);
  const deviations = values.map((v) => Math.abs(v - med));
  const mad = median(deviations);

  // MAD = 0 guard: all values are identical — no spread, no outliers possible.
  // Return zeros to avoid division by zero (NaN/Infinity would break downstream).
  if (mad === 0) return values.map(() => 0);

  return values.map((v) => (0.6745 * (v - med)) / mad);
}

/**
 * BidAnalysisService — statistical outlier detection over bid_items (AGT-03).
 *
 * Implements the `detect_outliers` tool data source using Modified Z-Score
 * (MAD-based) as specified by FHWA guidance. Pure math over a DB read —
 * no LLM involved. Fully unit-testable in isolation.
 *
 * All SQL is delegated to IBidItemRepository via the BID_ITEM_REPOSITORY token.
 *
 * Label convention (A3 resolution from RESEARCH Open Question 1):
 *   - score > +3.5 → 'statistical_high'  (above-median price outlier)
 *   - score < -3.5 → 'token_bid'         (suspiciously low bid, construction term)
 *
 * 'statistical_low' is reserved in the OutlierLabel union for future use
 * (e.g., a distinct below-lower-bound rule separate from token_bid). It is
 * NOT assigned here to keep behavior deterministic and consistent with the
 * project's label taxonomy documentation.
 */
@Injectable()
export class BidAnalysisService {
  private readonly logger = new Logger(BidAnalysisService.name);

  constructor(
    @Inject(BID_ITEM_REPOSITORY)
    private readonly bidItemRepo: IBidItemRepository,
  ) {}

  /**
   * Detect statistical outliers in bid_items unit prices.
   *
   * When itemCode is provided, analysis is scoped to that item_code group.
   * When omitted, all bid items with non-null unit_price are analysed.
   *
   * Edge cases handled without crash:
   *   - rows.length < 3 → returns { outliers: [], note, disclaimer }
   *   - MAD = 0 (all prices identical) → returns { outliers: [], note, disclaimer }
   *
   * Security (T-03-06): itemCode is always bound as a parameterized `?` inside
   * the repository — never interpolated into the SQL string.
   *
   * @param itemCode - Optional DOT item code to scope the analysis.
   * @returns OutlierResult with labeled outliers and FHWA disclaimer.
   */
  detectOutliers(itemCode?: string): OutlierResult {
    const rows = this.bidItemRepo.selectPricesForOutliers(itemCode);

    this.logger.debug(
      `detectOutliers: ${rows.length} rows${itemCode ? ` for item_code=${itemCode}` : ''}`,
    );

    // T-03-07: rows.length < 3 short-circuits before any math (insufficient data).
    if (rows.length < 3) {
      return {
        outliers: [],
        note: 'Insufficient data for statistical analysis',
        disclaimer: FHWA_DISCLAIMER,
      };
    }

    const prices = rows.map((r) => r.unit_price);
    const scores = modifiedZScores(prices);
    const med = median(prices);

    // T-03-07: MAD = 0 guard — modifiedZScores already returns all-zeros when
    // MAD = 0, so Math.abs(scores[i]) > 3.5 will never be true. Detect this
    // case explicitly to add a descriptive note.
    const allIdentical = prices.every((p) => p === prices[0]);

    const outliers: Outlier[] = [];
    for (let i = 0; i < rows.length; i++) {
      const score = scores[i];
      if (Math.abs(score) > 3.5) {
        // Label assignment (A3): token_bid for score < -3.5, statistical_high for score > +3.5.
        // 'statistical_low' is reserved in the type union but not assigned here —
        // see class-level docblock for the rationale.
        const label: OutlierLabel =
          score > 3.5 ? 'statistical_high' : 'token_bid';

        outliers.push({
          id: rows[i].id,
          description: rows[i].description,
          unitPrice: prices[i],
          modifiedZScore: score,
          label,
        });
      }
    }

    if (allIdentical) {
      return {
        outliers: [],
        median: med,
        note: 'No outliers — all unit prices are identical (zero spread)',
        disclaimer: FHWA_DISCLAIMER,
      };
    }

    return {
      outliers,
      median: med,
      disclaimer: FHWA_DISCLAIMER,
    };
  }

  /**
   * Aggregate total bids per contractor from the typed `bid_items.contractor` column.
   *
   * Reads the typed SQL column directly — no chunk-text KV parsing (ENG-07).
   * NULL-contractor rows are excluded and counted; the note surfaces the skip count
   * so callers know totals are partial and re-upload can fix it (D-08).
   *
   * Optionally scoped to a filename substring for multi-document projects.
   *
   * Security (T-05-01): filenameFilter is always bound as a parameterized `?` with
   * `%...%` inside the repository — never interpolated into the SQL string.
   */
  getContractorTotals(filenameFilter?: string): ContractorTotalsResult {
    // ── Fetch rows with non-null contractor ───────────────────────────────────
    const rows = this.bidItemRepo.getContractorRows(filenameFilter);

    // ── Compute total row count (for NULL-skip note) ───────────────────────────
    const totalRows = this.bidItemRepo.countRows(filenameFilter);

    const rowsWithContractor = rows.length;
    const nullCount = totalRows - rowsWithContractor;

    // ── Aggregate total_price per contractor ──────────────────────────────────
    const totals = new Map<string, { total: number; count: number }>();

    for (const row of rows) {
      // contractor is guaranteed non-null by the WHERE clause in getContractorRows
      const contractor = row.contractor as string;
      // Skip rows where total_price is null — can't contribute to the sum
      if (row.total_price === null) continue;

      const existing = totals.get(contractor) ?? { total: 0, count: 0 };
      totals.set(contractor, {
        total: existing.total + row.total_price,
        count: existing.count + 1,
      });
    }

    // ── NULL-skip note (D-08) ─────────────────────────────────────────────────
    const note =
      nullCount > 0
        ? `${nullCount} rows skipped (no contractor). Re-upload the CSV to get full totals.`
        : undefined;

    if (totals.size === 0) {
      return {
        contractors: [],
        note:
          note ??
          'No contractor data found. Re-upload the CSV to get full totals.',
      };
    }

    const contractors: ContractorTotal[] = [...totals.entries()]
      .map(([contractor, { total, count }]) => ({
        contractor,
        total_bid: Math.round(total * 100) / 100,
        items_found: count,
      }))
      .sort((a, b) => a.total_bid - b.total_bid);

    return { contractors, note };
  }
}
