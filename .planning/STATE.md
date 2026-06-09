---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: milestone
status: complete
stopped_at: Milestone 2 complete — all 8 phases verified
last_updated: "2026-06-09T02:45:00.000Z"
last_activity: 2026-06-09 -- Phase 08 verified 9/9, milestone 2 done
progress:
  total_phases: 8
  completed_phases: 8
  total_plans: 29
  completed_plans: 29
  percent: 100
---

# Project State — Milestone 2: Senior-quality hardening

## Project Reference

See: .planning/PROJECT.md | .planning/ROADMAP.md (phases 5-8) | .planning/REQUIREMENTS.md (ENG/OBS/TST/DOC2)

**Core value:** The agent must give accurate, grounded answers — and know when it doesn't have enough information.
**Current focus:** Phase 08 — docs

## Current Position

Phase: 08 (docs) — EXECUTING
Plan: 2 of 2
Status: Phase complete — ready for verification
Last activity: 2026-06-09 -- 08-01 complete; README evaluation + future work sections added

## Milestone 1 Summary

Milestone 1 (v1.0) complete 2026-06-03. 4 phases, 18 plans. Delivered:

- Turborepo monorepo, NestJS 11 + Next.js 15
- CSV/PDF ingest, OpenAI embeddings, sqlite-vec vector store
- Tool-use agent (4 tools), SSE streaming, outlier detection
- Upload UI, streaming chat UI, react-markdown, Makefile, README

## Accumulated Context

### Key decisions (milestone 1 — still active)

- better-sqlite3 (not node:sqlite) — macOS OMIT_LOAD_EXTENSION
- NestJS Express adapter (not Fastify) — SSE CORS bug #8717
- betaZodTool + toolRunner — no manual tool_use loop
- zod import path: `zod/v4`
- toolRunner iterator: `for await (messageStream of runner) { for await (event of messageStream) }`
- SSE: raw `@Res()` + `res.write()` — `@Post`+`@Sse` buffered Observable
- pdf-to-img@6.1.0 (not pdf-img-convert) — pangocairo dep issue on macOS arm64
- model id: `claude-sonnet-4-6` — valid, do not change

### Known gaps to fix (milestone 2)

- `bid_items` has no `contractor` column — `getContractorTotals` reads free-text chunks (fragile)
- `agent.service.ts:83` reads `process.env.ANTHROPIC_API_KEY` directly (should use ConfigService)
- `main.ts` reads `process.env` directly for PORT + CORS_ORIGIN
- No `validationSchema` in ConfigModule
- No global exception filter
- No ValidationPipe — `validateChatRequest` is hand-rolled
- SSE error path emits `{done:true}` — client can't distinguish error from success
- SQL scattered in 6 services (no repository layer)
- No ESLint/Prettier
- No test runner (no jest, no `test` script)
- No `/health` endpoint
- README lists 3 tools (should be 4), describes `@Sse()`+RxJS (wrong)
- `.env.example` may be absent from git

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| v3 | Reranking step between KNN and context assembly | Deferred | Milestone 1 |
| v3 | IQR cross-validation alongside MAD | Deferred | Milestone 1 |
| v3 | Page-count cap for vision fallback on large PDFs | Deferred | Milestone 1 |
| v3 | Similarity score threshold tuning for refusal | Deferred | Milestone 1 |
| v3 | CSV alias map as configurable table (not hardcoded JSON) | Deferred | Milestone 1 |

## Session Continuity

Last session: 2026-06-09T01:11:52Z
Stopped at: Completed 08-01-PLAN.md
Next: `/gsd-execute-phase 08`
