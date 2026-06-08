import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMBEDDING_DIM } from '@edgevanta/types';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private db!: Database.Database;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const dbPath =
      this.config.get<string>('DB_PATH') ??
      path.join(__dirname, '..', '..', 'db', 'database.sqlite');

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    this.db = new Database(dbPath);
    sqliteVec.load(this.db);

    // ── Run-once sorted-glob migration runner ─────────────────────────────────
    // (a) Ensure bookkeeping table exists — safe to run on every startup.
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)',
    );

    // (b) Discover all *.sql files in the migrations directory, sorted ascending
    //     by filename so 001_init.sql runs before 002_contractor.sql.
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    // (c) Apply each migration file exactly once.
    for (const filename of migrationFiles) {
      const alreadyApplied = this.db
        .prepare('SELECT 1 FROM schema_migrations WHERE filename = ?')
        .get(filename);

      if (alreadyApplied) {
        this.logger.debug(`Migration already applied, skipping: ${filename}`);
        continue;
      }

      const sqlContent = fs
        .readFileSync(path.join(migrationsDir, filename), 'utf8')
        .replace(/\{\{EMBEDDING_DIM\}\}/g, String(EMBEDDING_DIM));

      this.db.exec(sqlContent);
      this.db
        .prepare('INSERT INTO schema_migrations (filename) VALUES (?)')
        .run(filename);

      this.logger.log(`Applied migration: ${filename}`);
    }

    // ── sqlite-vec health check ────────────────────────────────────────────────
    const row = this.db
      .prepare('SELECT vec_version() as vec_version')
      .get() as { vec_version: string } | undefined;

    if (!row?.vec_version) {
      throw new Error(
        'sqlite-vec failed to load — vec_version() returned null',
      );
    }

    this.logger.log(`sqlite-vec loaded: ${row.vec_version}`);
  }

  onModuleDestroy(): void {
    if (this.db?.open) {
      this.db.close();
      this.logger.log('SQLite connection closed');
    }
  }

  get database(): Database.Database {
    return this.db;
  }
}
