import type { Document } from '@edgevanta/types';

/**
 * Placeholder home page — Phase 1 only.
 *
 * Imports `Document` from @edgevanta/types to prove cross-package type sharing
 * compiles in the frontend (ROADMAP Success Criterion 5).
 * The `transpilePackages: ['@edgevanta/types']` in next.config.ts + path alias
 * in tsconfig.json make this import resolve through pnpm's workspace symlinks.
 *
 * Real upload UI and chat UI are deferred to Phase 4 (UI-02, UI-03).
 */
export default function HomePage() {
  // Typed empty array proves the import resolves at compile time.
  // In Phase 4 this will be replaced with server-fetched data.
  const documents: Document[] = [];

  return (
    <main>
      <h1>Edgevanta Construction Estimating Agent</h1>
      <p>Documents ingested: {documents.length}</p>
      <p>Upload and chat UI coming in Phase 4.</p>
    </main>
  );
}
