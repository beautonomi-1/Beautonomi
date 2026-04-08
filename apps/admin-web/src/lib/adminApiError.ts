import { AdminApiError, isForbiddenStatus, isUnauthorizedStatus } from "@beautonomi/admin-api-client";

export function isAdminApiForbidden(error: unknown): error is AdminApiError {
  return error instanceof AdminApiError && isForbiddenStatus(error.status);
}

/** Treat 401 like forbidden for admin page UX when bootstrap already passed (rare). */
export function isAdminApiAuthFailure(error: unknown): error is AdminApiError {
  return error instanceof AdminApiError && (isUnauthorizedStatus(error.status) || isForbiddenStatus(error.status));
}
