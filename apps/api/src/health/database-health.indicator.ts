import { Injectable } from '@nestjs/common';
import {
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { DatabaseService } from '../database/database.service';

/**
 * DatabaseHealthIndicator — probes SQLite connectivity and sqlite-vec extension.
 *
 * Uses the modern terminus 11 API (HealthIndicatorService, not the deprecated
 * HealthIndicator base class). Reads through the shared DatabaseService handle
 * (DatabaseModule is @Global, so DI resolves without a local import).
 *
 * Security (T-06-01): on failure, only err.message is returned — never stack
 * traces, DB path, or env values.
 */
@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly databaseService: DatabaseService,
  ) {}

  isHealthy(key: string): HealthIndicatorResult {
    const indicator = this.healthIndicatorService.check(key);

    try {
      // Probe 1 — basic SQLite connectivity
      const selectOne = this.databaseService.database
        .prepare('SELECT 1 as ok')
        .get() as { ok: number } | undefined;

      // Probe 2 — sqlite-vec extension load verification
      const vecRow = this.databaseService.database
        .prepare('SELECT vec_version() as vec_version')
        .get() as { vec_version: string } | undefined;

      if (selectOne && vecRow?.vec_version) {
        return indicator.up({ db: 'ok', vec: 'ok' });
      }

      // Probes returned falsy results without throwing
      return indicator.down({
        db: selectOne ? 'ok' : 'down',
        vec: vecRow?.vec_version ? 'ok' : 'down',
        message: 'One or more health probes returned no result',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return indicator.down({
        db: 'down',
        vec: 'down',
        message,
      });
    }
  }
}
