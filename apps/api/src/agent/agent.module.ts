import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { VectorSearchService } from './vector-search.service';
import { BidAnalysisService } from './bid-analysis.service';
import { DocumentsService } from './documents.service';
import { EmbeddingService } from '../ingest/embedding.service';

/**
 * AgentModule — bundles all agent-layer services, the controller, and
 * the EmbeddingService that VectorSearchService requires.
 *
 * DatabaseModule is @Global (registered in AppModule) — NOT imported here.
 * ConfigModule is @Global — EmbeddingService's ConfigService resolves without
 * an explicit import.
 *
 * EmbeddingService is registered directly in this module (Option b from
 * 03-PATTERNS.md) to avoid cross-module coupling with IngestModule.
 * Both IngestModule and AgentModule register EmbeddingService independently —
 * NestJS creates separate provider instances per module, which is correct since
 * EmbeddingService has no shared mutable state (it is stateless except for the
 * injected OpenAI client).
 */
@Module({
  controllers: [AgentController],
  providers: [
    AgentService,
    VectorSearchService,
    BidAnalysisService,
    DocumentsService,
    EmbeddingService,
  ],
  exports: [AgentService],
})
export class AgentModule {}
