import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './database-health.indicator';

/**
 * HealthController — exposes GET /health.
 *
 * Delegates to HealthCheckService which aggregates all registered indicators.
 * Terminus automatically returns:
 *   - HTTP 200 with status "ok" when all indicators are up
 *   - HTTP 503 (ServiceUnavailableException) when any indicator is down
 *
 * No manual @HttpCode or @Res handling — terminus drives 200/503 (D-01, D-02).
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly dbIndicator: DatabaseHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([() => this.dbIndicator.isHealthy('database')]);
  }
}
