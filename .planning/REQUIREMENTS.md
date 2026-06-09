# Requirements — Edgevanta Construction Estimating Agent

## v1 Requirements

### Ingestion (INF)

- [x] **INF-01**: User can upload CSV file via web UI (Next.js Route Handler — bypasses Server Action 1 MB limit)
- [x] **INF-02**: User can upload PDF file via web UI
- [x] **INF-03**: System parses CSV with csv-parse, normalizes headers to lowercase_underscore, strips commas from numeric fields before parseFloat
- [x] **INF-04**: System extracts text from PDF via pdf-parse; falls back to OpenAI Vision (pdf-img-convert) when avgCharsPerPage < 50
- [x] **INF-05**: System chunks CSV as KV-block groups (~512 tokens); PDF as sentence/paragraph chunks
- [x] **INF-06**: Ingestion surfaces a parse log: columns mapped, rows skipped, fallback triggered — stored per document

### Embeddings & Storage (EMB)

- [x] **EMB-01**: System generates embeddings via OpenAI text-embedding-3-small (float[1536])
- [x] **EMB-02**: System stores vectors in SQLite+sqlite-vec via better-sqlite3 (NOT node:sqlite — macOS OMIT_LOAD_EXTENSION)
- [x] **EMB-03**: Vector store persists between sessions (file-based SQLite)
- [x] **EMB-04**: System asserts `SELECT vec_version()` on startup to confirm extension loaded correctly
- [x] **EMB-05**: bid_items table stores structured CSV rows for SQL-based statistical queries (not vector search)

### Agent & Tools (AGT)

- [x] **AGT-01**: Agent answers natural language questions grounded in retrieved data using claude-sonnet-4-6
- [x] **AGT-02**: Agent exposes `search_documents` tool — semantic search over embedded chunks, returns top-k with source metadata
- [x] **AGT-03**: Agent exposes `detect_outliers` tool — Modified Z-Score (MAD-based, threshold 3.5) over bid_items; names outlier types as token_bid / statistical_high / statistical_low; appends FHWA disclaimer
- [x] **AGT-04**: Agent exposes `list_documents` tool — returns uploaded documents with metadata
- [x] **AGT-05**: Agent refuses to answer (with explanation) when retrieved context is insufficient
- [x] **AGT-06**: Agent uses betaZodTool + toolRunner from @anthropic-ai/sdk/helpers/beta/zod — no manual tool_use loop
- [x] **AGT-07**: Agent handles multi-turn conversation; React state holds full MessageParam[] history sent each turn

### Streaming & UI (UI)

- [x] **UI-01**: Chat interface streams agent responses via SSE (NestJS @Sse() + RxJS Subject → Observable<MessageEvent>)
- [x] **UI-02**: File upload UI — drag/drop or browse, shows parse status and document list
- [x] **UI-03**: Frontend designed with /frontend-design skill — functional + clean, not overbuilt
- [x] **UI-04**: NestJS uses Express adapter (not Fastify) — avoids confirmed SSE CORS bug #8717

### Documentation & Quality (DOC)

- [x] **DOC-01**: README gets evaluator from clone to working in under 5 minutes
- [x] **DOC-02**: README includes "Key Decisions & Tradeoffs" section documenting every major architectural choice and why
- [x] **DOC-03**: TypeScript strict mode throughout — no `any`, no suppressed errors
- [x] **DOC-04**: .env.example documents all required keys (ANTHROPIC_API_KEY, OPENAI_API_KEY)

## v2 Requirements — Milestone 2: Senior-quality hardening

### Engineering Quality (ENG)

- [x] **ENG-01**: SSE error frames are distinct from success — `{error:"..."}` frame on failure; client shows toast
- [ ] **ENG-02**: Global exception filter normalizes all unhandled errors to structured JSON; no stack leaks in production
- [ ] **ENG-03**: DTO validation via `class-validator` + global `ValidationPipe` replaces hand-rolled `validateChatRequest`
- [ ] **ENG-04**: `ConfigModule` validates all required env vars at startup (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `PORT`, `DB_PATH`, `CORS_ORIGIN`)
- [ ] **ENG-05**: All services read env via `ConfigService`, not `process.env` directly
- [ ] **ENG-06**: SQL queries centralized in a repository/data-access layer; services do not hold raw SQL
- [ ] **ENG-07**: `bid_items` table has `contractor` column; `getContractorTotals` reads typed column, not free-text chunks
- [x] **ENG-08**: ESLint + Prettier configured; `lint` and `format` scripts available

### Observability (OBS)

- [x] **OBS-01**: `GET /health` returns `{status:"ok"}` and checks sqlite connectivity (`SELECT 1`)
- [x] **OBS-02**: Global request logging interceptor logs method, route, latency ms, status per request
- [x] **OBS-03**: Agent responses log tool-call count and token usage per request (structured log)

### Testing (TST)

- [ ] **TST-01**: Jest + ts-jest configured; `test` script runs in all packages; wired to Turborepo
- [ ] **TST-02**: Unit tests for `median`/`modifiedZScores` (MAD), `getContractorTotals`, CSV alias mapping, chat DTO validation
- [ ] **TST-03**: Error-path unit tests: unmappable CSV, empty embedding, KNN no results → exact refusal string
- [ ] **TST-04**: ≥1 E2E test for `/agent/chat` with Anthropic + OpenAI mocked (offline)

### Documentation (DOC2)

- [ ] **DOC2-01**: README "Evaluation" section — how to measure agent quality (grounding, refusal rate, retrieval precision, outlier accuracy)
- [ ] **DOC2-02**: README "Future Work" section — v2 deferred items surfaced for evaluator
- [x] **DOC2-03**: README corrected — 4 tools listed, SSE implementation description accurate
- [x] **DOC2-04**: `.env.example` committed and complete (was absent)
- [x] **DOC2-05**: README documents `make test` and `make lint` commands

## v2 Requirements (deferred to v3)

- Reranking step between KNN and context assembly (+10-30% precision)
- Cross-validation of outliers with IQR alongside MAD
- Page-count cap for vision fallback on large PDFs (>50 pages)
- Similarity score threshold tuning for refusal decisions

## Out of Scope

- Auth / multi-tenant — single-user local demo only
- Deployment config — local only per spec
- Dashboard charts / visualizations — time goes to agent quality
- Perfect OCR — graceful handling matters more
- Multi-agent orchestration — one agent, clear tools, no premature complexity
- GraphRAG / hybrid retrieval — standard KNN sufficient for demo corpus size

## Traceability v2

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENG-01 | Phase 5 — Engineering Quality | Complete |
| ENG-02 | Phase 5 — Engineering Quality | Pending |
| ENG-03 | Phase 5 — Engineering Quality | Pending |
| ENG-04 | Phase 5 — Engineering Quality | Pending |
| ENG-05 | Phase 5 — Engineering Quality | Pending |
| ENG-06 | Phase 5 — Engineering Quality | Pending |
| ENG-07 | Phase 5 — Engineering Quality | Pending |
| ENG-08 | Phase 5 — Engineering Quality | Complete |
| OBS-01 | Phase 6 — Observability | Complete |
| OBS-02 | Phase 6 — Observability | Complete |
| OBS-03 | Phase 6 — Observability | Complete |
| TST-01 | Phase 7 — Tests | Pending |
| TST-02 | Phase 7 — Tests | Pending |
| TST-03 | Phase 7 — Tests | Pending |
| TST-04 | Phase 7 — Tests | Pending |
| DOC2-01 | Phase 8 — Docs | Pending |
| DOC2-02 | Phase 8 — Docs | Pending |
| DOC2-03 | Phase 8 — Docs | Complete |
| DOC2-04 | Phase 8 — Docs | Complete |
| DOC2-05 | Phase 8 — Docs | Complete |

## Traceability v1

| Requirement | Phase | Status |
|-------------|-------|--------|
| EMB-01 | Phase 1 — Foundation | Complete |
| EMB-02 | Phase 1 — Foundation | Complete |
| EMB-03 | Phase 1 — Foundation | Complete |
| EMB-04 | Phase 1 — Foundation | Complete |
| EMB-05 | Phase 1 — Foundation | Complete |
| INF-01 | Phase 2 — Ingestion Pipeline | Complete |
| INF-02 | Phase 2 — Ingestion Pipeline | Complete |
| INF-03 | Phase 2 — Ingestion Pipeline | Complete |
| INF-04 | Phase 2 — Ingestion Pipeline | Complete |
| INF-05 | Phase 2 — Ingestion Pipeline | Complete |
| INF-06 | Phase 2 — Ingestion Pipeline | Complete |
| AGT-01 | Phase 3 — Agent Core + Streaming | Complete |
| AGT-02 | Phase 3 — Agent Core + Streaming | Complete |
| AGT-03 | Phase 3 — Agent Core + Streaming | Complete |
| AGT-04 | Phase 3 — Agent Core + Streaming | Complete |
| AGT-05 | Phase 3 — Agent Core + Streaming | Complete |
| AGT-06 | Phase 3 — Agent Core + Streaming | Complete |
| AGT-07 | Phase 3 — Agent Core + Streaming | Complete |
| UI-01 | Phase 3 — Agent Core + Streaming | Complete |
| UI-04 | Phase 3 — Agent Core + Streaming | Complete |
| UI-02 | Phase 4 — Frontend + Polish | Complete |
| UI-03 | Phase 4 — Frontend + Polish | Complete |
| DOC-01 | Phase 4 — Frontend + Polish | Complete |
| DOC-02 | Phase 4 — Frontend + Polish | Complete |
| DOC-03 | Phase 4 — Frontend + Polish | Complete |
| DOC-04 | Phase 4 — Frontend + Polish | Complete |
