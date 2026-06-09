import { Module, Global } from '@nestjs/common';
import { DatabaseService } from './database.service';
import {
  CHUNK_REPOSITORY,
} from './interfaces/chunk.repository.interface';
import {
  BID_ITEM_REPOSITORY,
} from './interfaces/bid-item.repository.interface';
import {
  DOCUMENT_REPOSITORY,
} from './interfaces/document.repository.interface';
import { ChunkRepository } from './repositories/chunk.repository';
import { BidItemRepository } from './repositories/bid-item.repository';
import { DocumentRepository } from './repositories/document.repository';

/**
 * DatabaseModule — @Global module that owns all data access infrastructure.
 *
 * Provides and exports:
 *   - DatabaseService (raw better-sqlite3 instance, used internally by repos)
 *   - CHUNK_REPOSITORY → ChunkRepository (chunks + vec_chunks SQL)
 *   - BID_ITEM_REPOSITORY → BidItemRepository (bid_items SQL)
 *   - DOCUMENT_REPOSITORY → DocumentRepository (documents SQL)
 *
 * Because this module is @Global, AgentModule and IngestModule can inject
 * repository tokens without importing DatabaseModule explicitly (D-03).
 *
 * Security (T-05-04): the build step verifies the DI graph resolves before ship.
 * All three repository tokens must be in both `providers` and `exports` to
 * prevent UNKNOWN_DEPENDENCIES errors in consuming modules (RESEARCH Pitfall 4).
 */
@Global()
@Module({
  providers: [
    DatabaseService,
    { provide: CHUNK_REPOSITORY, useClass: ChunkRepository },
    { provide: BID_ITEM_REPOSITORY, useClass: BidItemRepository },
    { provide: DOCUMENT_REPOSITORY, useClass: DocumentRepository },
  ],
  exports: [
    DatabaseService,
    CHUNK_REPOSITORY,
    BID_ITEM_REPOSITORY,
    DOCUMENT_REPOSITORY,
  ],
})
export class DatabaseModule {}
