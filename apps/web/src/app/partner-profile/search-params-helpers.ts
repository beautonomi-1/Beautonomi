type SearchParamsLike = Record<string, string | string[] | undefined>;

export function parseCoord(val: string | string[] | undefined): number | undefined {
  if (typeof val !== "string") return undefined;
  const n = parseFloat(val);
  return Number.isNaN(n) ? undefined : n;
}

/** Decoded slug for provider lookup (matches page + metadata). */
export function parsePartnerProfileSlug(sp: SearchParamsLike): string | null {
  const raw =
    typeof sp.slug === "string"
      ? sp.slug
      : typeof sp.partnerId === "string"
        ? sp.partnerId
        : null;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
