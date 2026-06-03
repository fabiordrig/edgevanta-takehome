import UploadPanel from '@/components/UploadPanel';
import ChatPanel from '@/components/ChatPanel';

/**
 * HomePage — Phase 4 split-layout composition.
 *
 * Server Component that composes the two Client Component panels:
 *   - Left (~30%): UploadPanel — drag-and-drop file ingestion + document list
 *   - Right (~70%): ChatPanel  — streaming agent chat
 *
 * Layout contract (UI-SPEC.md D-01, D-02):
 *   - Root: flex h-screen overflow-hidden — no page scroll
 *   - Left:  w-[30%] border-r flex flex-col
 *   - Right: flex-1 flex flex-col
 *
 * This file is intentionally a Server Component — no use-client directive.
 * It imports Client Components, which is correct App Router composition.
 */
export default function HomePage() {
  return (
    <main className="flex h-screen overflow-hidden">
      {/* Left panel — upload and document list (~30%) */}
      <div className="w-[30%] border-r flex flex-col">
        <UploadPanel />
      </div>

      {/* Right panel — streaming chat (~70%) */}
      <div className="flex-1 flex flex-col">
        <ChatPanel />
      </div>
    </main>
  );
}
