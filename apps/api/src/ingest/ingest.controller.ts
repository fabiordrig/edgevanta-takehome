import {
  BadRequestException,
  Controller,
  Logger,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as path from 'path';
import { IngestService } from './ingest.service';

const ALLOWED_EXT = new Set(['.csv', '.pdf']);

@Controller()
export class IngestController {
  private readonly logger = new Logger(IngestController.name);

  constructor(private readonly ingestService: IngestService) {}

  @Post('ingest')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }),
  )
  async ingest(
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ document_id: string; status: string; chunks_created: number }> {
    if (!file) {
      throw new BadRequestException(
        'No file uploaded — include a "file" field in multipart/form-data',
      );
    }

    const ext = path.extname(file.originalname).toLowerCase();

    if (!ALLOWED_EXT.has(ext)) {
      throw new BadRequestException('Only CSV and PDF files are accepted');
    }

    return this.ingestService.ingest(file);
  }
}
