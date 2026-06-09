# Roadmap: Edgevanta Construction Estimating Agent

## Overview

Four phases following the hard technical dependency chain: schema before parsers, parsers before agent, agent correctness before streaming, upload UI and README last. Each phase delivers one independently verifiable layer. The primary evaluator artifact — a tool-use agent that gives grounded, statistically rigorous answers — is the target of phases 1-3. Phase 4 wraps the delivery with the frontend and README that make the whole system accessible.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Turborepo monorepo, SQLite schema, sqlite-vec health check, shared types (completed 2026-06-03)
- [x] **Phase 2: Ingestion Pipeline** - CSV parse + PDF extract + chunking + embedding + vector store write path (completed 2026-06-03)
- [x] **Phase 3: Agent Core + Streaming** - Tool-use agent loop, deviation detection, SSE streaming API (completed 2026-06-03)
- [x] **Phase 4: Frontend + Polish** - Upload UI, streaming chat UI, README with Key Decisions (completed 2026-06-03)

## Phase Details

### Phase 1: Foundation

**Goal**: A working monorepo where all apps compile, the SQLite database initializes with all required tables, sqlite-vec loads and passes its health check, and the shared TypeScript types are available across packages
**Depends on**: Nothing (first phase)
**Requirements**: EMB-01, EMB-02, EMB-03, EMB-04, EMB-05
**Success Criteria** (what must be TRUE):

  1. `pnpm dev` starts both the NestJS backend and Next.js frontend without errors
  2. `SELECT vec_version()` returns successfully on backend startup (sqlite-vec extension loaded via better-sqlite3)
  3. SQLite database file exists on disk with chunks, vec_chunks (vec0 virtual table), and bid_items tables created
  4. EMBEDDING_DIM constant (1536) is used in both DDL and call site — no hardcoded dimension values
  5. Shared TypeScript interfaces from packages/types compile and are importable in both apps

**Plans**: 3 plans (2 waves)Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Monorepo foundation (Turborepo + pnpm workspace) + @edgevanta/types shared package (Chunk, BidItem, Document, EMBEDDING_DIM)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — NestJS Express API + global DatabaseModule: sqlite-vec load, 001_init.sql DDL (chunks/vec_chunks/bid_items), vec_version() health check, .env.example
- [x] 01-03-PLAN.md — Next.js 15 App Router scaffold with transpilePackages, placeholder shell importing @edgevanta/types

### Phase 2: Ingestion Pipeline

**Goal**: Users can upload CSV and PDF files and have them parsed, chunked, embedded, and stored — with a parse log surfaced for every document
**Depends on**: Phase 1
**Requirements**: INF-01, INF-02, INF-03, INF-04, INF-05, INF-06
**Success Criteria** (what must be TRUE):

  1. POST /ingest accepts a CSV file, normalizes headers to lowercase_underscore, strips commas from numeric fields, and populates bid_items rows
  2. POST /ingest accepts a PDF file, extracts text via pdf-parse, and falls back to OpenAI Vision when avgCharsPerPage < 50
  3. Both CSV and PDF ingest paths produce chunks stored in the chunks table with rowid-aligned embeddings in vec_chunks
  4. Every ingest response includes a parse log: columns mapped, rows skipped, fallback triggered
  5. Embeddings stored are 1536-dimensional float32 vectors retrievable via KNN query

**Plans**: 5 plans (3 waves)

**Wave 1** *(parallel — no dependencies)*

- [x] 02-01-PLAN.md — documents DDL in 001_init.sql + ParseLog/Document types in @edgevanta/types + column-aliases.json
- [x] 02-02-PLAN.md — Package install: slopcheck gate for pdf-img-convert [SUS], then install all new ingestion deps

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-03-PLAN.md — EmbeddingService (OpenAI text-embedding-3-small, batch 100, EMBEDDING_DIM assert) + CsvIngestService (csv-parse, alias map, dual-write chunks+vec_chunks+bid_items, parse log)
- [x] 02-04-PLAN.md — PdfIngestService (pdf-parse, vision fallback at avgCharsPerPage < 50, paragraph chunking, dual-write)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-05-PLAN.md — IngestModule + IngestService dispatch + IngestController (POST /ingest, 50 MB limit, MIME+ext allowlist) + AppModule registration + e2e smoke test

### Phase 3: Agent Core + Streaming

**Goal**: The agent answers natural language questions over ingested data using tool-use architecture, detects statistical outliers with named types and FHWA disclaimer, refuses when context is insufficient, and streams responses over SSE
**Depends on**: Phase 2
**Requirements**: AGT-01, AGT-02, AGT-03, AGT-04, AGT-05, AGT-06, AGT-07, UI-01, UI-04
**Success Criteria** (what must be TRUE):

  1. Agent answers a natural language question with grounded, source-attributed prose drawn from retrieved chunks
  2. `search_documents` tool returns top-k chunks with source metadata for a given query
  3. `detect_outliers` tool returns Modified Z-Score (MAD-based, threshold 3.5) results with token_bid / statistical_high / statistical_low labels and FHWA disclaimer
  4. `list_documents` tool returns all ingested documents with metadata
  5. Agent responds "I don't know" (with explanation) when retrieved context is insufficient — no hallucination
  6. Multi-turn conversation works: full MessageParam[] history sent each turn, agent maintains context
  7. Chat responses stream to the client via SSE — tokens arrive progressively, not as one block

**Plans**: 5 plans (4 waves)

**Wave 1** *(foundation — no dependencies)*

- [x] 03-01-PLAN.md — Package legitimacy gate + install @anthropic-ai/sdk + zod; export tool I/O contract types in @edgevanta/types; Wave-0 smoke script for toolRunner streaming + zod import + @Sse/@Post decision

**Wave 2** *(parallel — blocked on 03-01; no file overlap)*

- [x] 03-02-PLAN.md — VectorSearchService (KNN search_documents, AGT-02) + DocumentsService (list_documents, AGT-04)
- [x] 03-03-PLAN.md — BidAnalysisService (detect_outliers — Modified Z-Score MAD, labels, FHWA disclaimer, edge-case guards, AGT-03)

**Wave 3** *(blocked on 03-01/02/03)*

- [x] 03-04-PLAN.md — agent.tools.ts (three betaZodTool definitions, AGT-06) + AgentService (toolRunner orchestration, system prompt + refusal, multi-turn, SSE Subject bridge — AGT-01/05/06/07)

**Wave 4** *(blocked on Wave 3)*

- [x] 03-05-PLAN.md — AgentController (@Sse chat endpoint) + AgentModule + AppModule wiring (UI-01, AGT-07); Express-adapter confirmation (UI-04); curl E2E smoke (streaming, refusal, multi-turn)

**UI hint**: yes

### Phase 4: Frontend + Polish

**Goal**: A functional upload UI and streaming chat UI make the system usable end-to-end, and the README gets an evaluator from clone to working in under 5 minutes with all architectural decisions documented
**Depends on**: Phase 3
**Requirements**: UI-02, UI-03, DOC-01, DOC-02, DOC-03, DOC-04
**Success Criteria** (what must be TRUE):

  1. Evaluator can upload a CSV or PDF via drag-and-drop or browse, sees parse status, and sees the document appear in the document list
  2. Evaluator can type a question in the chat UI and watch the agent's response stream token-by-token
  3. Evaluator clones the repo, follows the README, and has the system running in under 5 minutes
  4. README "Key Decisions & Tradeoffs" section documents every major architectural choice with rationale
  5. TypeScript strict mode is on throughout — `tsc --noEmit` passes with zero errors and no `any` suppressions
  6. .env.example documents ANTHROPIC_API_KEY and OPENAI_API_KEY with descriptions

**Plans**: 5 plans (3 waves)

**Wave 1** *(parallel — no dependencies; no file overlap)*

- [x] 04-01-PLAN.md — Tailwind CSS 4 + shadcn/ui bootstrap (New York, neutral), seven components, globals.css + global Toaster in layout.tsx, lib/api.ts API_BASE (UI-03)
- [x] 04-02-PLAN.md — GET /agent/documents endpoint on AgentController (DocumentsService.list) + NEXT_PUBLIC_API_URL in root .env.example (UI-02, DOC-04)

**Wave 2** *(parallel — blocked on Wave 1; no file overlap)*

- [x] 04-03-PLAN.md — UploadPanel: drag-drop + Browse, client CSV/PDF validation, processing spinner, success/error toasts, document list with type + OK/WARN badges (UI-02, UI-03)
- [x] 04-04-PLAN.md — useSseChat hook (fetch+ReadableStream SSE consumer) + ChatPanel: bubbles, blinking cursor, empty state, auto-resize textarea, multi-turn (UI-02, UI-03)

**Wave 3** *(blocked on Wave 2)*

- [x] 04-05-PLAN.md — page.tsx split layout (UploadPanel + ChatPanel) + strict-TS audit both apps + README clone-to-running guide + Key Decisions & Tradeoffs (UI-02, UI-03, DOC-01, DOC-02, DOC-03)

**UI hint**: yes

**Note for planning Phase 4:** Run `/gsd-ui-phase` or apply the `frontend-design` skill before planning the UI plans. README with Key Decisions & Tradeoffs is a first-class deliverable — evaluator reads it.

---

## Milestone 2: Senior-quality hardening

**Goal:** Close engineering-quality gaps before technical interview. Add tests, observability, fix bugs, improve config/validation/data-access, update docs to answer evaluator questions.

- [x] **Phase 5: Engineering Quality** — SSE bug fix, global exception filter, DTO validation, config validation, data-access layer, contractor schema fix, ESLint/Prettier (completed 2026-06-09)
- [x] **Phase 6: Observability** — `/health` endpoint, request logging interceptor, agent metrics logging (completed 2026-06-09)
- [x] **Phase 7: Tests** — Jest setup, unit tests (MAD, CSV alias, totals, DTO), error-path tests, E2E with mocks (completed 2026-06-09)
- [ ] **Phase 8: Docs** — README Evaluation + Future Work sections, correct tool count + SSE description, `.env.example`

### Phase 5: Engineering Quality

**Goal**: Fix real bugs and close structural quality gaps: SSE error handling, global exception filter, DTO validation, config validation, data-access abstraction, contractor schema, ESLint/Prettier.
**Depends on**: Phase 4 complete
**Requirements**: ENG-01 through ENG-08
**Success Criteria**:

1. SSE error frame is `{error:"..."}` not `{done:true}` — front shows toast on agent failure
2. Global exception filter registered; 500s return `{statusCode,message,error}` JSON, no stack in body
3. `POST /agent/chat` with invalid body returns 400 via `ValidationPipe`, not a crash
4. Missing `ANTHROPIC_API_KEY` at startup logs a clear message and exits (not lazy 500)
5. All services use `ConfigService` (no raw `process.env` except `main.ts` port)
6. SQL queries live in repository classes; services call repository methods
7. `bid_items.contractor` column exists; `getContractorTotals` reads it (re-upload CSV → Q3 still works)
8. `pnpm lint` and `pnpm format:check` run without config-not-found errors

**Plans**: 4 plans (3 waves)

**Wave 1** *(parallel — no file overlap)*

- [x] 05-01-PLAN.md — Contractor schema: 002_contractor.sql wipe+recreate, sorted-glob migration runner, CsvIngest populates bid_items.contractor, getContractorTotals reads typed column (ENG-07)
- [x] 05-03-PLAN.md — Config + validation + errors: Joi ConfigModule schema, ChatRequestDto + global ValidationPipe, AllExceptionsFilter, ConfigService migration, SSE {error} frame + UI toast (ENG-01/02/03/04/05)

**Wave 2** *(blocked on 05-01 — shares ingest/analysis files)*

- [x] 05-02-PLAN.md — Repository layer: 3 interfaces + 3 repositories (Chunk/BidItem/Document), DatabaseModule provider+export wiring, 5 services refactored to inject repository interfaces (ENG-06)

**Wave 3** *(blocked on 05-01/02/03 — lints final code)*

- [x] 05-04-PLAN.md — ESLint flat config + Prettier at root, turbo lint task, lint/format:check scripts, make lint/format targets (ENG-08)

### Phase 6: Observability

**Goal**: Evaluator-visible signals: health check, per-request logs with latency, agent tool/token metrics.
**Depends on**: Phase 5
**Requirements**: OBS-01, OBS-02, OBS-03
**Success Criteria**:

1. `GET /health` → `200 {status:"ok",db:"ok"}` (sqlite reachable); `503` if DB down
2. Every request logged: `POST /agent/chat 200 342ms`, `POST /ingest 200 1204ms`
3. Agent logs per-turn: `toolRunner turn 2 — 3 tool calls, 847 tokens`

**Plans**: TBD during `/gsd-plan-phase 6`

### Phase 7: Tests

**Goal**: Jest suite covering high-risk pure functions and one offline E2E of the agent flow.
**Depends on**: Phase 5 (tests cover refactored code), Phase 6 (health endpoint testable)
**Requirements**: TST-01 through TST-04
**Success Criteria**:

1. `pnpm test` runs and is green (no live API calls)
2. Unit: MAD/modifiedZScores happy + edge cases, `getContractorTotals` from typed column, alias mapping round-trip, chat DTO invalid → 400
3. Error paths: CSV with no mappable columns, KNN returns empty → exact refusal string
4. E2E: `/agent/chat` with stubbed Anthropic + OpenAI → streams tokens → done frame

**Plans**: 3 plans (2 waves)

**Wave 1** *(no dependencies)*

- [x] 07-01-PLAN.md — Jest + ts-jest harness: install 6 devDeps (jest [SUS] gate), jest.config.ts + jest-e2e.config.ts, smoke spec, test scripts + turbo task + Makefile target (TST-01)

**Wave 2** *(parallel — blocked on 07-01; no file overlap)*

- [x] 07-02-PLAN.md — Unit + error-path tests: median/modifiedZScores (MAD edge cases), getContractorTotals (mock DatabaseService), column-aliases round-trip, chat-request 400 path, unmappable-CSV all-rows-skipped (TST-02, TST-03)
- [x] 07-03-PLAN.md — Offline E2E: POST /agent/chat with mocked @anthropic-ai/sdk (nested async-generator toolRunner) + openai, supertest asserts token frame + done frame + 200 text/event-stream (TST-04)

### Phase 8: Docs

**Goal**: README answers the questions an evaluator asks; reflects actual implementation.
**Depends on**: Phases 5-7 complete (docs reflect final code)
**Requirements**: DOC2-01 through DOC2-05
**Success Criteria**:

1. README has "How I'd Evaluate This Agent" section (grounding, refusal rate, retrieval, outliers)
2. README has "Future Work" section listing 5 deferred items with rationale
3. Agent tools table shows 4 tools with correct descriptions
4. SSE section describes `@Res()` + `res.write()` pattern (not `@Sse()`+RxJS)
5. `.env.example` is present in git with all required vars
6. `make test` and `make lint` documented in commands table

**Plans**: 2 plans (2 waves)

**Wave 1** *(no dependencies)*

- [x] 08-01-PLAN.md — README "## How I'd Evaluate This Agent" section (4 metric dimensions + SR-89 example, ≤300 words) + "## Future Work" 5-row table (DOC2-01, DOC2-02)

**Wave 2** *(blocked on 08-01 — shared README.md)*

- [x] 08-02-PLAN.md — README fixes: 4th tool row `get_contractor_totals` + SSE `@Res()`+`res.write()` correction + `make test`/`make lint` in commands table + complete/commit `.env.example` (DOC2-03, DOC2-04, DOC2-05)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete | 2026-06-03 |
| 2. Ingestion Pipeline | 5/5 | Complete | 2026-06-03 |
| 3. Agent Core + Streaming | 5/5 | Complete | 2026-06-03 |
| 4. Frontend + Polish | 5/5 | Complete | 2026-06-03 |
| 5. Engineering Quality | 4/4 | Complete    | 2026-06-09 |
| 6. Observability | 2/2 | Complete    | 2026-06-09 |
| 7. Tests | 3/3 | Complete   | 2026-06-09 |
| 8. Docs | 1/2 | In Progress | — |
