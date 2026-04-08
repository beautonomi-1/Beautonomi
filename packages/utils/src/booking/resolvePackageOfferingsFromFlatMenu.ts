/**
 * Resolve `service_package_items` offering ids against the **nested** provider menu
 * (`/api/public/providers/{slug}/services`), including **variant** ids — matches customer app `applyMultiFromIds`.
 */

export type ProviderServiceVariantLike = {
  id: string;
  title?: string;
  duration_minutes?: number;
  price?: number;
  buffer_minutes?: number;
};

export type ProviderServiceLike = {
  id: string;
  title?: string;
  duration_minutes?: number;
  price?: number;
  currency?: string;
  buffer_minutes?: number;
  variants?: ProviderServiceVariantLike[];
};

export type ResolvedOfferingLine = {
  offeringId: string;
  title: string;
  duration_minutes: number;
  buffer_minutes: number;
  price: number;
  currency: string;
};

const DEFAULT_BUFFER_MINUTES = 15;

function resolveBufferMinutes(svc: ProviderServiceLike, variantId: string | null): number {
  const v = variantId ? svc.variants?.find((x) => x.id === variantId) : svc.variants?.[0];
  if (v?.buffer_minutes != null && Number.isFinite(v.buffer_minutes)) return Number(v.buffer_minutes);
  if (svc.buffer_minutes != null && Number.isFinite(svc.buffer_minutes)) return Number(svc.buffer_minutes);
  return DEFAULT_BUFFER_MINUTES;
}

export type ResolvePackageOfferingsMode = "strict" | "skip";

/**
 * @param lineIds — offering ids from `service_package_items` (may be base or variant ids).
 * @param flat — `categories.flatMap((c) => c.services ?? [])` from provider services API.
 * @param tenantCurrencyFallback — when `svc.currency` is missing.
 * @param mode — **strict**: return null if any id cannot be resolved; **skip**: omit unknown ids (multi-service URL prefill on mobile).
 */
export function resolvePackageOfferingsFromFlatMenu(
  lineIds: string[],
  flat: ProviderServiceLike[],
  tenantCurrencyFallback: string,
  mode: ResolvePackageOfferingsMode = "strict"
): ResolvedOfferingLine[] | null {
  if (!lineIds.length || !flat.length) return null;

  const out: ResolvedOfferingLine[] = [];

  for (const raw of lineIds) {
    const oid = raw.trim();
    if (!oid) continue;

    let svc: ProviderServiceLike | undefined;
    let v: ProviderServiceVariantLike | undefined;

    for (const s of flat) {
      const hit = s.variants?.find((vr) => vr.id === oid);
      if (hit) {
        svc = s;
        v = hit;
        break;
      }
    }

    if (!svc) {
      svc = flat.find((s) => s.id === oid);
      if (!svc) {
        if (mode === "strict") return null;
        continue;
      }
      if (svc.variants?.length) {
        v = svc.variants[0];
      }
    }

    const offeringId = v?.id ?? svc!.id;
    const dur = v?.duration_minutes ?? svc!.duration_minutes ?? 60;
    const price = v?.price ?? svc!.price ?? 0;
    const currency = svc!.currency ?? tenantCurrencyFallback;
    const buf = resolveBufferMinutes(svc!, v?.id ?? null);

    out.push({
      offeringId,
      title: v?.title ?? svc!.title ?? "",
      duration_minutes: dur,
      buffer_minutes: buf,
      price,
      currency,
    });
  }

  if (out.length === 0) return null;
  return out;
}

/** Flatten `ProviderServicesResponse`-shaped JSON to a menu array. */
export function flattenProviderServicesToMenu(
  categories: Array<{ services?: ProviderServiceLike[] }> | undefined | null
): ProviderServiceLike[] {
  if (!categories?.length) return [];
  return categories.flatMap((c) => c.services ?? []);
}
