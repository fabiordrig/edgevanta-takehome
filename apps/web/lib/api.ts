/**
 * Backend API base URL.
 *
 * All NestJS endpoints are relative to this base:
 *   - GET  /agent/documents  — list ingested documents
 *   - POST /ingest           — upload and ingest a CSV or PDF file
 *   - POST /agent/chat       — streaming SSE chat (text/event-stream)
 *
 * Set NEXT_PUBLIC_API_URL in apps/web/.env.local for non-default environments.
 * NEXT_PUBLIC_ variables are baked into the client bundle at build time.
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
