import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { Subject, Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { VectorSearchService } from './vector-search.service';
import { BidAnalysisService } from './bid-analysis.service';
import { DocumentsService } from './documents.service';
import { buildAgentTools } from './agent.tools';

/**
 * Pinned model ID — single source of truth (never hardcode at call sites).
 * Confirmed current stable model per platform.claude.com/docs/en/about-claude/models/overview.
 */
const MODEL = 'claude-sonnet-4-6';

/**
 * Maximum tokens for the assistant response (Pitfall 6).
 * Bounds output without restricting context window; sufficient for detailed
 * construction estimating answers including tool results.
 */
const MAX_TOKENS = 4096;

/**
 * Maximum agentic loop iterations before toolRunner halts (Pitfall 6 / T-03-11).
 * Prevents runaway loops from exhausting API credits.
 */
const MAX_ITERATIONS = 10;

/**
 * System prompt for the construction estimating agent (AGT-05, Pattern 5).
 *
 * Rules enforce:
 *   1. Tool-first: always call search_documents before factual answers (AGT-01)
 *   2. Grounded answers: cite source filename for every factual claim (AGT-01)
 *   3. Explicit refusal: exact string required by acceptance criteria (AGT-05)
 *   4. No fabrication: never invent prices, quantities, or item codes (AGT-05)
 *   5. Statistical questions: use detect_outliers (AGT-03)
 */
const SYSTEM_PROMPT = `You are a construction estimating assistant for DOT bid tabulation data.

You have access to four tools:
- search_documents: semantic search over ingested CSV and PDF data. Returns top-k matching chunks with source filename and metadata.
- detect_outliers: statistical outlier detection on bid item unit prices using Modified Z-Score (MAD-based, threshold 3.5). Returns labeled outliers (token_bid / statistical_high / statistical_low) with an FHWA disclaimer.
- get_contractor_totals: aggregate total bids per contractor. Use this for questions about overall bid rankings, lowest/highest bidder, or total project cost per contractor. Do NOT use search_documents for aggregation questions.
- list_documents: list all ingested documents with metadata (filename, type, parse log).

Rules:
1. Always call search_documents before answering questions about specific items, prices, or quantities.
2. Ground every factual claim in retrieved chunk content. Cite the source filename for each piece of information you use.
3. If retrieved context does not contain enough information to answer accurately, respond with exactly: "I don't have enough information in the ingested documents to answer this question accurately." followed by an explanation of what was searched and what was missing.
4. Never fabricate prices, quantities, or item codes not found in the retrieved chunks.
5. For statistical questions about pricing patterns or unusual bids, use detect_outliers.
6. If asked what documents are available, use list_documents.
7. For questions about total bids per contractor, lowest bidder, or bid rankings, use get_contractor_totals — never loop with search_documents for aggregation.
8. Never use filler, pleasantries, or preamble. No "Sure!", "Of course!", "Is there anything else?", or similar. Start responses directly with the answer.`;

/**
 * AgentService — drives the full tool-use loop via betaZodTool + toolRunner (AGT-06).
 *
 * Accepts a full MessageParam[] history each call (AGT-07 multi-turn) and
 * returns an Observable<MessageEvent> that emits token-by-token text deltas
 * progressively, then a done event when the final assistant turn completes.
 *
 * Streaming bridge:
 *   - Per-request Subject<MessageEvent> — never a shared global (anti-pattern)
 *   - AbortController passed to toolRunner; finalize() aborts on unsubscribe
 *     (Pitfall 3 / T-03-11: stops upstream Anthropic consumption on disconnect)
 *
 * No manual tool_use loop — toolRunner handles all stop_reason logic (AGT-06).
 * ANTHROPIC_API_KEY guarded in constructor (T-03-10 / mirrors EmbeddingService pattern).
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly client: Anthropic;

  constructor(
    private readonly vectorSearch: VectorSearchService,
    private readonly bidAnalysis: BidAnalysisService,
    private readonly documents: DocumentsService,
  ) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Stream a grounded agent response for the given conversation history.
   *
   * @param messages - Full MessageParam[] history (user + assistant turns).
   *                   The controller in Plan 05 maps ChatMessage[] → MessageParam[].
   * @returns Observable<MessageEvent> emitting:
   *   - { data: { token: string } } for each text-delta token
   *   - { data: { done: true } } after the final assistant turn
   *   Completes when the assistant turn finishes or errors on Anthropic API failure.
   */
  stream(messages: MessageParam[]): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();
    const controller = new AbortController();

    const tools = buildAgentTools({
      vectorSearch: this.vectorSearch,
      bidAnalysis: this.bidAnalysis,
      documents: this.documents,
    });

    // Fire-and-forget async IIFE — bridges the nested toolRunner async iterator
    // into the RxJS Subject without blocking the synchronous return.
    // Iterator shape confirmed in 03-01-SUMMARY.md (A2):
    //   outer: for await (const messageStream of runner)
    //   inner: for await (const event of messageStream)
    (async () => {
      try {
        const runner = this.client.beta.messages.toolRunner(
          {
            model: MODEL,
            max_tokens: MAX_TOKENS,
            max_iterations: MAX_ITERATIONS,
            system: SYSTEM_PROMPT,
            messages,
            tools,
            stream: true,
          },
          { signal: controller.signal },
        );

        let turn = 0;
        for await (const messageStream of runner) {
          turn++;
          this.logger.debug(`toolRunner turn ${turn} starting`);
          let tokenCount = 0;
          for await (const event of messageStream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              tokenCount++;
              subject.next({ data: { token: event.delta.text } });
            }
          }
          this.logger.debug(`toolRunner turn ${turn} done — ${tokenCount} tokens emitted`);
        }

        this.logger.debug('toolRunner complete — emitting done');
        subject.next({ data: { done: true } });
      } catch (err) {
        this.logger.error('AgentService stream error', err);
        subject.error(err);
      } finally {
        subject.complete();
      }
    })();

    // finalize() runs on unsubscribe (client disconnect) — aborts the upstream
    // Anthropic API call to stop token consumption (Pitfall 3 / T-03-11).
    return subject.asObservable().pipe(finalize(() => controller.abort()));
  }
}
