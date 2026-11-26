import { ArgumentsHost, Catch, HttpException, Logger, type ExceptionFilter } from "@nestjs/common";
import { ConflictError, NotFoundError, ValidationError } from "@app/db";

interface JsonResponse {
  status(code: number): { json(body: unknown): unknown };
}

/** Maps domain errors to HTTP status codes with a JSON body the UI can show. */
@Catch()
export class ErrorsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Errors");

  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<JsonResponse>();
    const send = (status: number, message: string) => res.status(status).json({ statusCode: status, message });

    if (error instanceof HttpException) {
      const body = error.getResponse();
      const message = typeof body === "string" ? body : ((body as { message?: unknown }).message ?? error.message);
      return send(error.getStatus(), Array.isArray(message) ? message.join("; ") : String(message));
    }
    if (error instanceof ValidationError) return send(400, error.message);
    if (error instanceof NotFoundError) return send(404, error.message);
    if (error instanceof ConflictError) return send(409, error.message);

    this.logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    return send(500, "Internal server error");
  }
}
