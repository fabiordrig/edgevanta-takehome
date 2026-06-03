'use client';
import { useState, useCallback, useRef } from 'react';
import type { ChatMessage } from '@edgevanta/types';
import { API_BASE } from '@/lib/api';

/**
 * useSseChat — fetch + ReadableStream SSE consumer for POST /agent/chat.
 *
 * Sends the full ChatMessage[] history each turn (multi-turn, D-16).
 * Streams agent tokens via fetch + ReadableStream — NOT the native GET-only SSE API
 * (Pitfall 1: the native SSE API is GET-only and cannot carry the POST body).
 *
 * Handles:
 *  - UTF-8-safe decoding via TextDecoder({ stream: true }) (Pitfall 3)
 *  - Double-newline SSE frame boundaries (\n\n) (Pitfall 3)
 *  - Abort-on-unmount / superseded request via AbortController (Pitfall 6)
 *  - Blinking cursor: empty assistant bubble appended before first token (D-12)
 */
export function useSseChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (userText: string) => {
      // Abort any in-flight request (prevents stale state updates, D-12 / Pitfall 6)
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Build full history including the new user turn
      const newMessages: ChatMessage[] = [
        ...messages,
        { role: 'user', content: userText },
      ];

      // Append empty assistant bubble immediately so it appears on first token (D-12)
      setMessages([...newMessages, { role: 'assistant', content: '' }]);
      setStreaming(true);

      try {
        const response = await fetch(`${API_BASE}/agent/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Send newMessages (history + user turn) — NOT the UI placeholder
          body: JSON.stringify({ messages: newMessages }),
          signal: controller.signal,
        });

        // CR-03: check response status before treating body as SSE stream
        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }
        if (!response.body) throw new Error('No response body');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let streamDone = false; // CR-01: flag to break outer while loop

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // { stream: true } prevents multi-byte UTF-8 corruption across chunk boundaries
          buffer += decoder.decode(value, { stream: true });

          // SSE frames are delimited by double-newlines
          const frames = buffer.split('\n\n');
          // Keep the trailing partial frame for the next iteration
          buffer = frames.pop() ?? '';

          for (const frame of frames) {
            if (!frame.startsWith('data: ')) continue;

            // CR-02: guard against malformed frames (server errors, comments, partial chunks)
            let payload: { token?: string; done?: boolean };
            try {
              payload = JSON.parse(frame.slice(6)) as {
                token?: string;
                done?: boolean;
              };
            } catch {
              continue;
            }

            if (payload.token) {
              // Append token to the last assistant message
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content + payload.token,
                  };
                }
                return updated;
              });
            }

            if (payload.done) {
              streamDone = true; // CR-01: signal outer loop to exit
              break;
            }
          }

          if (streamDone) break; // CR-01: exit outer while loop on server done signal
        }
      } catch (err) {
        // Silently ignore abort (component unmounted / superseded request — Pitfall 6)
        if ((err as Error).name === 'AbortError') return;
        // WR-03: remove the empty assistant placeholder on fetch/stream errors
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last.content === '') {
            return prev.slice(0, -1);
          }
          return prev;
        });
        // Re-throw so the caller (ChatPanel) can toast the user (D-18)
        throw err;
      } finally {
        setStreaming(false);
      }
    },
    [messages],
  );

  return { messages, streaming, sendMessage };
}
