/**
 * ID helpers
 */

/** Standard UUID v4 pattern (loose). */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Prefix for solo placeholder staff id in public booking (`provider-{uuid}`). */
export const SYNTHETIC_PROVIDER_STAFF_PREFIX = "provider-";

export function isUuidString(s: string): boolean {
  return UUID_RE.test(s);
}

/**
 * Public book flow uses `provider-{uuid}` when a provider has no `provider_staff` rows (solo placeholder).
 * Returns the provider id when the pattern is valid, otherwise null.
 */
export function parseSyntheticProviderStaffId(staffId: string | null | undefined): string | null {
  if (!staffId || !staffId.startsWith(SYNTHETIC_PROVIDER_STAFF_PREFIX)) return null;
  const uuid = staffId.slice(SYNTHETIC_PROVIDER_STAFF_PREFIX.length);
  if (!UUID_RE.test(uuid)) return null;
  return uuid;
}

/** Real `provider_staff` id or synthetic solo id accepted by public booking APIs. */
export function isPublicStaffIdForBooking(s: string): boolean {
  return isUuidString(s) || parseSyntheticProviderStaffId(s) !== null;
}

/**
 * Map public API staff id to DB: synthetic `provider-{uuid}` → null (FK is `provider_staff`);
 * keep `syntheticToken` for metadata / UI.
 */
export function normalizePublicStaffIdForDatabase(staffId: string | null | undefined): {
  dbStaffId: string | null;
  syntheticToken: string | null;
} {
  if (staffId == null || staffId === "") {
    return { dbStaffId: null, syntheticToken: null };
  }
  const syn = parseSyntheticProviderStaffId(staffId);
  if (syn != null) {
    return { dbStaffId: null, syntheticToken: staffId };
  }
  return { dbStaffId: staffId, syntheticToken: null };
}

export function generateId(length = 12): string {
  return Math.random().toString(36).slice(2, 2 + length);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
