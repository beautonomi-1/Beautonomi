import type { SupabaseClient } from "@supabase/supabase-js";
import { computeCatalogPackageServiceDiscount } from "@beautonomi/utils";
import { validateProviderCatalogPackageMatch } from "@/lib/bookings/validate-provider-package-booking";

export type GroupProductLike = Record<string, unknown>;

export function groupProductLineTotal(product: GroupProductLike): number {
  const qty = Math.max(1, Number(product.quantity ?? 1) || 1);
  return Math.max(
    0,
    Number(
      product.total_price ??
        product.totalPrice ??
        (Number(product.unit_price ?? product.unitPrice ?? 0) || 0) * qty,
    ) || 0,
  );
}

export function normalizeGroupProductRows(products: GroupProductLike[]) {
  return products
    .map((p) => ({
      product_id: String(p.product_id ?? p.productId ?? ""),
      product_variant_id: (p.product_variant_id ?? p.productVariantId ?? null) as string | null,
      quantity: Math.max(1, Math.floor(Number(p.quantity) || 1)),
    }))
    .filter((p) => p.product_id.length > 0);
}

export function groupParticipantServiceRows(
  participants: Array<Record<string, unknown>>,
  fallbackServiceId?: string | null,
) {
  return participants
    .map((p) => ({
      offering_id: String(p.service_id ?? p.serviceId ?? fallbackServiceId ?? ""),
    }))
    .filter((p) => p.offering_id.length > 0);
}

export function groupPackageTotal(params: {
  participantTotal: number;
  productTotal: number;
  travelFee: number;
  packageDiscount: number;
}) {
  return (
    Math.max(0, params.participantTotal - params.packageDiscount) +
    Math.max(0, params.productTotal) +
    Math.max(0, params.travelFee)
  );
}

export async function validateAndPriceGroupPackage(params: {
  supabaseAdmin: SupabaseClient;
  providerId: string;
  packageId: string | null | undefined;
  locationType: string;
  locationId: string | null | undefined;
  participantRows: Array<Record<string, unknown>>;
  fallbackServiceId?: string | null;
  productRows: GroupProductLike[];
  participantTotal: number;
}): Promise<
  | { ok: true; packageDiscount: number }
  | { ok: false; message: string; code: string }
> {
  if (!params.packageId) {
    return { ok: true, packageDiscount: 0 };
  }

  const validation = await validateProviderCatalogPackageMatch({
    supabaseAdmin: params.supabaseAdmin,
    providerId: params.providerId,
    packageId: params.packageId,
    locationType: params.locationType,
    locationId: params.locationId,
    services: groupParticipantServiceRows(params.participantRows, params.fallbackServiceId),
    products: normalizeGroupProductRows(params.productRows),
  });

  if (validation.ok === false) return validation;

  return {
    ok: true,
    packageDiscount: computeCatalogPackageServiceDiscount(
      validation.pkg,
      Math.max(0, params.participantTotal),
    ),
  };
}
