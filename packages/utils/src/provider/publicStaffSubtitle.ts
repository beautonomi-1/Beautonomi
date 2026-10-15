/**
 * Line under a person's name on a customer staff card.
 *
 * `provider_staff.role` is a workplace permission (`owner`, `manager`,
 * `employee`). The public staff API also used to fill in "Staff" and
 * "Your specialist". None of those is a name, so they are not shown.
 * Any other non-empty string is kept. No public title is stored today.
 */
const HIDDEN_PUBLIC_STAFF_SUBTITLES = new Set([
  "owner",
  "manager",
  "employee",
  "admin",
  "provider_owner",
  "provider_manager",
  "provider_staff",
  "staff",
  "your specialist",
]);

export function publicStaffSubtitle(role: string | null | undefined): string | null {
  if (typeof role !== "string") return null;
  const trimmed = role.trim();
  if (!trimmed) return null;
  if (HIDDEN_PUBLIC_STAFF_SUBTITLES.has(trimmed.toLowerCase())) return null;
  return trimmed;
}
