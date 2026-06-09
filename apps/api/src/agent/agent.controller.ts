import {
  BadRequestException,
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
import type { ChatMessage, ChatRequest, DocumentMeta } from '@edgevanta/types';
import { AgentService } from './agent.service';
import { DocumentsService } from './documents.service';

/**
 * AgentController — exposes the SSE chat endpoint that streams agent
 * responses progressively to HTTP clients (UI-01, AGT-07).
 *
 * Route decision (03-01 SUMMARY.md A3 — revised):
 *   POST /agent/chat with @Res() + manual SSE writes. The original @Post + @Sse
 *   stack caused NestJS to buffer the Observable until completion — tokens never
 *   flushed progressively. Raw res.write() fixes this.
 *
 * Request validation (T-03-13):
 *   Validates that body.messages is a non-empty array where each element has:
 *   - role: 'user' | 'assistant'
 *   - content: non-empty string
 *   Throws BadRequestException before reaching AgentService on malformed input.
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
   * SSE frame format (UI-01):
   *   data: {"token":"..."}   — text delta token (arrives progressively)
   *   data: {"done":true}     — signals end of the agent turn
   */
  @Post('chat')
  @HttpCode(200)
  chat(@Body() body: ChatRequest, @Res() res: Response): void {
    this.validateChatRequest(body);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const messages: MessageParam[] = body.messages.map((msg: ChatMessage) => ({
      role: msg.role,
      content: msg.content,
    }));

    this.logger.log(
      `chat — ${messages.length} turn(s), last role: ${messages[messages.length - 1]?.role}`,
    );

    this.agentService.stream(messages).subscribe({
      next: (event) => res.write(`data: ${JSON.stringify(event.data)}\n\n`),
      error: (err) => {
        this.logger.error('chat stream error', err);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      },
      complete: () => res.end(),
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

  /**
   * Validate that the incoming body is a well-formed ChatRequest.
   *
   * Throws BadRequestException (HTTP 400) on any violation — preventing
   * malformed input from reaching the Anthropic SDK (T-03-13 ASVS L1).
   */
  private validateChatRequest(body: ChatRequest): void {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException(
        'Request body is required — send Content-Type: application/json with a ChatRequest object',
      );
    }

    if (!Array.isArray(body.messages)) {
      throw new BadRequestException(
        'body.messages must be an array of ChatMessage objects',
      );
    }

    if (body.messages.length === 0) {
      throw new BadRequestException(
        'body.messages must contain at least one message',
      );
    }

    for (let i = 0; i < body.messages.length; i++) {
      const msg = body.messages[i];
      if (!msg || typeof msg !== 'object') {
        throw new BadRequestException(
          `body.messages[${i}] must be an object with role and content`,
        );
      }
      if (msg.role !== 'user' && msg.role !== 'assistant') {
        throw new BadRequestException(
          `body.messages[${i}].role must be 'user' or 'assistant', got: '${String(msg.role)}'`,
        );
      }
      if (typeof msg.content !== 'string' || msg.content.length === 0) {
        throw new BadRequestException(
          `body.messages[${i}].content must be a non-empty string`,
        );
      }
    }
  }
}
