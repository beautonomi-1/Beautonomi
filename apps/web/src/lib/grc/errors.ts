/**
 * Errors thrown by GRC routes. `handleApiError` maps any Error with a numeric 4xx `status`
 * to that status and `code`, so these never surface as 500s.
 */
export class GrcHttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "GrcHttpError";
    this.status = status;
    this.code = code;
  }
}

export const grcForbidden = (message: string) => new GrcHttpError(message, 403, "GRC_FORBIDDEN");
export const grcBadRequest = (message: string) => new GrcHttpError(message, 400, "GRC_VALIDATION");
export const grcNotFound = (message: string) => new GrcHttpError(message, 404, "GRC_NOT_FOUND");
export const grcConflict = (message: string) => new GrcHttpError(message, 409, "GRC_CONFLICT");

/**
 * Translate a Postgres/PostgREST error raised by GRC RPCs and triggers into an HTTP error.
 * RPCs raise `GRC_FORBIDDEN:`, `GRC_SOD:`, `GRC_INVALID:` or `GRC_NOT_FOUND:` prefixed messages.
 */
export function grcFromDbError(error: { message?: string; code?: string } | null | undefined): Error {
  const message = error?.message ?? "Database error";
  if (message.startsWith("GRC_FORBIDDEN")) return new GrcHttpError(message.replace(/^GRC_FORBIDDEN:\s*/, "Not permitted: "), 403, "GRC_FORBIDDEN");
  if (message.startsWith("GRC_SOD")) return new GrcHttpError(message.replace(/^GRC_SOD:\s*/, ""), 409, "GRC_SEGREGATION_OF_DUTIES");
  if (message.startsWith("GRC_INVALID")) return new GrcHttpError(message.replace(/^GRC_INVALID:\s*/, ""), 400, "GRC_VALIDATION");
  if (message.startsWith("GRC_NOT_FOUND")) return new GrcHttpError(message.replace(/^GRC_NOT_FOUND:\s*/, ""), 404, "GRC_NOT_FOUND");
  if (error?.code === "42501") return new GrcHttpError("Not permitted by row-level security", 403, "GRC_FORBIDDEN");
  if (error?.code === "23505") return new GrcHttpError("A record with these details already exists", 409, "GRC_CONFLICT");
  if (error?.code === "23503") return new GrcHttpError("A referenced record does not exist", 400, "GRC_VALIDATION");
  if (error?.code === "23514" || error?.code === "22P02") return new GrcHttpError(message, 400, "GRC_VALIDATION");
  return new Error(message);
}
