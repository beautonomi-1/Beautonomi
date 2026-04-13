/** Pure string helpers (no DOM / DOMPurify) — safe for all Vitest environments. */

/** True when there is no user-visible text (e.g. empty Quill doc `<p><br></p>`). */
export function isBlankHtmlContent(html: string): boolean {
  const stripped = String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length === 0;
}

/** Plain text for contexts that cannot render HTML (e.g. React Native lists). */
export function stripHtmlToPlainText(html: string): string {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
