import { errorResponse } from "./api-helpers";

/** Postgres undefined_table — relation does not exist (migration not applied). */
export function isMissingRelationError(
  error: { code?: string | null } | null | undefined,
): boolean {
  return error?.code === "42P01";
}

export function migrationRequiredResponse(feature: string) {
  return errorResponse(
    `${feature} requires a database migration that has not been applied`,
    "MIGRATION_REQUIRED",
    503,
  );
}
