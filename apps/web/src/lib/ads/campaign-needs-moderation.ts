/**
 * True when a campaign uses custom creative and must pass admin moderation
 * before serving. Pack/time campaigns without custom fields auto-approve.
 */
export function campaignNeedsModeration(
  targeting: Record<string, unknown> | null | undefined,
  bidSettings?: Record<string, unknown> | null | undefined,
): boolean {
  const t = targeting ?? {};
  const b = bidSettings ?? {};
  return Boolean(
    (typeof t.custom_headline === "string" && t.custom_headline.trim()) ||
      (typeof t.custom_image_url === "string" && t.custom_image_url.trim()) ||
      (typeof t.custom_creative === "object" && t.custom_creative !== null) ||
      (typeof b.custom_creative === "object" && b.custom_creative !== null) ||
      (typeof b.custom_headline === "string" && b.custom_headline.trim()),
  );
}
