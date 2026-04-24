/** Normalize `useApi` payloads from `/api/provider/packages` and `/api/provider/products`. */

export function normalizePackagesList(data: unknown): unknown[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  const o = data as { packages?: unknown; data?: { packages?: unknown } };
  const list = o.packages ?? o.data?.packages;
  return Array.isArray(list) ? list : [];
}

function variantLabelFromOptionValues(optionValues: unknown): string {
  // §Provider-audit 2026-04 (round 5): `product_variants` stores the
  // differentiating options as JSONB `option_values` (e.g.
  // { "Size": "250ml", "Colour": "Red" }) — there is no `name` column.
  // Some older rows / mock data shape this as { label } or { name }; we
  // accept either so the booking flow and ecommerce list show "250ml ·
  // Red" instead of "undefined" or "NaN" in the variant picker.
  if (!optionValues || typeof optionValues !== "object") return "Variant";
  const asRecord = optionValues as Record<string, unknown>;
  if (typeof asRecord.label === "string" && asRecord.label.trim()) return asRecord.label.trim();
  if (typeof asRecord.name === "string" && asRecord.name.trim()) return asRecord.name.trim();
  const parts = Object.values(asRecord)
    .filter((v): v is string | number => typeof v === "string" || typeof v === "number")
    .map((v) => String(v).trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Variant";
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeProductsList(data: unknown): unknown[] {
  if (data == null) return [];
  const raw = Array.isArray(data)
    ? data
    : (() => {
        const o = data as { products?: unknown };
        return Array.isArray(o.products) ? o.products : [];
      })();

  // §Provider-audit 2026-04 (round 5): the API returns products with a
  // `retail_price` column (DB schema from migration 285) plus
  // `product_variants`/`variants` sub-rows using `retail_price` +
  // `option_values`. Historical client code expected a normalised
  // `{ price, variants: [{ id, name, price }] }` shape and rendered
  // "R NaN" whenever it received the raw DB shape (the exact bug
  // reported on the new-booking flow and ecommerce product picker).
  // Normalise here so every caller sees a consistent shape.
  return raw.map((p) => {
    const record = (p ?? {}) as Record<string, unknown>;
    const retail = toFiniteNumber(record.retail_price ?? record.price);
    const rawVariants =
      (record.variants as unknown[] | undefined) ??
      (record.product_variants as unknown[] | undefined) ??
      [];
    const variants = Array.isArray(rawVariants)
      ? rawVariants.map((v) => {
          const vr = (v ?? {}) as Record<string, unknown>;
          const existingName =
            typeof vr.name === "string" && vr.name.trim() ? vr.name.trim() : null;
          const label = existingName ?? variantLabelFromOptionValues(vr.option_values);
          return {
            ...vr,
            id: vr.id,
            name: label,
            price: toFiniteNumber(vr.retail_price ?? vr.price, retail),
          };
        })
      : [];
    return {
      ...record,
      price: retail,
      variants,
    };
  });
}
