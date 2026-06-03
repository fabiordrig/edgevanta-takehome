import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod/v4';
import { VectorSearchService } from './vector-search.service';
import { BidAnalysisService } from './bid-analysis.service';
import { DocumentsService } from './documents.service';

/**
 * Dependencies injected into the tool factory via closure.
 */
export interface AgentToolDeps {
  vectorSearch: VectorSearchService;
  bidAnalysis: BidAnalysisService;
  documents: DocumentsService;
}

/**
 * buildAgentTools — factory that closes over injected services and returns
 * the three betaZodTool definitions for the agent loop (AGT-02/03/04, AGT-06).
 *
 * All run() handlers return JSON.stringify(result) — never a raw object.
 * Returning a raw object is the documented anti-pattern for betaZodTool.
 *
 * Tool definitions:
 *   1. search_documents  — semantic KNN search via VectorSearchService
 *   2. detect_outliers   — MAD-based outlier detection via BidAnalysisService
 *   3. list_documents    — document listing via DocumentsService
 */
export function buildAgentTools(deps: AgentToolDeps) {
  const searchDocumentsTool = betaZodTool({
    name: 'search_documents',
    description:
      'Semantic search over ingested CSV and PDF documents. Returns top-k matching chunks with source filename and metadata. Always call this before answering questions about specific items, prices, or quantities.',
    inputSchema: z.object({
      query: z.string().describe('Natural language search query'),
      k: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(5)
        .describe('Number of results to return'),
    }),
    run: async ({ query, k }) =>
      JSON.stringify(await deps.vectorSearch.knn(query, k)),
  });

  const detectOutliersTool = betaZodTool({
    name: 'detect_outliers',
    description:
      'Detect statistical outliers in bid item unit prices using Modified Z-Score (MAD-based, threshold 3.5). Returns labeled outliers (token_bid / statistical_high / statistical_low) with an FHWA disclaimer. Optionally scope to one item_code.',
    inputSchema: z.object({
      itemCode: z
        .string()
        .optional()
        .describe('Optional DOT item code to scope the analysis'),
    }),
    run: async ({ itemCode }) =>
      JSON.stringify(deps.bidAnalysis.detectOutliers(itemCode)),
  });

  const listDocumentsTool = betaZodTool({
    name: 'list_documents',
    description:
      'List all ingested documents with metadata (filename, type, parse log). Use to report what data has been uploaded.',
    inputSchema: z.object({}),
    run: async () => JSON.stringify(deps.documents.list()),
  });

  const getContractorTotalsTool = betaZodTool({
    name: 'get_contractor_totals',
    description:
      'Aggregate total bids per contractor by summing total_price across all ingested CSV rows. Returns contractors sorted by total bid ascending. Use for questions about overall bid rankings, lowest/highest bidder, or total project cost per contractor.',
    inputSchema: z.object({
      filenameFilter: z
        .string()
        .optional()
        .describe('Optional filename substring to scope to a specific document'),
    }),
    run: async ({ filenameFilter }) =>
      JSON.stringify(deps.bidAnalysis.getContractorTotals(filenameFilter)),
  });

  return [searchDocumentsTool, detectOutliersTool, listDocumentsTool, getContractorTotalsTool];
}
