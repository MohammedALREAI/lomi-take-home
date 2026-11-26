// Domain errors the API maps to HTTP status codes.

export class NotFoundError extends Error {
  override name = "NotFoundError";
}

/** The request is valid but the current state does not allow it (HTTP 409). */
export class ConflictError extends Error {
  override name = "ConflictError";
}

export class ValidationError extends Error {
  override name = "ValidationError";
}
