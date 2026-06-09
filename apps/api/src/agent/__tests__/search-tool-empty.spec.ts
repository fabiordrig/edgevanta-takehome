/**
 * search-tool-empty.spec.ts — KNN-empty error path (TST-03 / D-07).
 *
 * Verifies the offline-verifiable portion of the empty-retrieval contract:
 *   (a) When knn() resolves [], the search_documents tool result is an empty array.
 *   (b) The exact refusal string is present in the agent's SYSTEM_PROMPT.
 *
 * No network calls, no ANTHROPIC_API_KEY, no agent loop execution.
 *
 * D-07: LLM verbatim refusal is not offline-verifiable (RESEARCH Open Q3);
 * we assert (a) empty KNN reaches the agent and (b) the exact refusal string
 * is present in SYSTEM_PROMPT.
 *
 * T-07-06: Guards the grounded-answer contract — empty retrieval must not
 * silently allow fabricated answers.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildAgentTools, AgentToolDeps } from '../agent.tools';

// ── Block 1: Empty KNN reaches the search_documents tool result ───────────

describe('search_documents tool — KNN-empty path (D-07 offline portion)', () => {
  it('search_documents.run() returns a JSON-parsed empty array when knn resolves []', async () => {
    const knn = jest.fn().mockResolvedValue([]);
    const deps = {
      vectorSearch: { knn },
      bidAnalysis: {},
      documents: {},
    } as unknown as AgentToolDeps;

    const tools = buildAgentTools(deps);
    const searchTool = tools.find((t) => t.name === 'search_documents');

    // Confirm the tool exists in the returned array
    expect(searchTool).toBeDefined();

    // Invoke the tool's run handler directly (betaZodTool exposes .run).
    // Cast is required because the run signature is the intersection of all tool
    // input types and the return is a union — we know this is the search tool.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (await (searchTool as any).run({
      query: 'cost of asphalt',
      k: 5,
    })) as string;

    // knn must have been called with the forwarded query and k
    expect(knn).toHaveBeenCalledWith('cost of asphalt', 5);

    // The tool result must be a JSON string that parses to an empty array
    const parsed: unknown = JSON.parse(raw);
    expect(Array.isArray(parsed)).toBe(true);
    expect((parsed as unknown[]).length).toBe(0);
  });
});

// ── Block 2: Refusal-string contract (static — no LLM call) ──────────────

describe('AgentService SYSTEM_PROMPT — refusal-string contract (D-07 static check)', () => {
  it('SYSTEM_PROMPT contains the exact refusal string required by D-07', () => {
    // D-07: LLM verbatim refusal is not offline-verifiable (RESEARCH Open Q3);
    // we assert the exact refusal string is present in SYSTEM_PROMPT so that a
    // regression that softens or removes this string is caught at test time.
    const agentServiceSrc = readFileSync(
      join(__dirname, '../agent.service.ts'),
      'utf8',
    );

    expect(agentServiceSrc).toContain(
      "I don't have enough information in the ingested documents to answer this question accurately.",
    );
  });
});
