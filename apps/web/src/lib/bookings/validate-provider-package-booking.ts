import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aggregatePackageEntitlements,
  bookedOfferingCounts,
  bookedProductCounts,
  entitlementMismatch,
} from "@beautonomi/utils";

type PkgItem = {
  offering_id?: string | null;
  product_id?: string | null;
  product_variant_id?: string | null;
  quantity?: unknown;
};

/**
 * Ensures a provider-created booking's lines match `service_package_items`
 * for the selected catalog package (same rules as public `validateBooking`).
 */
export async function validateProviderCatalogPackageMatch(params: {
  supabaseAdmin: SupabaseClient;
  providerId: string;
  packageId: string;
  locationType: string;
  locationId: string | null | undefined;
  services: Array<{ offering_id?: string }>;
  products: Array<{
    product_id: string;
    product_variant_id?: string | null;
    quantity: number;
  }>;
  /**
   * When true, a package that includes service entitlements may be validated with an empty
   * `services` list (e.g. provider app creates `group_bookings` first, then attaches participants).
   * Product entitlements stay strict — add products on the same request or validate again after.
   */
  allowEmptyServices?: boolean;
}): Promise<
  | { ok: true; pkg: { price: number | null; discount_percentage: number | null } }
  | { ok: false; message: string; code: string }
> {
  const {
    supabaseAdmin,
    providerId,
    packageId,
    locationType,
    locationId,
    services,
    products,
    allowEmptyServices = false,
  } = params;

  const { data: pkg, error: pkgError } = await supabaseAdmin
    .from("service_packages")
    .select("id, provider_id, is_active, price, discount_percentage")
    .eq("id", packageId)
    .eq("provider_id", providerId)
    .maybeSingle();

  if (pkgError || !pkg) {
    return { ok: false, message: "Invalid package selection", code: "VALIDATION_ERROR" };
  }
  const pkgPricing = {
    price: (pkg as { price?: number | null }).price ?? null,
    discount_percentage: (pkg as { discount_percentage?: number | null }).discount_percentage ?? null,
  };
  if ((pkg as { is_active?: boolean }).is_active === false) {
    return {
      ok: false,
      message: "This package is no longer available for booking.",
      code: "PACKAGE_INACTIVE",
    };
  }

  if (locationType === "at_salon" && locationId) {
    const { data: allPkgLocs } = await supabaseAdmin
      .from("package_locations")
      .select("location_id")
      .eq("package_id", packageId);
    if (allPkgLocs && allPkgLocs.length > 0) {
      const allowed = new Set(allPkgLocs.map((r: { location_id: string }) => r.location_id));
      if (!allowed.has(locationId)) {
        return {
          ok: false,
          message: "Package not available at this location",
          code: "VALIDATION_ERROR",
        };
      }
    }
  }

  const { data: pkgItems, error: pkgItemsError } = await supabaseAdmin
    .from("service_package_items")
    .select("offering_id, product_id, product_variant_id, quantity")
    .eq("package_id", packageId);

  if (pkgItemsError) {
    return {
      ok: false,
      message: "We couldn't validate the selected package. Please try again.",
      code: "BOOKING_VALIDATION_FAILED",
    };
  }

  const { entitlementByOffering, entitlementByProduct } = aggregatePackageEntitlements(
    (pkgItems ?? []) as PkgItem[]
  );

  const hasPkgOfferingLines = entitlementByOffering.size > 0;
  const hasPkgProductLines = entitlementByProduct.size > 0;

  if ((pkgItems?.length ?? 0) > 0 && !hasPkgOfferingLines && services.length > 0) {
    return {
      ok: false,
      message: "This package does not include the selected services.",
      code: "VALIDATION_ERROR",
    };
  }

  if (hasPkgOfferingLines && services.length === 0 && !allowEmptyServices) {
    return {
      ok: false,
      message: "This package includes services; add the included services to the booking.",
      code: "PACKAGE_ENTITLEMENT_MISMATCH",
    };
  }

  if (hasPkgOfferingLines && !(allowEmptyServices && services.length === 0)) {
    const svcRows = services
      .map((s) => ({ offering_id: s.offering_id ?? "" }))
      .filter((s) => s.offering_id.length > 0);
    const bookedCounts = bookedOfferingCounts(svcRows, null);
    const badOffering = entitlementMismatch(bookedCounts, entitlementByOffering);
    if (badOffering) {
      return {
        ok: false,
        message:
          "Selected services must exactly match what this package includes.",
        code: "PACKAGE_ENTITLEMENT_MISMATCH",
      };
    }
  }

  if (hasPkgProductLines) {
    if (products.length === 0) {
      return {
        ok: false,
        message: "This package includes retail items; add those products to the booking.",
        code: "PACKAGE_ENTITLEMENT_MISMATCH",
      };
    }
    const bookedProd = bookedProductCounts(products);
    const badProduct = entitlementMismatch(bookedProd, entitlementByProduct);
    if (badProduct) {
      return {
        ok: false,
        message:
          "Selected products must exactly match what this package includes.",
        code: "PACKAGE_ENTITLEMENT_MISMATCH",
      };
    }
  }

  return { ok: true, pkg: pkgPricing };
}
