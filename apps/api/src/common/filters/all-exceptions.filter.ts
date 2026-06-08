import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * AllExceptionsFilter — global exception filter normalizing all errors to structured JSON.
 *
 * Catches every unhandled exception across the application (ENG-02 / D-17).
 * Returns { statusCode, message, error } — NEVER includes stack trace in the response
 * body (T-05-06 / Information Disclosure prevention).
 *
 * Registered via app.useGlobalFilters() in main.ts. Fires for:
 *  - HTTP exceptions thrown by guards, pipes, interceptors, or controllers
 *  - Unexpected runtime errors (non-HttpException)
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error';

    // Log full stack server-side only — never in body (ENG-02 / T-05-06)
    this.logger.error(
      `Exception [${status}]: ${message}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(status).json({
      statusCode: status,
      message,
      error: HttpStatus[status] ?? 'Unknown',
    });
  }
}
