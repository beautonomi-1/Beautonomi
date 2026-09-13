/** Accept `{ "de": "Fäden", "en": "Threading" }` from admin; drop empty / invalid codes. */
export function sanitizeCategoryNameI18n(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const code = key.trim();
    if (!/^[A-Za-z]{2,3}(-[A-Za-z]{2})?$/.test(code)) continue;
    if (typeof value !== "string") continue;
    const name = value.trim().slice(0, 80);
    if (!name) continue;
    out[code] = name;
  }
  return out;
}
