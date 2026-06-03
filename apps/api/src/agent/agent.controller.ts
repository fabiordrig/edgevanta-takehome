import {
  BadRequestException,
  Body,
  Controller,
  Logger,
  MessageEvent,
  Post,
  Sse,
} from '@nestjs/common';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { Observable } from 'rxjs';
import type { ChatMessage, ChatRequest } from '@edgevanta/types';
import { AgentService } from './agent.service';

/**
 * AgentController — exposes the SSE chat endpoint that streams agent
 * responses progressively to HTTP clients (UI-01, AGT-07).
 *
 * Route decision (03-01 SUMMARY.md A3):
 *   @Post('chat') + @Sse('chat') — NestJS allows stacking @Post and @Sse on the
 *   same method when the Express adapter is used. The client must send
 *   Content-Type: application/json with a ChatRequest body.
 *
 *   The @Sse decorator sets the response Content-Type to text/event-stream and
 *   enables the Observable return type. @Post allows a request body to be parsed.
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

  constructor(private readonly agentService: AgentService) {}

  /**
   * POST /agent/chat — stream a grounded agent response.
   *
   * Accepts full ChatMessage[] history each turn (multi-turn, AGT-07).
   * Validates the body, maps ChatMessage[] → MessageParam[], and pipes the
   * resulting Observable<MessageEvent> directly to the SSE client.
   *
   * SSE frame format (UI-01):
   *   data: {"token":"..."}   — text delta token (arrives progressively)
   *   data: {"done":true}     — signals end of the agent turn
   */
  @Post('chat')
  @Sse('chat')
  chat(@Body() body: ChatRequest): Observable<MessageEvent> {
    this.validateChatRequest(body);

    const messages: MessageParam[] = body.messages.map((msg: ChatMessage) => ({
      role: msg.role,
      content: msg.content,
    }));

    this.logger.log(
      `chat — ${messages.length} turn(s), last role: ${messages[messages.length - 1]?.role}`,
    );

    return this.agentService.stream(messages);
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
