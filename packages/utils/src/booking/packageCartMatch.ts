/**
 * Shared package ↔ cart matching for mixed `service_package_items`
 * (offerings + optional retail products). Used by API validation and customer UIs.
 */

export type PackageItemRow = {
  offering_id?: string | null;
  product_id?: string | null;
  product_variant_id?: string | null;
  quantity?: unknown;
};

/** Aggregate per-offering and per-product caps from `service_package_items` rows. */
export function aggregatePackageEntitlements(rows: PackageItemRow[] | null | undefined): {
  entitlementByOffering: Map<string, number>;
  entitlementByProduct: Map<string, number>;
} {
  const entitlementByOffering = new Map<string, number>();
  const entitlementByProduct = new Map<string, number>();
  for (const row of rows || []) {
    const q = Math.max(1, Math.floor(Number(row.quantity) || 1));
    const oid = row.offering_id?.trim();
    if (oid) {
      entitlementByOffering.set(oid, (entitlementByOffering.get(oid) ?? 0) + q);
    }
    const pid = row.product_id?.trim();
    if (pid) {
      entitlementByProduct.set(pid, (entitlementByProduct.get(pid) ?? 0) + q);
    }
  }
  return { entitlementByOffering, entitlementByProduct };
}

/** Count booked offerings (primary + group participants) — one draft.services row per slot. */
export function bookedOfferingCounts(
  services: Array<{ offering_id: string }>,
  groupParticipants?: Array<{ service_ids?: string[]; serviceIds?: string[] }> | null
): Map<string, number> {
  const booked = new Map<string, number>();
  for (const s of services) {
    booked.set(s.offering_id, (booked.get(s.offering_id) ?? 0) + 1);
  }
  if (groupParticipants?.length) {
    for (const p of groupParticipants) {
      const ids = p.service_ids ?? p.serviceIds ?? [];
      for (const id of ids) {
        booked.set(id, (booked.get(id) ?? 0) + 1);
      }
    }
  }
  return booked;
}

/** Sum quantities per product id from booking draft product lines. */
export function bookedProductCounts(
  products: Array<{ product_id?: string; productId?: string; quantity?: unknown }>
): Map<string, number> {
  const booked = new Map<string, number>();
  for (const p of products) {
    const pid = (p.productId ?? p.product_id)?.trim();
    if (!pid) continue;
    const qty = Math.max(1, Math.floor(Number(p.quantity) || 1));
    booked.set(pid, (booked.get(pid) ?? 0) + qty);
  }
  return booked;
}

export function exceedsEntitlement(
  booked: Map<string, number>,
  entitlement: Map<string, number>
): string | null {
  for (const [id, count] of Array.from(booked.entries())) {
    const allowed = entitlement.get(id) ?? 0;
    if (count > allowed) return id;
  }
  return null;
}

/** Product quantities required by a public `service_packages` payload (`items` with `type: "product"`). */
export function aggregatePackageProductRequirementsFromPublicPackage(pkg: {
  items?: Array<{ type?: string; id?: string; quantity?: number; product_variant_id?: string | null }>;
}): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of pkg.items ?? []) {
    if (it.type !== "product" || !it.id?.trim()) continue;
    const q = Math.max(1, Math.floor(Number(it.quantity) || 1));
    m.set(it.id.trim(), (m.get(it.id.trim()) ?? 0) + q);
  }
  return m;
}

/** Cart key is `productId` or `productId:variantId` (customer booking flows). */
export function aggregateProductCartByProductId(
  lines: Array<{ id: string; quantity: number }>
): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of lines) {
    const colon = p.id.indexOf(":");
    const pid = colon !== -1 ? p.id.slice(0, colon).trim() : p.id.trim();
    if (!pid) continue;
    m.set(pid, (m.get(pid) ?? 0) + p.quantity);
  }
  return m;
}

function packageServiceOfferingIdSet(pkg: {
  items?: Array<{ type?: string; id?: string }>;
  services?: Array<{ id: string }>;
}): Set<string> {
  if (pkg.services?.length) return new Set(pkg.services.map((s) => s.id).filter(Boolean));
  const ids: string[] = [];
  for (const it of pkg.items ?? []) {
    if (!it?.id) continue;
    if (it.type === "product") continue;
    if (it.type === "service" || !it.type) ids.push(it.id);
  }
  return new Set(ids);
}

/**
 * Strict bundle match for UI: service offering set equals package service lines (order-free),
 * and product quantities per `product_id` match package product lines.
 */
/** Same shape as express `?products=` JSON and AsyncStorage `beautonomi_booking_product_cart`. */
export type ExpressProductCartLine = {
  product_id: string;
  quantity: number;
  product_variant_id?: string | null;
};

/** Merge URL + package retail lines (same key = product_id + variant). */
export function mergeExpressProductCartLines(
  a: ExpressProductCartLine[],
  b: ExpressProductCartLine[]
): ExpressProductCartLine[] {
  const m = new Map<string, ExpressProductCartLine>();
  const key = (r: ExpressProductCartLine) => `${r.product_id}:${r.product_variant_id ?? ""}`;
  for (const r of [...a, ...b]) {
    const k = key(r);
    const cur = m.get(k);
    if (cur) m.set(k, { ...cur, quantity: Math.min(999, cur.quantity + r.quantity) });
    else m.set(k, { ...r });
  }
  return Array.from(m.values());
}

export type PublicProductCatalogRow = {
  id: string;
  name: string;
  price: number;
  currency: string;
  hasVariants?: boolean;
  variants?: Array<{
    id: string;
    retail_price: number;
    option_values?: Record<string, string>;
    quantity?: number;
  }>;
};

/** Build customer cart rows for mixed packages (first in-stock variant when `hasVariants`). */
export function buildRetailCartRowsFromPublicPackage(
  pkg: { items?: Array<{ type?: string; id?: string; quantity?: number; product_variant_id?: string | null }> },
  catalog: PublicProductCatalogRow[],
  currencyFallback: string
): Array<{ id: string; name: string; price: number; quantity: number; currency: string }> {
  const lines = (pkg.items ?? []).filter((i) => i.type === "product" && i.id?.trim());
  if (lines.length === 0) return [];
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const out: Array<{ id: string; name: string; price: number; quantity: number; currency: string }> = [];
  for (const line of lines) {
    const pid = line.id!.trim();
    const p = byId.get(pid);
    if (!p) continue;
    const qty = Math.max(1, Math.floor(Number(line.quantity) || 1));
    const cur = p.currency ?? currencyFallback;
    const requestedVariantId = line.product_variant_id?.trim();
    if (p.hasVariants && p.variants?.length) {
      const v =
        (requestedVariantId ? p.variants.find((x) => x.id === requestedVariantId) : null) ??
        p.variants.find((x) => (x.quantity ?? 0) > 0) ??
        p.variants[0];
      const label = v.option_values ? Object.values(v.option_values).join(" / ") : "";
      out.push({
        id: `${p.id}:${v.id}`,
        name: label ? `${p.name} — ${label}` : p.name,
        price: v.retail_price,
        quantity: qty,
        currency: cur,
      });
    } else {
      out.push({
        id: p.id,
        name: p.name,
        price: p.price,
        quantity: qty,
        currency: cur,
      });
    }
  }
  return out;
}

export function cartMatchesPublicCatalogPackage(
  serviceOfferingIds: string[],
  selectedProducts: Array<{ id: string; quantity: number }>,
  pkg: {
    items?: Array<{ type?: string; id?: string; quantity?: number }>;
    services?: Array<{ id: string }>;
  }
): boolean {
  const wantSvc = packageServiceOfferingIdSet(pkg);
  const gotSvc = new Set(serviceOfferingIds.filter(Boolean));
  if (wantSvc.size !== gotSvc.size) return false;
  let serviceIdsMatch = true;
  wantSvc.forEach((id) => {
    if (!gotSvc.has(id)) serviceIdsMatch = false;
  });
  if (!serviceIdsMatch) return false;

  const wantProd = aggregatePackageProductRequirementsFromPublicPackage(pkg);
  const gotProd = aggregateProductCartByProductId(selectedProducts);
  if (wantProd.size > 0) {
    if (wantProd.size !== gotProd.size) return false;
    for (const [k, v] of Array.from(wantProd.entries())) {
      if (gotProd.get(k) !== v) return false;
    }
  }
  return true;
}
