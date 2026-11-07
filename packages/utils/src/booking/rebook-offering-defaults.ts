/**
 * Default rebook-reminder settings for newly created offerings only (no backfill).
 */

function inferWeeksFromHints(categorySlug: string | null | undefined, title: string | null | undefined): number {
  const slug = (categorySlug ?? "").toLowerCase();
  const name = (title ?? "").toLowerCase();
  const haystack = `${slug} ${name}`;
  if (/\bnail|manicure|pedicure\b/.test(haystack)) return 3;
  if (/\bhair|braid|weave|wig|loc\b/.test(haystack)) return 6;
  if (/\blash|brow|lash\b/.test(haystack)) return 4;
  return 4;
}

export function defaultRebookReminderForNewOffering(input: {
  categorySlug?: string | null;
  title?: string | null;
  reminder_to_rebook_enabled?: boolean | null | undefined;
  reminder_to_rebook_weeks?: number | null | undefined;
}): { reminder_to_rebook_enabled: boolean; reminder_to_rebook_weeks: number } {
  if (input.reminder_to_rebook_enabled !== undefined && input.reminder_to_rebook_enabled !== null) {
    return {
      reminder_to_rebook_enabled: Boolean(input.reminder_to_rebook_enabled),
      reminder_to_rebook_weeks:
        typeof input.reminder_to_rebook_weeks === "number" && Number.isFinite(input.reminder_to_rebook_weeks)
          ? Math.max(1, Math.trunc(input.reminder_to_rebook_weeks))
          : 4,
    };
  }
  return {
    reminder_to_rebook_enabled: true,
    reminder_to_rebook_weeks: inferWeeksFromHints(input.categorySlug, input.title),
  };
}
