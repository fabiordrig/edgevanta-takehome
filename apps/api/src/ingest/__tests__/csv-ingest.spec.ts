/**
 * csv-ingest.spec.ts — unmappable-columns error path (TST-03 / D-07).
 *
 * When all CSV headers are unrecognized (no description-equivalent column),
 * every data row is skipped. The parse_log captured at the documents-write
 * boundary must reflect rows_processed===0 and rows_skipped===data-row-count.
 *
 * All repositories and EmbeddingService are mocked — no DB, no OpenAI calls.
 * T-07-03: OPENAI_API_KEY is never set (EmbeddingService is fully mocked).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ParseLog } from '@edgevanta/types';
import { CsvIngestService } from '../csv-ingest.service';
import { EmbeddingService } from '../embedding.service';
import {
  CHUNK_REPOSITORY,
  IChunkRepository,
} from '../../database/interfaces/chunk.repository.interface';
import {
  BID_ITEM_REPOSITORY,
  IBidItemRepository,
} from '../../database/interfaces/bid-item.repository.interface';
import {
  DOCUMENT_REPOSITORY,
  IDocumentRepository,
} from '../../database/interfaces/document.repository.interface';

// ── Mock implementations ────────────────────────────────────────────────────

const mockEmbeddingService = {
  embed: jest.fn().mockResolvedValue([]),
};

const mockChunkRepo = {
  dualWriteChunk: jest.fn(),
};

const mockBidItemRepo = {
  insertBidItem: jest.fn(),
};

/** Captures the parse_log JSON written to the documents table. */
const mockDocumentRepo = {
  insertDocument: jest.fn(),
};

// ── Test suite ─────────────────────────────────────────────────────────────

describe('CsvIngestService — unmappable columns error path (TST-03 / D-07)', () => {
  let service: CsvIngestService;
  let module: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        CsvIngestService,
        {
          provide: EmbeddingService,
          useValue: mockEmbeddingService as unknown as EmbeddingService,
        },
        {
          provide: CHUNK_REPOSITORY,
          useValue: mockChunkRepo as unknown as IChunkRepository,
        },
        {
          provide: BID_ITEM_REPOSITORY,
          useValue: mockBidItemRepo as unknown as IBidItemRepository,
        },
        {
          provide: DOCUMENT_REPOSITORY,
          useValue: mockDocumentRepo as unknown as IDocumentRepository,
        },
      ],
    }).compile();

    service = module.get(CsvIngestService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('skips all rows when no header maps to a canonical field; parse_log shows rows_processed=0, rows_skipped=2', async () => {
    // CSV with 2 data rows but no description-equivalent or any known-canonical header
    const csvBuffer = Buffer.from('foo,bar\n1,2\n3,4\n');
    const file = {
      buffer: csvBuffer,
      originalname: 'bad.csv',
      mimetype: 'text/csv',
    } as unknown as Express.Multer.File;

    await service.ingest(file, 'doc-1');

    // ── EmbeddingService.embed called with [] (no valid chunks) ──────────────
    expect(mockEmbeddingService.embed).toHaveBeenCalledWith([]);

    // ── No chunk or bid_item writes (zero valid rows) ────────────────────────
    expect(mockChunkRepo.dualWriteChunk).not.toHaveBeenCalled();
    expect(mockBidItemRepo.insertBidItem).not.toHaveBeenCalled();

    // ── Capture the parse_log from insertDocument (4th argument) ─────────────
    expect(mockDocumentRepo.insertDocument).toHaveBeenCalledTimes(1);
    const [calledId, calledFilename, , parseLogJson] = mockDocumentRepo
      .insertDocument.mock.calls[0] as [string, string, string, string];

    expect(calledId).toBe('doc-1');
    expect(calledFilename).toBe('bad.csv');

    const parseLog = JSON.parse(parseLogJson) as ParseLog;

    // ── Both data rows were skipped — no description column ─────────────────
    expect(parseLog.rows_processed).toBe(0);
    expect(parseLog.rows_skipped).toBe(2);
    expect(parseLog.skip_reasons).toHaveLength(2);
  });
});
