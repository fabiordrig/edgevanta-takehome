'use client';
import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSseChat } from '@/hooks/useSseChat';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';

/**
 * ChatPanel — right-panel streaming chat UI.
 *
 * Renders user/agent message bubbles, a blinking streaming cursor,
 * an empty state, and an auto-resizing textarea with Enter-to-send /
 * Shift+Enter-newline. Consumes useSseChat for SSE streaming.
 *
 * Design decisions: D-11 (bubbles), D-12 (blinking cursor), D-13 (empty state),
 * D-14 (auto-resize, Enter/Shift+Enter), D-15 (disabled while streaming),
 * D-16 (multi-turn history), D-18 (error toast).
 */
export default function ChatPanel() {
  const { messages, streaming, sendMessage } = useSseChat();
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // D-14: auto-resize textarea to fit content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '0px';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  // Auto-scroll to the latest message or streaming token
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    try {
      await sendMessage(text);
    } catch {
      // D-18: show error toast on stream failure and re-enable input
      toast.error('Connection error. Please try again.');
    }
    // Return focus to textarea after send
    textareaRef.current?.focus();
  }

  // D-14: Enter sends; Shift+Enter inserts newline
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Message list — flex-1 to fill available space, scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-6 pb-24 flex flex-col gap-6">
        {messages.length === 0 ? (
          /* D-13: empty state — centered placeholder */
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <h2 className="text-base font-semibold text-muted-foreground mb-2">
              Construction Estimating Agent
            </h2>
            <p className="text-sm text-muted-foreground">
              Ask a question about the ingested data.
            </p>
          </div>
        ) : (
          /* D-11: message bubbles — user right-aligned, agent left-aligned */
          messages.map((msg, index) => {
            const isLast = index === messages.length - 1;
            const isUser = msg.role === 'user';

            return (
              <div
                key={index}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`rounded-lg px-4 py-3 max-w-[80%] text-sm leading-relaxed ${
                    isUser
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="space-y-1">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          table: ({ children }) => <div className="overflow-x-auto my-1"><table className="text-xs border-collapse w-full">{children}</table></div>,
                          thead: ({ children }) => <thead className="bg-black/10">{children}</thead>,
                          th: ({ children }) => <th className="border border-muted-foreground/30 px-2 py-1 text-left font-semibold">{children}</th>,
                          td: ({ children }) => <td className="border border-muted-foreground/20 px-2 py-1">{children}</td>,
                          p: ({ children }) => <p className="leading-relaxed">{children}</p>,
                          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                          em: ({ children }) => <em className="italic">{children}</em>,
                          code: ({ children, className }) =>
                            className ? (
                              <code className="block bg-black/10 rounded p-2 text-xs font-mono whitespace-pre-wrap overflow-x-auto">{children}</code>
                            ) : (
                              <code className="bg-black/10 px-1 rounded text-xs font-mono">{children}</code>
                            ),
                          pre: ({ children }) => <pre className="my-1">{children}</pre>,
                          ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5">{children}</ol>,
                          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                          blockquote: ({ children }) => <blockquote className="border-l-2 border-muted-foreground/40 pl-2 text-muted-foreground text-xs">{children}</blockquote>,
                          h1: ({ children }) => <p className="font-bold">{children}</p>,
                          h2: ({ children }) => <p className="font-semibold">{children}</p>,
                          h3: ({ children }) => <p className="font-semibold">{children}</p>,
                          hr: () => <hr className="border-muted-foreground/30 my-1" />,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                      {streaming && isLast && <span className="animate-pulse">|</span>}
                    </div>
                  ) : (
                    <span>{msg.content}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
        {/* Scroll anchor — auto-scroll targets this element */}
        <div ref={bottomRef} />
      </div>

      {/* Fixed input bar at the bottom */}
      <div className="border-t bg-background px-4 py-4 flex gap-3 items-end">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about bids, costs, or outliers..."
          disabled={streaming}
          rows={1}
          className="flex-1 resize-none min-h-[44px] max-h-48 overflow-y-auto"
        />
        <Button
          onClick={() => void handleSend()}
          disabled={streaming || input.trim().length === 0}
          className="min-h-[44px] shrink-0"
        >
          <Send className="h-4 w-4 mr-2" />
          Send Message
        </Button>
      </div>
    </div>
  );
}
