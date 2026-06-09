import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { DatabaseHealthIndicator } from './database-health.indicator';

/**
 * HealthModule — wires @nestjs/terminus for GET /health.
 *
 * DatabaseService is @Global (via DatabaseModule), so DatabaseHealthIndicator
 * resolves without importing DatabaseModule here — same pattern as AgentModule.
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator],
})
export class HealthModule {}
