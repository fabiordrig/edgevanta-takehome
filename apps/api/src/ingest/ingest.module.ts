import { Module } from '@nestjs/common';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';
import { CsvIngestService } from './csv-ingest.service';
import { PdfIngestService } from './pdf-ingest.service';
import { EmbeddingService } from './embedding.service';

@Module({
  controllers: [IngestController],
  providers: [
    IngestService,
    CsvIngestService,
    PdfIngestService,
    EmbeddingService,
  ],
  exports: [IngestService],
})
export class IngestModule {}
