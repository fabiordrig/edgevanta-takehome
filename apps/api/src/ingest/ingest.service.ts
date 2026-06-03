import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { CsvIngestService } from './csv-ingest.service';
import { PdfIngestService } from './pdf-ingest.service';

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    private readonly csvIngestService: CsvIngestService,
    private readonly pdfIngestService: PdfIngestService,
  ) {}

  async ingest(
    file: Express.Multer.File,
  ): Promise<{ document_id: string; status: string; chunks_created: number }> {
    const documentId = uuidv4();

    this.logger.log(
      `Ingesting file: name=${file.originalname} mime=${file.mimetype}`,
    );

    const ext = path.extname(file.originalname).toLowerCase();
    const isCsv = ext === '.csv' || file.mimetype === 'text/csv';
    const isPdf = ext === '.pdf';

    if (isCsv) {
      return this.csvIngestService.ingest(file, documentId);
    } else if (isPdf) {
      return this.pdfIngestService.ingest(file, documentId);
    } else {
      throw new BadRequestException(`Unsupported file type: ${ext}`);
    }
  }
}
