/**
 * Drafts are not published. Persist null so the column default (now()) does not
 * stamp a publish time. Callers must write the value, including null.
 * Publish sets an explicit timestamp.
 */
export function explorePostPublishedAtForWrite(
  status: unknown,
  nowIso: string,
): string | null {
  return status === "published" ? nowIso : null;
}
