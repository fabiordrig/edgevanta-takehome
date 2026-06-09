# Edgevanta Construction Estimating Agent

An AI agent platform for construction estimating teams. Ingests messy real-world data — DOT bid
tabulation CSVs and scanned PDF plan sets — generates embeddings for semantic search, and answers
natural language questions via a tool-use agent architecture.

## What is this

A question-answering agent over construction project data. You upload a CSV or PDF, the system
embeds it and stores it in a local SQLite vector store, and you ask questions in plain English.
The agent retrieves semantically relevant chunks, runs statistical deviation detection when
relevant, and streams the answer back token-by-token.

**Core value:** the agent must give accurate, grounded answers — and know when it does not have
enough information. Everything else is secondary.

## The Challenge

Construction estimating data is not clean. DOT bid tabulation spreadsheets use inconsistent column
names across states (`contractor`, `bidder`, `company`, `firm`). Scanned plan sets have no text
layer — `pdf-parse` returns empty strings. Bid prices are right-skewed: a single high outlier
inflates the mean and hides real anomalies.

**How this system handles it:**

Column aliases are resolved at ingest time via a configurable mapping so the same tool query works
regardless of the state the CSV came from. When `pdf-parse` extracts less than 50 characters per
page, the system falls back to rendering pages as images and passing them to `gpt-4o-mini` vision.
Deviation detection uses the Modified Z-Score (MAD-based) rather than a plain z-score — MAD is
resistant to the extreme values it is meant to detect.

## Architecture

```
apps/api/      NestJS 11 — ingest, embedding, agent, SQLite + sqlite-vec
apps/web/      Next.js 15 — upload panel + streaming chat UI
packages/types/  Shared TypeScript interfaces (Document, Chunk, BidItem)
```

- **Ingest:** CSV or PDF → `pdf-parse` / `csv-parse` → chunked → `text-embedding-3-small` → `sqlite-vec`
- **Query:** user message → `claude-sonnet-4-6` → tool calls → KNN lookup → streamed answer
- **Streaming:** raw `@Res()` + `res.write()` per token — `@Post` + `@Sse` buffered the Observable
  until completion (NestJS issue), so tokens are written manually to the response stream

## Tech Stack

| Layer         | Choice                               | Reason                                                                     |
| ------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| Runtime       | Node.js 22                           | LTS; explicit NestJS 11 requirement                                        |
| API           | NestJS 11 + Express v5               | Module system maps to tool boundaries; SSE CORS bug rules out Fastify      |
| Frontend      | Next.js 15 + React 19                | App Router Route Handlers handle file upload without body-size limit       |
| LLM           | Claude claude-sonnet-4-6             | Best speed/intelligence for tool-use; `betaZodTool` + `toolRunner` helpers |
| Embeddings    | OpenAI `text-embedding-3-small`      | 1536-dim float32; cost-effective at $0.02/1M tokens                        |
| Vector store  | SQLite + sqlite-vec 0.1.9            | Zero infra; `vec0` virtual tables; native KNN; persists between sessions   |
| SQLite driver | better-sqlite3                       | `sqlite-vec` extension loading fails on arm64 with node:sqlite built-in    |
| PDF extract   | pdf-parse + pdf-to-img + gpt-4o-mini | Text layer first; vision fallback for scanned PDFs with no text            |
| CSV parse     | csv-parse                            | Node.js stream API; handles messy column names                             |
| Schema        | Zod 4 + betaZodTool                  | Single validation layer for API DTOs and agent tool inputs                 |
| Monorepo      | Turborepo + pnpm workspaces          | Incremental caching; `^build` dependency graph                             |

## Prerequisites

- Node.js 22+
- pnpm 9+
- Anthropic API key — [console.anthropic.com](https://console.anthropic.com/)
- OpenAI API key — [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

## Setup

```bash
git clone <repo-url>
cd edgevanta-takehome
make setup
```

`make setup` installs all dependencies and creates `.env` from `.env.example`. Open `.env` and
fill in the two required keys:

```
ANTHROPIC_API_KEY=<your key>
OPENAI_API_KEY=<your key>
```

Then start both apps:

```bash
make dev
```

Open [http://localhost:3000](http://localhost:3000).

## Try it

Open [http://localhost:3000](http://localhost:3000) after `make dev`.

- **Upload panel (left):** drag and drop a CSV or PDF onto the drop zone. The file is embedded and
  stored. A success toast appears and the document list refreshes.
- **Chat panel (right):** ask a question. The agent retrieves relevant chunks, runs deviation
  detection if relevant, and streams the answer back token-by-token.

### Or via curl

```bash
# Ingest a CSV
curl -X POST http://localhost:3001/ingest \
  -F "file=@/path/to/bid-tabulation.csv"

# Ask a question (SSE stream — watch tokens arrive)
curl -X POST http://localhost:3001/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Which contractor had the lowest total bid?"}]}'

# List ingested documents
curl http://localhost:3001/agent/documents | jq '.documents'

# Health check
curl http://localhost:3001/health | jq
```

## Agent tools

| Tool                    | Purpose                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `search_documents`      | Semantic KNN search over embedded chunks                                            |
| `detect_outliers`       | Modified z-score (MAD-based) deviation detection on bid item unit prices            |
| `list_documents`        | List all ingested documents with metadata                                           |
| `get_contractor_totals` | Aggregate total bids per contractor. Use for lowest bidder / bid ranking questions. |

## Make targets

| Target           | Description                                   |
| ---------------- | --------------------------------------------- |
| `make setup`     | Install deps + copy `.env.example` → `.env`   |
| `make dev`       | Run API + web in parallel (Turborepo)         |
| `make api`       | Run only the NestJS API (port 3001)           |
| `make web`       | Run only the Next.js frontend (port 3000)     |
| `make build`     | Build all packages                            |
| `make typecheck` | TypeScript compiler check across all packages |
| `make lint`      | ESLint across all packages                    |
| `make format`    | Prettier across all files                     |
| `make test`      | Run unit tests (32 tests)                     |
| `make test-e2e`  | Run E2E tests                                 |
| `make test-all`  | Run unit + E2E tests                          |
| `make clean`     | Remove build artifacts and caches             |

## Environment variables

| Variable              | Required | Default                       | Description                                 |
| --------------------- | -------- | ----------------------------- | ------------------------------------------- |
| `ANTHROPIC_API_KEY`   | Yes      | —                             | Claude API key for the agent                |
| `OPENAI_API_KEY`      | Yes      | —                             | OpenAI key for embeddings + vision fallback |
| `PORT`                | No       | `3001`                        | NestJS server port                          |
| `DB_PATH`             | No       | `apps/api/db/database.sqlite` | SQLite file path                            |
| `CORS_ORIGIN`         | No       | `http://localhost:3000`       | Allowed CORS origin                         |
| `NEXT_PUBLIC_API_URL` | No       | `http://localhost:3001`       | URL the browser uses to reach the API       |

> Never prefix `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` with `NEXT_PUBLIC_` — those are
> server-side secrets and must not be inlined into the client bundle.

## Key Decisions

| Decision            | Choice                               | Why not the alternative                                                                                                 |
| ------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Vector store        | sqlite-vec                           | pgvector requires Postgres; Pinecone requires a paid account — both break the 5-minute setup                            |
| SQLite driver       | better-sqlite3                       | `node:sqlite` (Node 22 built-in) is compiled with `OMIT_LOAD_EXTENSION` on arm64 macOS — sqlite-vec cannot load         |
| Agent tool loop     | `betaZodTool` + `toolRunner`         | Manual `tool_use` loop requires precise `tool_result` content block shapes; wrong shape returns HTTP 400 silently       |
| Deviation detection | Modified Z-Score (MAD)               | Plain z-score is sensitive to the outliers it is meant to detect; MAD is resistant                                      |
| PDF extraction      | pdf-parse + pdf-to-img + gpt-4o-mini | OCR tools (pdftotext, Tesseract) require system installs; `pdf-img-convert` has a hard `pangocairo` dependency on arm64 |
| HTTP adapter        | Express (not Fastify)                | Fastify SSE CORS bug #8717: browser rejects `text/event-stream` preflight before first token                            |
| SSE implementation  | `@Res()` + `res.write()`             | `@Post` + `@Sse` + Observable buffers all tokens until the stream ends — nothing arrives until `end_turn`               |

## How I'd Evaluate This Agent

Four measurable dimensions, each with a concrete metric and a measurement approach:

1. **Grounding rate** — percentage of responses that cite a source filename. A response without a
   `filename:` citation may be hallucinating. _Measurement:_ automated test against a known-answer
   corpus; the evaluator checks that every factual claim maps to a retrieved chunk.

2. **Refusal precision / recall** — distinguishes false positives (agent refuses when relevant data
   exists) from false negatives (agent answers without grounding). _Measurement:_ precision and
   recall computed over a hand-labeled eval set of questions with known "answerable / unanswerable"
   ground truth.

3. **Retrieval quality (MRR / Recall@k)** — does the correct chunk appear in the top-k results?
   _Measurement:_ MRR or Recall@5 over a hold-out query set where each query has at least one
   known-relevant chunk; computed offline by probing the `search_documents` tool.

4. **Outlier detection accuracy** — does `detect_outliers` flag the right bid items?
   _Measurement:_ precision and recall of the MAD-based tool against a synthetic dataset with
   planted outliers. Concrete example: `SR-89-bid-tabulation.csv` contains 2 deliberately-planted
   outlier unit prices; a passing run must flag exactly those two items.

**Tooling note:** Grounding rate is well-suited to LLM-as-judge scoring; retrieval relevance needs
a manual label set; outlier accuracy uses synthetic datasets with known ground truth.

## Future Work

| Item                                                         | Why deferred                                                                                        | Expected impact                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Reranking step (KNN → cross-encoder before context assembly) | Standard KNN is sufficient for the demo corpus; a cross-encoder adds a model dependency and latency | +10–30% retrieval precision on large or ambiguous corpora      |
| IQR cross-validation alongside MAD                           | MAD alone is robust enough for current bid datasets                                                 | Reduces false positives on small samples where MAD is unstable |
| Page-count cap for vision fallback on large PDFs (>50 pages) | Demo PDFs are small; no runaway-cost risk in the current eval environment                           | Prevents unbounded vision API spend on large scanned plan sets |
| Similarity score threshold for refusal                       | Prompt-only refusal rule works for the demo; threshold tuning requires a labeled eval set           | Grounded, score-based refusals instead of a prompt heuristic   |
| CSV alias map as a configurable table (not hardcoded JSON)   | Hardcoded aliases cover the known DOT column formats                                                | Evaluators can add column mappings without a code change       |

## Known Limitations

- **No authentication** — single-user local demo. Adding auth (e.g. OIDC) is straightforward but out of scope for this evaluation.
- **Prompt injection via uploaded file** — malicious content embedded in a CSV or PDF could influence agent reasoning. Known, deliberately-deferred risk for a local-only demo with no multi-tenant surface.
- **Single-node SSE** — real-time streaming works on a single process. Horizontal scaling would require a Redis pub/sub fan-out layer.
- **No sample data included** — upload your own DOT bid tabulation CSV or scanned PDF. The agent is designed around publicly available state DOT bid tab formats.
