/**
 * Pure helpers for legacy `/book/*` → `/booking` redirect shims (WS8).
 */

export type LegacySearchParams = Record<string, string | string[] | undefined>;

/** Copy query params from a Next.js searchParams object into URLSearchParams. */
export function legacySearchParamsToQuery(sp: LegacySearchParams): URLSearchParams {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) {
      for (const item of v) if (item) q.append(k, item);
    } else if (v != null && v !== "") {
      q.set(k, v);
    }
  }
  return q;
}

/** `/book/{slug}?…` → `/booking?slug={slug}&…` (drops duplicate `slug` key from incoming query). */
export function buildBookSlugRedirectQuery(
  providerSlug: string,
  sp: LegacySearchParams,
): URLSearchParams {
  const target = new URLSearchParams();
  target.set("slug", providerSlug);
  for (const [k, v] of Object.entries(sp)) {
    if (k === "slug") continue;
    if (Array.isArray(v)) {
      for (const item of v) if (item) target.append(k, item);
    } else if (v != null) {
      target.set(k, v);
    }
  }
  return target;
}

export function bookSlugRedirectPath(providerSlug: string, sp: LegacySearchParams): string {
  return `/booking?${buildBookSlugRedirectQuery(providerSlug, sp).toString()}`;
}

/** `/book/on-demand/*?…` → `/booking/on-demand/*?…` */
export function bookOnDemandRedirectPath(
  segment: "waiting" | "result",
  sp: LegacySearchParams,
): string {
  return `/booking/on-demand/${segment}?${legacySearchParamsToQuery(sp).toString()}`;
}

/**
 * `/book/continue?hold_id=…` → `/booking?slug=&hold_id=&step=pay&…`
 * Caller supplies `providerSlug` from hold lookup.
 */
export function buildBookContinueRedirectQuery(input: {
  holdId: string;
  providerSlug: string;
  embed: boolean;
  sp: LegacySearchParams;
}): URLSearchParams {
  const { holdId, providerSlug, embed, sp } = input;
  const target = new URLSearchParams();
  target.set("slug", providerSlug);
  target.set("hold_id", holdId.trim());
  target.set("step", "pay");
  if (embed) target.set("embed", "1");

  for (const [k, v] of Object.entries(sp)) {
    if (k === "hold_id" || k === "slug" || k === "step" || k === "embed") continue;
    if (Array.isArray(v)) {
      for (const item of v) if (item) target.append(k, item);
    } else if (v != null && v !== "") {
      target.set(k, v);
    }
  }
  return target;
}

export function bookContinueRedirectPath(input: {
  holdId: string;
  providerSlug: string;
  embed: boolean;
  sp: LegacySearchParams;
}): string {
  return `/booking?${buildBookContinueRedirectQuery(input).toString()}`;
}
