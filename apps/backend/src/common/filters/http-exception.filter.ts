import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Standard HTTP status phrase for common codes. Used to fill in `error`
 * when the underlying `HttpException` only provided a string body (e.g.
 * passport's `UnauthorizedException` which sends `"Unauthorized"` as a
 * plain string rather than an object).
 */
const STATUS_PHRASE: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

/**
 * Global exception filter — conforms all error responses to the CLAUDE.md
 * envelope:
 *
 *   { statusCode, message, error, timestamp, path }
 *
 * Behaviour:
 *   - `HttpException` (and subclasses like `BadRequestException`,
 *     `ForbiddenException`, `UnauthorizedException`, etc.) pass their
 *     `getStatus()` / `getResponse()` through and we just add `timestamp`
 *     + `path`. If the inner response is a plain object (Nest's default for
 *     validation errors), we preserve its `message` and `error` fields.
 *   - Any other thrown value is logged and masked as a 500 "Internal server
 *     error" — we do NOT leak stack traces or raw error messages to clients.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      // Default `error` to the standard phrase for this status code; the
      // inner `getResponse()` may override it if it carried one.
      error = STATUS_PHRASE[status] ?? 'Error';

      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (res !== null && typeof res === 'object') {
        const obj = res as Record<string, unknown>;
        if (obj.message !== undefined) {
          message = obj.message as string | string[];
        } else {
          message = exception.message;
        }
        if (typeof obj.error === 'string') {
          error = obj.error;
        }
      }
    } else if (exception instanceof Error) {
      // Unexpected error — log full stack for ops but hide from client.
      this.logger.error(`Unhandled ${exception.name}: ${exception.message}`, exception.stack);
    } else {
      this.logger.error(`Unhandled non-Error thrown: ${String(exception)}`);
    }

    response.status(status).json({
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
