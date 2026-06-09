/**
 * column-aliases.spec.ts — alias map round-trip + canonical closure tests.
 *
 * Regression contract: any future typo in column-aliases.json (e.g., target
 * "unit_pricee") will fail the "every alias value is canonical" assertion.
 *
 * No DI, no services, no env — imports the JSON directly.
 */
import columnAliases from '../../ingest/column-aliases.json';

// ── Canonical target names (closed set — D-06) ─────────────────────────────
const CANONICAL = new Set([
  'item_code',
  'description',
  'unit',
  'quantity',
  'unit_price',
  'total_price',
  // Note: 'contractor' IS in column-aliases.json but is an extended canonical
  // that the ingest service resolves via the alias map. We include it in the
  // closure check only to confirm it exists in values.
]);

// Full set including contractor (present in the alias file)
const CANONICAL_WITH_CONTRACTOR = new Set([
  'item_code',
  'description',
  'unit',
  'quantity',
  'unit_price',
  'total_price',
  'contractor',
]);

describe('column-aliases.json — every alias value is a known canonical', () => {
  it('all alias values belong to the extended canonical set (no typos)', () => {
    for (const [key, canonical] of Object.entries(columnAliases)) {
      if (!CANONICAL_WITH_CONTRACTOR.has(canonical)) {
        throw new Error(
          `Alias "${key}" maps to unknown canonical "${canonical}"`,
        );
      }
    }
  });
});

describe('column-aliases.json — named DOT aliases resolve correctly', () => {
  it('item_no → item_code', () => {
    expect((columnAliases as Record<string, string>)['item_no']).toBe(
      'item_code',
    );
  });

  it('qty → quantity', () => {
    expect((columnAliases as Record<string, string>)['qty']).toBe('quantity');
  });

  it('unit_price → unit_price (self-alias for explicit mapping)', () => {
    expect((columnAliases as Record<string, string>)['unit_price']).toBe(
      'unit_price',
    );
  });

  it('bid_total_amount → total_price', () => {
    expect((columnAliases as Record<string, string>)['bid_total_amount']).toBe(
      'total_price',
    );
  });

  it('desc → description', () => {
    expect((columnAliases as Record<string, string>)['desc']).toBe(
      'description',
    );
  });

  it('uom → unit', () => {
    expect((columnAliases as Record<string, string>)['uom']).toBe('unit');
  });
});

describe('column-aliases.json — canonical coverage + key normalization', () => {
  it('all 6 core canonical names appear as target values', () => {
    const values = Object.values(columnAliases);
    for (const canonical of CANONICAL) {
      expect(values).toContain(canonical);
    }
  });

  it('no alias key contains a space or uppercase letter (normalized form)', () => {
    for (const key of Object.keys(columnAliases)) {
      // Keys must match: lowercase letters, digits, underscores, and # (for "bid_item_#")
      if (!/^[a-z0-9_#]+$/.test(key)) {
        throw new Error(`Key "${key}" contains space or uppercase`);
      }
    }
  });
});
