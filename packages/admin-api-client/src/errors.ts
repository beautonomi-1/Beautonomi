export class AdminApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

export function isUnauthorizedStatus(status: number): boolean {
  return status === 401;
}

export function isForbiddenStatus(status: number): boolean {
  return status === 403;
}
