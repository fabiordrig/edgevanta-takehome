import { Test, TestingModule } from '@nestjs/testing';
import {
  median,
  modifiedZScores,
  BidAnalysisService,
  ContractorTotalsResult,
} from '../bid-analysis.service';
import {
  BID_ITEM_REPOSITORY,
  IBidItemRepository,
  ContractorRow,
} from '../../database/interfaces/bid-item.repository.interface';

// ─────────────────────────────────────────────────────────────────────────────
// Block 1: Pure functions — no DI (D-09 / Pattern 4)
// ─────────────────────────────────────────────────────────────────────────────

describe('median (pure function)', () => {
  it('returns the middle element for an odd-length array', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('does not mutate the input array', () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });

  it('returns the average of the two middle elements for an even-length array', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('returns the single element for a length-1 array', () => {
    expect(median([42])).toBe(42);
  });

  it('returns NaN/undefined-like for an empty array (guard lives upstream)', () => {
    // The TypeScript signature says number, but the implementation returns
    // sorted[mid] where sorted.length = 0 → sorted[NaN] → undefined per the spec.
    // The actual JS runtime returns NaN (sorted[NaN] === undefined → NaN via arithmetic).
    // Tests document this edge-case behaviour; the guard lives upstream (D-09).
    const result = (median as (v: number[]) => number | undefined)([]);
    // Either undefined or NaN is acceptable — the key behaviour is "not a valid number".
    expect(
      result === undefined || (typeof result === 'number' && isNaN(result)),
    ).toBe(true);
  });
});

describe('modifiedZScores (pure function)', () => {
  it('returns all-zero scores when MAD = 0 (all values identical)', () => {
    expect(modifiedZScores([5, 5, 5])).toEqual([0, 0, 0]);
  });

  it('returns an empty array for empty input (no throw)', () => {
    expect(modifiedZScores([])).toEqual([]);
  });

  it('returns [0] for a single-element array (median === value → MAD = 0 → [0])', () => {
    expect(modifiedZScores([42])).toEqual([0]);
  });

  it('flags the outlier (100) in [1,2,3,4,100] with |score| > 3.5, all others ≤ 3.5', () => {
    // Note: [10,10,10,10,100] cannot be used — median of deviations [0,0,0,0,90] = 0 (MAD=0 guard)
    // Use [1,2,3,4,100]: median=3, deviations=[2,1,0,1,97], MAD=median([0,1,1,2,97])=1
    // score[4] = 0.6745*(100-3)/1 ≈ 65.4 >> 3.5 ✓
    const scores = modifiedZScores([1, 2, 3, 4, 100]);
    // The outlier is at index 4 (value 100)
    expect(Math.abs(scores[4])).toBeGreaterThan(3.5);
    // All other indices must be within the normal range
    [0, 1, 2, 3].forEach((i) => {
      expect(Math.abs(scores[i])).toBeLessThanOrEqual(3.5);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Block 2: getContractorTotals — DI via mocked IBidItemRepository (D-06, D-08)
// ─────────────────────────────────────────────────────────────────────────────

describe('BidAnalysisService.getContractorTotals (DI, mocked IBidItemRepository)', () => {
  let service: BidAnalysisService;
  let module: TestingModule;

  const mockBidItemRepo = {
    getContractorRows: jest.fn<ContractorRow[], [string?]>(),
    countRows: jest.fn<number, [string?]>(),
    // IBidItemRepository has additional methods we do not use here
    selectPricesForOutliers: jest.fn(),
    insertBidItem: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        BidAnalysisService,
        {
          provide: BID_ITEM_REPOSITORY,
          useValue: mockBidItemRepo as unknown as IBidItemRepository,
        },
      ],
    }).compile();

    service = module.get(BidAnalysisService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('happy path: aggregates Acme (150, 2 items) and Beta (200, 1 item) sorted ascending', () => {
    mockBidItemRepo.getContractorRows.mockReturnValue([
      { contractor: 'Acme', total_price: 100 },
      { contractor: 'Acme', total_price: 50 },
      { contractor: 'Beta', total_price: 200 },
    ]);
    mockBidItemRepo.countRows.mockReturnValue(3);

    const result: ContractorTotalsResult = service.getContractorTotals();

    expect(result.contractors).toHaveLength(2);
    // Sorted ascending by total_bid — Acme (150) before Beta (200)
    expect(result.contractors[0].contractor).toBe('Acme');
    expect(result.contractors[0].total_bid).toBe(150);
    expect(result.contractors[0].items_found).toBe(2);
    expect(result.contractors[1].contractor).toBe('Beta');
    expect(result.contractors[1].total_bid).toBe(200);
    expect(result.contractors[1].items_found).toBe(1);
    // No NULL-skip note: countRows (3) === rows.length (3)
    expect(result.note).toBeUndefined();
  });

  it('empty contractor data: returns empty contractors array', () => {
    mockBidItemRepo.getContractorRows.mockReturnValue([]);
    mockBidItemRepo.countRows.mockReturnValue(0);

    const result: ContractorTotalsResult = service.getContractorTotals();

    expect(result.contractors).toEqual([]);
  });

  it('NULL-skip note (D-08): countRows > rows.length → note contains "rows skipped (no contractor)"', () => {
    // 1 row with contractor, but countRows = 3 → 2 rows had NULL contractor
    mockBidItemRepo.getContractorRows.mockReturnValue([
      { contractor: 'Acme', total_price: 100 },
    ]);
    mockBidItemRepo.countRows.mockReturnValue(3);

    const result: ContractorTotalsResult = service.getContractorTotals();

    expect(result.note).toBeDefined();
    expect(result.note).toContain('rows skipped (no contractor)');
  });

  it('filter forwarding: getContractorRows and countRows are both called with the filter', () => {
    mockBidItemRepo.getContractorRows.mockReturnValue([
      { contractor: 'Acme', total_price: 500 },
    ]);
    mockBidItemRepo.countRows.mockReturnValue(1);

    service.getContractorTotals('proj-a');

    expect(mockBidItemRepo.getContractorRows).toHaveBeenCalledWith('proj-a');
    expect(mockBidItemRepo.countRows).toHaveBeenCalledWith('proj-a');
  });
});
