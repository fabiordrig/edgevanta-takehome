/**
 * smoke-toolrunner.ts — Standalone smoke script for Phase 3 Wave 0.
 *
 * Purpose: De-risk the three highest-uncertainty technical assumptions before
 * any NestJS wiring exists:
 *   A1 — zod/v4 import path resolution (RESEARCH.md Pitfall 1)
 *   A2 — toolRunner streaming iterator shape (nested for-await pattern)
 *   A3 — @Sse()+@Post() decision note (cannot be verified here; documented)
 *
 * Run (with ANTHROPIC_API_KEY set in .env or exported):
 *   pnpm --filter @edgevanta/api exec ts-node scripts/smoke-toolrunner.ts
 *
 * Exits 0 in all cases — missing API key prints a clear message and skips
 * the live API call (T-03-01: key never written to file, never logged).
 *
 * NOT part of the NestJS build — lives under scripts/, excluded from tsconfig include.
 */

// ─── 1. Resolve zod import path (Assumption A1) ───────────────────────────────
// RESEARCH.md Pitfall 1: zod@4.x has both 'zod' (compat shim) and 'zod/v4'
// (native v4 API). betaZodTool expects the v4 API. Try 'zod/v4' first.

let z: typeof import('zod').z;
let zodImportPath: string;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const zodV4 = require('zod/v4') as { z: typeof import('zod').z };
  z = zodV4.z;
  zodImportPath = 'zod/v4';
} catch {
  // Fallback: plain 'zod' re-exports v4 API in zod@4.x
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const zodMain = require('zod') as { z: typeof import('zod').z };
  z = zodMain.z;
  zodImportPath = 'zod';
}

// ─── 2. Import Anthropic SDK ──────────────────────────────────────────────────
import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';

// ─── 3. Read API key (T-03-01: from env only, never logged) ──────────────────
const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
  console.log('');
  console.log('SMOKE SCRIPT — ANTHROPIC_API_KEY not set.');
  console.log(
    'Live streaming test skipped. Set ANTHROPIC_API_KEY to run the full smoke test.',
  );
  console.log('');
  console.log(
    'SDK import shape is still documented below (no API call needed):',
  );
  console.log('  betaZodTool type:', typeof betaZodTool);
  console.log('  Anthropic class:', typeof Anthropic);
  console.log('  z.object type:', typeof z.object);
  console.log('');
  console.log(`SMOKE FINDING: zod import path resolved as '${zodImportPath}'`);
  console.log(
    'SMOKE FINDING: toolRunner iterator shape — live test required (ANTHROPIC_API_KEY missing)',
  );
  console.log(
    "SMOKE FINDING: SSE+POST routing must be verified in Plan 05 controller — default to @Sse('chat') with @Body() and curl POST; fall back to GET+query if body is undefined",
  );
  process.exit(0);
}

// ─── 4. Define echo_tool with betaZodTool ────────────────────────────────────
const echoTool = betaZodTool({
  name: 'echo_tool',
  description:
    'Echoes the provided text back as JSON. Use this whenever asked to echo something.',
  inputSchema: z.object({
    text: z.string().describe('The text to echo back'),
  }),
  run: async ({ text }: { text: string }): Promise<string> => {
    console.log(`  [echo_tool called] text="${text}"`);
    return JSON.stringify({ echoed: text });
  },
});

// ─── 5. Run toolRunner with stream:true ──────────────────────────────────────
async function main(): Promise<void> {
  const client = new Anthropic({ apiKey });

  console.log('');
  console.log('=== smoke-toolrunner.ts — Phase 3 Wave 0 ===');
  console.log(`zod import path: '${zodImportPath}'`);
  console.log('Starting toolRunner with stream:true ...');
  console.log('');

  let tokenBuffer = '';
  let textDeltaEventSeen = false;
  let outerIterations = 0;
  let innerIterations = 0;
  const iteratorShape: string[] = [];

  try {
    // toolRunner with stream:true returns a nested async iterator.
    // Outer loop: each element is a messageStream (one Anthropic API call).
    // Inner loop: each element is a raw SSE event from that call.
    // Source: RESEARCH.md Pattern 2 + tools-helpers-advanced-streaming.ts
    const runner = client.beta.messages.toolRunner({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      max_iterations: 3,
      messages: [
        {
          role: 'user',
          content:
            'Call echo_tool with text "hi", then reply with one sentence.',
        },
      ],
      tools: [echoTool],
      stream: true,
    });

    // Nested iterator pattern — verifies assumption A2
    for await (const messageStream of runner) {
      outerIterations++;
      iteratorShape.push(
        `outer[${outerIterations}]: messageStream type=${typeof messageStream}`,
      );

      for await (const event of messageStream) {
        innerIterations++;

        // Log all event types to document the iterator shape
        if (innerIterations <= 5 || event.type === 'content_block_delta') {
          console.log(`  event[${innerIterations}].type = ${event.type}`);
        }

        if (
          event.type === 'content_block_delta' &&
          'delta' in event &&
          event.delta.type === 'text_delta'
        ) {
          textDeltaEventSeen = true;
          // Token-by-token: write without newline to show progressive arrival
          process.stdout.write(event.delta.text);
          tokenBuffer += event.delta.text;
        }
      }
    }

    if (tokenBuffer.length > 0) {
      console.log('');
      console.log('');
      console.log(`Full assembled response (${tokenBuffer.length} chars):`);
      console.log(tokenBuffer.trim());
    }
  } catch (err) {
    console.error('');
    console.error(
      'toolRunner error:',
      err instanceof Error ? err.message : String(err),
    );
    console.error('');
  }

  // ─── 6. Print smoke findings ─────────────────────────────────────────────
  console.log('');
  console.log('=== SMOKE FINDINGS ===');
  console.log('');
  console.log(
    `SMOKE FINDING: zod import path resolved as '${zodImportPath}' — use this path in all Phase 3 tool schema files`,
  );
  console.log('');

  const iteratorShapeDescription =
    outerIterations > 0
      ? `nested async iterators confirmed — outer loop yielded ${outerIterations} messageStream(s); inner loop yielded ${innerIterations} event(s); text_delta seen=${textDeltaEventSeen}`
      : 'iterator shape could not be confirmed — check error above';

  console.log(
    `SMOKE FINDING: toolRunner iterator shape — ${iteratorShapeDescription}`,
  );
  console.log(
    '  Pattern: for await (const messageStream of runner) { for await (const event of messageStream) { ... } }',
  );
  console.log('  Token-by-token arrival confirmed:', textDeltaEventSeen);
  console.log('');
  console.log(
    "SMOKE FINDING: SSE+POST routing must be verified in Plan 05 controller — default to @Sse('chat') with @Body() and curl POST; fall back to GET+query if body is undefined",
  );
  console.log('');
  console.log('=== smoke-toolrunner.ts COMPLETE ===');
}

main().catch((err: unknown) => {
  console.error(
    'Unhandled error:',
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
