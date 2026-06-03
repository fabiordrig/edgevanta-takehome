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

    const migrationSql = fs
      .readFileSync(
        path.join(__dirname, 'migrations', '001_init.sql'),
        'utf8',
      )
      .replace(/\{\{EMBEDDING_DIM\}\}/g, String(EMBEDDING_DIM));

    this.db.exec(migrationSql);

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
