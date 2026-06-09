import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type { DocumentMeta } from '@edgevanta/types';
import { AgentService } from './agent.service';
import { DocumentsService } from './documents.service';
import { ChatRequestDto } from '../common/dto/chat-request.dto';

/**
 * AgentController — exposes the SSE chat endpoint that streams agent
 * responses progressively to HTTP clients (UI-01, AGT-07).
 *
 * Route decision (03-01 SUMMARY.md A3 — revised):
 *   POST /agent/chat with @Res() + manual SSE writes. The original @Post + @Sse
 *   stack caused NestJS to buffer the Observable until completion — tokens never
 *   flushed progressively. Raw res.write() fixes this.
 *
 * Request validation (ENG-03 / D-13, D-14):
 *   ValidationPipe + ChatRequestDto handles all validation via class-validator
 *   decorators. The hand-rolled validateChatRequest() method has been removed.
 *   Invalid bodies return 400 with field-level details before reaching AgentService.
 *
 * SSE error frames (ENG-01 / D-10, D-11):
 *   - {error: "..."} — distinct error frame on agent failure
 *   - {token: "..."} — text delta (progressive)
 *   - {done: true} — signals successful completion
 *   All res.write/res.end calls are guarded by !res.writableEnded (D-11).
 */
@Controller('agent')
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(
    private readonly agentService: AgentService,
    private readonly documentsService: DocumentsService,
  ) {}

  /**
   * POST /agent/chat — stream a grounded agent response via raw SSE.
   *
   * Uses @Res() + manual res.write() instead of @Sse() because NestJS buffers
   * Observable output when @Post and @Sse are stacked — tokens never flush
   * until the Observable completes. Raw Express writes flush per-token.
   *
   * SSE frame format (UI-01 / ENG-01):
   *   data: {"token":"..."}   — text delta token (arrives progressively)
   *   data: {"done":true}     — signals successful end of the agent turn
   *   data: {"error":"..."}   — signals agent failure (distinct from done — ENG-01)
   */
  @Post('chat')
  @HttpCode(200)
  chat(@Body() body: ChatRequestDto, @Res() res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const messages: MessageParam[] = body.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    this.logger.log(
      `chat — ${messages.length} turn(s), last role: ${messages[messages.length - 1]?.role}`,
    );

    const subscription = this.agentService.stream(messages).subscribe({
      next: (event) => {
        // Guard against write-after-end on client disconnect (D-11 / RESEARCH Pitfall 3)
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify(event.data)}\n\n`);
        }
      },
      error: (err) => {
        // Log server-side detail; send only generic message to client (T-05-08 / D-10)
        this.logger.error('chat stream error', err);
        if (!res.writableEnded) {
          res.write(
            `data: ${JSON.stringify({ error: 'Agent error. Please try again.' })}\n\n`,
          );
          res.end();
        }
      },
      complete: () => {
        if (!res.writableEnded) {
          res.end();
        }
      },
    });

    // Unsubscribe on client disconnect — triggers finalize() in AgentService
    // which aborts the upstream Anthropic API call (D-11 / T-03-11)
    res.on('close', () => {
      subscription.unsubscribe();
    });
  }

  /**
   * GET /agent/documents — return the list of all ingested documents.
   *
   * Delegates to DocumentsService.list() which reads the documents table
   * and decodes each row's parse_log JSON. A single corrupt row falls back
   * to FALLBACK_PARSE_LOG (T-03-05) so this endpoint never throws on
   * bad data.
   *
   * Returns: DocumentMeta[] (UI-02 prerequisite — UploadPanel document list)
   */
  @Get('documents')
  listDocuments(): DocumentMeta[] {
    const docs = this.documentsService.list();
    this.logger.log(`listDocuments — returning ${docs.length} document(s)`);
    return docs;
  }
}
