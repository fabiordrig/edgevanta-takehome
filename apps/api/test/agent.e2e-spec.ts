// jest.mock calls MUST appear before any imports — Jest hoists them above imports
// at transform time, but placing them first is defensive against edge cases (Pitfall 1).

jest.mock('@anthropic-ai/sdk', () => {
  // Stub event matching the real BetaRawContentBlockDeltaEvent shape:
  // { type: 'content_block_delta', index: number, delta: { type: 'text_delta', text: string } }
  const stubEvent = {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: 'hello' },
  };

  // Inner: async iterable of events (BetaMessageStream stub).
  // Matches the inner `for await (const event of messageStream)` loop in agent.service.ts.
  async function* fakeMessageStream() {
    yield stubEvent;
  }

  // Outer: async iterable of message streams (BetaToolRunner<true> stub).
  // Matches the outer `for await (const messageStream of runner)` loop in agent.service.ts.
  async function* fakeToolRunner() {
    yield fakeMessageStream();
  }

  // __esModule: true signals to ts-jest's __importDefault() to pass this module through
  // without double-wrapping in { default: ... }. Without it, `import Anthropic from '...'`
  // compiles to sdk_1.default which would be { default: fn } instead of fn itself.
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      beta: {
        messages: {
          // Use mockImplementation (not mockReturnValue) so each call produces
          // a fresh generator — prevents exhausted-iterator bug (Pitfall 2).
          toolRunner: jest.fn().mockImplementation(() => fakeToolRunner()),
        },
      },
    })),
  };
});

jest.mock('openai', () => {
  // __esModule: true prevents ts-jest's __importDefault() from double-wrapping the module.
  // Without it, `import OpenAI from 'openai'` resolves to { default: fn }.default = fn,
  // but __importDefault would see no __esModule flag and wrap again.
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      embeddings: {
        create: jest.fn().mockResolvedValue({
          data: [{ embedding: new Array(1536).fill(0), index: 0 }],
          model: 'text-embedding-3-small',
          usage: { prompt_tokens: 0, total_tokens: 0 },
        }),
      },
    })),
  };
});

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');
import { AppModule } from '../src/app.module';

describe('POST /agent/chat (E2E — mocked SDK)', () => {
  let app: INestApplication;
  let tempDbPath: string;

  beforeAll(async () => {
    // Use a unique temp DB path so DatabaseService.onModuleInit opens an isolated file
    tempDbPath = path.join(os.tmpdir(), `edgevanta-e2e-${Date.now()}.sqlite`);
    process.env.DB_PATH = tempDbPath;

    // Provide dummy placeholder keys — Anthropic class is fully mocked so the
    // key is never transmitted. EmbeddingService is also mocked — key not used.
    // agent.service.ts reads process.env.ANTHROPIC_API_KEY directly (pre-ConfigService version).
    process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
    process.env.OPENAI_API_KEY = 'test-openai-key-not-used';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
    // Clean up temp DB files (ignore errors — file may not exist if init failed early)
    try { fs.unlinkSync(tempDbPath); } catch { /* noop */ }
    try { fs.unlinkSync(`${tempDbPath}-wal`); } catch { /* noop */ }
    try { fs.unlinkSync(`${tempDbPath}-shm`); } catch { /* noop */ }
  });

  it('streams a token frame then a done frame (TST-04)', async () => {
    const response = await request(app.getHttpServer())
      .post('/agent/chat')
      .set('Content-Type', 'application/json')
      .send({ messages: [{ role: 'user', content: 'hello' }] })
      .buffer(true)
      .parse((res: any, callback: any) => {
        let data = '';
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on('end', () => callback(null, data));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch('text/event-stream');

    // response.body is the collected SSE string from our custom parser
    const body: string = response.body as string;
    expect(body).toContain('data: {"token":"hello"}');
    expect(body).toContain('data: {"done":true}');
  }, 30000);
});
