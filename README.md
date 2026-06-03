# Edgevanta Construction Estimating Agent

AI agent platform for construction estimating teams. Ingests messy real-world data — DOT bid tabulation CSVs and scanned PDF plan sets — generates embeddings for semantic search, and answers natural language questions via a tool-use agent architecture. Designed to demonstrate grounded answers, statistical deviation detection, and graceful handling of dirty inputs.

**Core value:** The agent must give accurate, grounded answers — and know when it does not have enough information. Everything else is secondary.

---

## Prerequisites

| Requirement | Version | Where to get it |
|-------------|---------|-----------------|
| Node.js | 22 LTS | https://nodejs.org/en/download |
| pnpm | 9+ | `npm install -g pnpm` |
| make | built-in | macOS/Linux: already installed |
| Anthropic API key | — | https://console.anthropic.com/ |
| OpenAI API key | — | https://platform.openai.com/api-keys |

---

## Quick start

```bash
git clone <repo-url>
cd edgevanta-takehome
make setup
```

`make setup` installs all dependencies and creates `.env` from `.env.example`. Open `.env` and fill in the two required keys:

```
ANTHROPIC_API_KEY=<your key from console.anthropic.com>
OPENAI_API_KEY=<your key from platform.openai.com/api-keys>
```

Then start both apps:

```bash
make dev
```

Open http://localhost:3000.

---

## Available commands

```
make setup      First-time setup: install deps and copy .env.example → .env
make dev        Run API + web in parallel (Turborepo)
make build      Build all packages
make api        Run only the NestJS API (port 3001)
make web        Run only the Next.js web app (port 3000)
make typecheck  TypeScript compiler check across all packages
make clean      Remove build artifacts and caches
make help       Show all commands
```

---

## Environment variables

All variables live in a single `.env` at the repo root (gitignored). The file is read by NestJS at startup; `NEXT_PUBLIC_API_URL` is inlined into the Next.js client bundle at build time.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | — | Claude API key for the agent |
| `OPENAI_API_KEY` | Yes | — | OpenAI key for embeddings + vision fallback |
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:3001` | URL the browser uses to reach the API |
| `PORT` | No | `3001` | NestJS server port |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Allowed CORS origin |
| `DB_PATH` | No | `apps/api/db/database.sqlite` | SQLite file path |

> Never prefix `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` with `NEXT_PUBLIC_` — those are server-side secrets and must not be inlined into the client bundle.

---

## How it works

The UI is a single-page split layout:

- **Left panel (~30%):** drag and drop a CSV or PDF onto the drop zone (or click Browse Files). The file is POSTed to `/api/ingest`, embedded via `text-embedding-3-small`, and stored in SQLite + sqlite-vec. A success toast fires and the document list refreshes.
- **Right panel (~70%):** ask a question in the chat textarea. The agent retrieves semantically similar chunks, runs deviation detection if relevant, and streams the answer back token-by-token via SSE. Full conversation history is maintained for multi-turn dialogue.

**End-to-end pipeline:**

```
upload CSV/PDF  →  /api/ingest  →  pdf-parse / csv-parse  →  OpenAI embedding  →  sqlite-vec store
                                                                                         |
ask question  →  /api/agent/chat  →  claude-sonnet-4-6  →  tool calls  →  KNN lookup  →  answer (SSE)
```

---

## Architecture

### Monorepo layout

```
apps/api/          NestJS 11 — ingest, embedding, agent, SQLite
apps/web/          Next.js 15 — upload panel + streaming chat UI
packages/types/    Shared TypeScript interfaces (Document, Chunk, BidItem)
```

### Agent tools

| Tool | Purpose |
|------|---------|
| `search_documents` | Semantic KNN search over embedded chunks |
| `detect_outliers` | Modified z-score (MAD-based) deviation detection on bid item unit prices |
| `list_documents` | List all ingested documents with metadata |

---

## Key Decisions & Tradeoffs

### 1. sqlite-vec over pgvector / Pinecone

**Decision:** SQLite as the vector store via the `sqlite-vec` extension (`vec0` virtual tables, native KNN via `MATCH`).

**Rationale:** Local-first, zero infrastructure. An evaluator must be able to `git clone` + `make setup` + `make dev` with no external services. `better-sqlite3` + `sqlite-vec` persists between sessions and costs nothing to run.

**Rejected:** pgvector requires a running Postgres instance; Pinecone requires a paid account. Both break the 5-minute setup constraint. `sqlite-vss` was the predecessor — sqlite-vec is its maintained successor.

---

### 2. better-sqlite3 over node:sqlite (Node 22 built-in)

**Decision:** `better-sqlite3` (v12) as the SQLite driver rather than the `node:sqlite` built-in that ships with Node 22.

**Rationale:** `sqlite-vec`'s `sqliteVec.load(db)` explicitly supports `better-sqlite3` through its extension-loading API. On macOS arm64, `node:sqlite` is compiled with `OMIT_LOAD_EXTENSION`, which means `sqlite-vec` cannot be loaded — making vector search impossible.

**Rejected:** `node:sqlite` — extension loading disabled on arm64 macOS at compile time.

---

### 3. betaZodTool + toolRunner over a manual tool_use loop

**Decision:** Use `@anthropic-ai/sdk`'s `betaZodTool` helper and `toolRunner` to define and execute agent tools, rather than manually parsing `tool_use` content blocks and assembling `tool_result` messages.

**Rationale:** `toolRunner` handles the full multi-turn tool loop automatically — schema serialization from Zod, `tool_result` message construction, and the `end_turn` stop condition. Manual implementation is error-prone: malformed `tool_result` messages return HTTP 400, and the stop condition must be tracked explicitly. Zod schemas serve both the SDK tool definitions and runtime input validation.

**Rejected:** Manual `tool_use` loop — every project that implements it from scratch hits the HTTP 400 pitfall (wrong content block shape for `tool_result`).

---

### 4. Modified Z-Score (MAD-based) over plain z-score for deviation detection

**Decision:** Modified z-score (`|0.6745 * (x - median) / MAD|`) rather than classical z-score (`|(x - mean) / stddev|`).

**Rationale:** Construction bid data is right-skewed — a few very high unit prices inflate both the mean and standard deviation, masking genuine outliers. MAD (Median Absolute Deviation) is resistant to extreme values. The 0.6745 scaling factor makes the modified z-score directly comparable to the classical threshold (3.5).

**Rejected:** Plain z-score — sensitive to the outliers it is meant to detect.

---

### 5. pdf-parse + OpenAI Vision fallback over OCR-only

**Decision:** Primary extraction uses `pdf-parse` (text layer). When extracted text is below a threshold (~50 chars/page), fall back to rendering pages as images via `pdf-to-img@6.1.0` and sending them to `gpt-4o-mini` vision.

**Rationale:** Scanned plan sets have no text layer — `pdf-parse` returns empty strings. The vision fallback handles those cases without system dependencies (no Ghostscript, no ImageMagick). `pdf-to-img@6.1.0` ships pre-compiled darwin-arm64 binaries.

**Substitution note:** The plan originally specified `pdf-img-convert@2.0.0`. All versions declare `canvas` as a hard dependency requiring `pangocairo`, which is not available on macOS arm64 without Homebrew. `pdf-to-img@6.1.0` was substituted.

**Rejected:** OCR-only (pdftotext, Tesseract) — requires system installs that break the 5-minute setup constraint.

---

### 6. NestJS Express adapter over Fastify

**Decision:** Keep NestJS on its default Express (v5) adapter.

**Rationale:** There is a confirmed bug (#8717) where Fastify's SSE implementation mishandles CORS preflight for the `text/event-stream` content type, causing browsers to reject the stream before the first token arrives. Express handles SSE CORS correctly.

**Rejected:** Fastify — SSE CORS bug #8717 confirmed, fix not merged.

---

### 7. SSE (fetch + ReadableStream) over WebSockets

**Decision:** Server-Sent Events for streaming agent responses. The client uses `fetch` + `response.body.getReader()`, not the native `EventSource` API.

**Rationale:** SSE is simpler than WebSockets for unidirectional token streaming — no upgrade handshake, no framing protocol, no client library required. The native `EventSource` API was ruled out because it only supports GET; the chat endpoint requires a POST body containing the full conversation history (`MessageParam[]`).

**Rejected:** WebSockets — bidirectional, heavier protocol; overkill for streaming-only. Native `EventSource` — GET-only, incompatible with POST body requirement.

---

### 8. Tool-use agent architecture (each capability = typed tool)

**Decision:** Each agent capability is an explicit, typed tool with a Zod input schema: `search_documents`, `detect_outliers`, `list_documents`.

**Rationale:** Structured tool calls produce verifiable, loggable, grounded answers — the agent can only cite information it actually retrieved. A mega-prompt approach produces fluent but ungrounded responses that hallucinate bid prices and unit costs.

**Rejected:** Single mega-prompt with context injection — no tool-call audit trail, no structured refusal when data is absent.

---

## Accepted risks (demo scope)

- **No authentication:** Single-user local demo. Adding auth is straightforward but out of scope for this evaluation.
- **Prompt injection via uploaded file:** Malicious content embedded in a CSV or PDF could influence the agent's reasoning. Known, deliberately-deferred risk for a local-only demo with no multi-tenant surface.
