import { isUuid } from "@/lib/safety/resolve-reported-user";

/** Description minimum matches POST /api/reports for safety_report_user. */
export function canSubmitUserReport(identifier: string, description: string): boolean {
  return identifier.trim().length >= 2 && description.trim().length >= 10;
}

/**
 * The reports route keeps `reported_user_id` only when it is a UUID.
 * Anything else, including a handle that contains a dash, must be `reported_handle`.
 */
export function buildUserReportPayload(identifier: string, description: string): Record<string, string> {
  const trimmedId = identifier.trim();
  const payload: Record<string, string> = {
    report_type: "safety_report_user",
    description: description.trim(),
  };
  if (isUuid(trimmedId)) {
    payload.reported_user_id = trimmedId;
  } else {
    payload.reported_handle = trimmedId.replace(/^@+/, "");
  }
  return payload;
}
