import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * LoggingInterceptor — global HTTP request/response logger (OBS-02).
 *
 * Emits one structured log line per HTTP request in the format:
 *   METHOD ROUTE STATUS LATENCYms
 * e.g. POST /agent/chat 200 342ms
 *
 * Registered globally via app.useGlobalInterceptors() in main.ts (D-04).
 * Uses NestJS Logger with context 'HTTP' (D-06) — no external infra required.
 *
 * IMPORTANT — raw @Res() endpoints (e.g. POST /agent/chat):
 *   The chat handler uses @Res() + manual res.write() and returns void
 *   synchronously after setting up the SSE subscription. The interceptor's
 *   Observable completes immediately when the handler returns, so the logged
 *   latency for /agent/chat reflects handler setup time, not the full SSE
 *   stream duration. This is correct and expected per D-05.
 *
 * Security (T-06-04): logs only method, route, status, and latency —
 * never request bodies, query parameters, headers, or auth tokens.
 * Errors log status only; the exception filter owns error bodies.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = Date.now();
    const http = context.switchToHttp();
    const req = http.getRequest<{ method: string; originalUrl?: string; url: string }>();
    const res = http.getResponse<{ statusCode: number }>();

    const method = req.method;
    const route = req.originalUrl ?? req.url;

    const log = (): void => {
      const ms = Date.now() - start;
      const status = res.statusCode;
      this.logger.log(`${method} ${route} ${status} ${ms}ms`);
    };

    return next.handle().pipe(
      tap({
        complete: log,
        error: log,
      }),
    );
  }
}
