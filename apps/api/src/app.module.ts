import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { IngestModule } from './ingest/ingest.module';
import { AgentModule } from './agent/agent.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    IngestModule,
    AgentModule,
    HealthModule,
  ],
})
export class AppModule {}
