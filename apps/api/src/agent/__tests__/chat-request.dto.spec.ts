/**
 * chat-request.dto.spec.ts — HTTP 400 validation path for POST /agent/chat.
 *
 * Tests the ChatRequestDto + ValidationPipe gate at the AgentController.
 * AgentService is fully mocked so no ANTHROPIC_API_KEY is required.
 * DocumentsService is mocked with a no-op list().
 *
 * T-07-04: ASVS L1 input-validation control test.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { of } from 'rxjs';
import { AgentController } from '../agent.controller';
import { AgentService } from '../agent.service';
import { DocumentsService } from '../documents.service';

// ── Mock factories ────────────────────────────────────────────────────────────

/** Mock AgentService — stream completes immediately with a done frame. */
const mockAgentService = {
  stream: jest.fn().mockReturnValue(of({ data: { done: true } })),
};

/** Mock DocumentsService — list returns an empty array. */
const mockDocumentsService = {
  list: jest.fn().mockReturnValue([]),
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe('POST /agent/chat — ChatRequestDto validation (400 path)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentController],
      providers: [
        { provide: AgentService, useValue: mockAgentService },
        { provide: DocumentsService, useValue: mockDocumentsService },
      ],
    }).compile();

    app = module.createNestApplication();
    // Mirror the global ValidationPipe applied in main.ts (ENG-03 / Phase 5).
    // Without this, class-validator decorators on ChatRequestDto are not evaluated.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Invalid body cases (must return 400) ─────────────────────────────────

  it('returns 400 for empty body {}', async () => {
    await request(app.getHttpServer()).post('/agent/chat').send({}).expect(400);
  });

  it('returns 400 for {messages: []} (empty array fails @ArrayMinSize(1))', async () => {
    await request(app.getHttpServer())
      .post('/agent/chat')
      .send({ messages: [] })
      .expect(400);
  });

  it('returns 400 for {messages:[{role:"invalid",content:"hi"}]} (bad role)', async () => {
    await request(app.getHttpServer())
      .post('/agent/chat')
      .send({ messages: [{ role: 'invalid', content: 'hi' }] })
      .expect(400);
  });

  it('returns 400 for {messages:[{role:"user",content:""}]} (empty content)', async () => {
    await request(app.getHttpServer())
      .post('/agent/chat')
      .send({ messages: [{ role: 'user', content: '' }] })
      .expect(400);
  });

  // ── Valid body (must NOT return 400) ─────────────────────────────────────

  it('a valid body does NOT return 400 (passes validation, reaches mocked stream)', async () => {
    const res = await request(app.getHttpServer())
      .post('/agent/chat')
      .send({ messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).not.toBe(400);
  });
});
