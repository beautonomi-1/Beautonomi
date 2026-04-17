/** Matches web `isBlankHtmlContent` — empty Quill / rich-text doc (no API dep in admin SPA). */
export function isBlankHtmlContent(html: string): boolean {
  const stripped = String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length === 0;
}
