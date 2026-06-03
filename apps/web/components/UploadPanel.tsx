'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { DocumentMeta } from '@edgevanta/types';
import { API_BASE } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Upload } from 'lucide-react';

export default function UploadPanel() {
  const [docs, setDocs] = useState<DocumentMeta[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/agent/documents`);
      // WR-02: guard against error responses before casting to DocumentMeta[]
      if (!res.ok) {
        setDocs([]);
        return;
      }
      const data = (await res.json()) as DocumentMeta[];
      setDocs(data);
    } catch {
      setDocs([]);
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  // D-10: load on mount
  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  // D-06/07/08: upload with feedback
  const uploadFile = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        // Do NOT set Content-Type manually — browser sets multipart boundary
        const res = await fetch(`${API_BASE}/ingest`, {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          const err = (await res.json()) as { message?: string };
          toast.error(`Ingestion failed: ${err.message ?? 'Upload failed'}`);
          return;
        }
        // D-07: success toast with filename per copywriting contract
        toast.success(`Document ingested — ${file.name}`, { duration: 3000 });
        // D-07: refresh document list after success
        await loadDocuments();
      } catch {
        toast.error('Ingestion failed: Network error. Please try again.');
      } finally {
        setUploading(false);
      }
    },
    [loadDocuments],
  );

  // D-05: validate by extension AND MIME before any network call
  const handleFile = useCallback(
    (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const allowedExts = ['csv', 'pdf'];
      const allowedMimes = ['text/csv', 'application/pdf'];

      const extOk = allowedExts.includes(ext);
      // Accept empty file.type when extension is valid (some browsers omit MIME for CSV)
      // Reject non-empty file.type that is not in the allowlist
      const mimeOk = file.type === '' ? extOk : allowedMimes.includes(file.type);

      if (!extOk || !mimeOk) {
        toast.error('Only CSV and PDF files are accepted');
        return;
      }
      void uploadFile(file);
    },
    [uploadFile],
  );

  // D-05: drag handlers — disable while uploading
  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (uploading) return;
      e.preventDefault();
      setDragOver(true);
    },
    [uploading],
  );

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      if (uploading) return;
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [uploading, handleFile],
  );

  const handleBrowseChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // Reset input so the same file can be re-selected
      e.target.value = '';
    },
    [handleFile],
  );

  // D-09: WARN derives from parseLog.rows_skipped — NOT from /ingest response
  const getStatus = (doc: DocumentMeta): 'ok' | 'warn' =>
    doc.parseLog.rows_skipped > 0 ? 'warn' : 'ok';

  // Derive file type from mimeType with filename-extension fallback
  const fileType = (doc: DocumentMeta): 'CSV' | 'PDF' => {
    if (doc.mimeType === 'text/csv') return 'CSV';
    if (doc.mimeType === 'application/pdf') return 'PDF';
    // Fallback: derive from filename extension
    const ext = (doc.filename ?? '').split('.').pop()?.toLowerCase();
    return ext === 'csv' ? 'CSV' : 'PDF';
  };

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* Section heading — semibold 16px per typography contract */}
      <h2 className="text-base font-semibold leading-tight">
        Uploaded Documents
      </h2>

      {/* Drop zone — D-05, D-06 */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={[
          'min-h-[120px] flex flex-col items-center justify-center gap-2',
          'rounded-md border-dashed border-2 p-4 transition-colors',
          uploading
            ? 'border-muted-foreground/30 cursor-not-allowed'
            : dragOver
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/30 hover:border-primary/50',
        ].join(' ')}
      >
        {uploading ? (
          /* D-06: processing state */
          <>
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Processing...</span>
          </>
        ) : (
          /* D-05: idle / drag-over state */
          <>
            <Upload className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-center text-muted-foreground">
              Drop CSV or PDF here, or Browse
            </p>
            <p className="text-xs text-center text-muted-foreground">
              CSV bid tabulations and PDF plan sets accepted
            </p>
            {/* Hidden file input — Browse triggers this */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.pdf"
              className="hidden"
              onChange={handleBrowseChange}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="mt-1 min-h-[44px]"
            >
              Browse Files
            </Button>
          </>
        )}
      </div>

      {/* Document list — D-09, D-10 */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1">
          {loadingDocs ? (
            /* Skeleton shimmer — 2 rows */
            <>
              <div className="animate-pulse bg-muted rounded h-4 w-full" />
              <div className="animate-pulse bg-muted rounded h-4 w-3/4" />
            </>
          ) : docs.length === 0 ? (
            /* Empty state */
            <p className="text-sm text-muted-foreground py-2">
              No documents ingested yet.
            </p>
          ) : (
            /* Document rows */
            docs.map((doc) => {
              const status = getStatus(doc);
              const type = fileType(doc);
              return (
                <div
                  key={doc.id}
                  className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-muted/50"
                >
                  <span
                    className="truncate max-w-[120px] text-sm"
                    title={doc.filename ?? 'Unknown file'}
                  >
                    {doc.filename ?? 'Unknown file'}
                  </span>
                  {/* Type badge — neutral/informational */}
                  <Badge variant="outline" className="shrink-0">
                    {type}
                  </Badge>
                  {/* Status badge — OK: secondary, WARN: yellow override */}
                  {status === 'ok' ? (
                    <Badge variant="secondary" className="shrink-0">
                      OK
                    </Badge>
                  ) : (
                    <Badge
                      variant="destructive"
                      className="shrink-0 bg-yellow-100 text-yellow-800"
                    >
                      WARN
                    </Badge>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
