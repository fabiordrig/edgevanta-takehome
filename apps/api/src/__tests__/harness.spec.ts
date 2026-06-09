import aliases from '../ingest/column-aliases.json';

describe('jest harness', () => {
  it('TypeScript compiles and arithmetic works', () => {
    expect(1 + 1).toBe(2);
  });

  it('resolveJsonModule and ts-jest transform work (column-aliases.json)', () => {
    expect(aliases['qty']).toBe('quantity');
  });
});
