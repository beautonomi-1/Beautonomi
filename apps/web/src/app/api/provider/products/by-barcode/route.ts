import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";

const PRODUCT_SELECT =
  "id, name, barcode, sku, quantity, retail_price, image_urls, has_variants, retail_sales_enabled, track_stock_quantity";

const VARIANT_SELECT =
  "id, product_id, option_values, sku, barcode, quantity, retail_price";

const VARIANT_LIST_SELECT = "id, option_values, sku, barcode, quantity, retail_price";

type ProductRow = {
  id: string;
  name: string;
  barcode?: string | null;
  sku?: string | null;
  quantity?: number | null;
  retail_price?: number | string | null;
  image_urls?: string[] | null;
  has_variants?: boolean | null;
  retail_sales_enabled?: boolean | null;
  track_stock_quantity?: boolean | null;
};

type VariantRow = {
  id: string;
  product_id?: string;
  option_values?: Record<string, string> | null;
  sku?: string | null;
  barcode?: string | null;
  quantity?: number | null;
  retail_price?: number | string | null;
};

type SupabaseClient = Awaited<ReturnType<typeof getSupabaseServer>>;

async function loadVariantsForProduct(supabase: SupabaseClient, productId: string) {
  const { data, error } = await supabase
    .from("product_variants")
    .select(VARIANT_LIST_SELECT)
    .eq("product_id", productId);
  if (error) return [];
  return (data ?? []) as VariantRow[];
}

async function loadActiveProductForProvider(
  supabase: SupabaseClient,
  productId: string,
  providerId: string,
): Promise<ProductRow | null> {
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", productId)
    .eq("provider_id", providerId)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data) return null;
  return data as ProductRow;
}

function retailBlockedResponse() {
  return errorResponse(
    "This product is not available for retail sale",
    "NOT_FOR_RETAIL",
    400,
  );
}

function ambiguousResponse() {
  return errorResponse(
    "Multiple products match this barcode or SKU — fix duplicates in your catalogue",
    "AMBIGUOUS_BARCODE",
    409,
  );
}

function buildSellPayload(product: ProductRow, variant: VariantRow | undefined, allVariants: VariantRow[]) {
  const needsVariant = Boolean(product.has_variants && !variant);
  return {
    product,
    variant: variant ?? undefined,
    needs_variant: needsVariant,
    ...(needsVariant ? { variants: allVariants } : {}),
  };
}

function buildSellResponse(product: ProductRow, variant: VariantRow | undefined, allVariants: VariantRow[]) {
  if (product.retail_sales_enabled === false) {
    return retailBlockedResponse();
  }
  return successResponse(buildSellPayload(product, variant, allVariants));
}

async function resolveProductBarcodeHit(
  supabase: SupabaseClient,
  providerId: string,
  barcode: string,
) {
  const { data: products, error: productError } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("provider_id", providerId)
    .eq("barcode", barcode)
    .eq("is_active", true);

  if (productError) return null;
  const rows = (products ?? []) as ProductRow[];
  if (rows.length > 1) return ambiguousResponse();
  if (rows.length === 1) {
    const product = rows[0];
    if (product.has_variants) {
      const { data: matchedVariants, error: variantError } = await supabase
        .from("product_variants")
        .select(VARIANT_LIST_SELECT)
        .eq("product_id", product.id)
        .eq("barcode", barcode);
      if (variantError) return null;
      const variantMatches = (matchedVariants ?? []) as VariantRow[];
      if (variantMatches.length > 1) return ambiguousResponse();
      const allVariants = await loadVariantsForProduct(supabase, product.id);
      return buildSellResponse(product, variantMatches[0], allVariants);
    }
    return buildSellResponse(product, undefined, []);
  }

  const { data: variantRows, error: variantError } = await supabase
    .from("product_variants")
    .select(VARIANT_SELECT)
    .eq("barcode", barcode);
  if (variantError) return null;

  const matches: Array<{ product: ProductRow; variant: VariantRow }> = [];
  for (const variant of (variantRows ?? []) as VariantRow[]) {
    if (!variant.product_id) continue;
    const product = await loadActiveProductForProvider(supabase, variant.product_id, providerId);
    if (product) matches.push({ product, variant });
  }
  if (matches.length > 1) return ambiguousResponse();
  if (matches.length === 1) {
    const { product, variant } = matches[0];
    return buildSellResponse(product, variant, []);
  }
  return null;
}

async function resolveSkuHit(supabase: SupabaseClient, providerId: string, sku: string) {
  const { data: products, error: productError } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("provider_id", providerId)
    .eq("sku", sku)
    .eq("is_active", true);

  if (productError) return null;
  const rows = (products ?? []) as ProductRow[];
  if (rows.length > 1) return ambiguousResponse();
  if (rows.length === 1) {
    const product = rows[0];
    if (product.has_variants) {
      const { data: matchedVariants, error: variantError } = await supabase
        .from("product_variants")
        .select(VARIANT_LIST_SELECT)
        .eq("product_id", product.id)
        .eq("sku", sku);
      if (variantError) return null;
      const variantMatches = (matchedVariants ?? []) as VariantRow[];
      if (variantMatches.length > 1) return ambiguousResponse();
      const allVariants = await loadVariantsForProduct(supabase, product.id);
      return buildSellResponse(product, variantMatches[0], allVariants);
    }
    return buildSellResponse(product, undefined, []);
  }

  const { data: variantRows, error: variantError } = await supabase
    .from("product_variants")
    .select(VARIANT_SELECT)
    .eq("sku", sku);
  if (variantError) return null;

  const matches: Array<{ product: ProductRow; variant: VariantRow }> = [];
  for (const variant of (variantRows ?? []) as VariantRow[]) {
    if (!variant.product_id) continue;
    const product = await loadActiveProductForProvider(supabase, variant.product_id, providerId);
    if (product) matches.push({ product, variant });
  }
  if (matches.length > 1) return ambiguousResponse();
  if (matches.length === 1) {
    const { product, variant } = matches[0];
    return buildSellResponse(product, variant, []);
  }
  return null;
}

/**
 * GET /api/provider/products/by-barcode
 * Look up a product or variant by barcode or SKU for the current provider.
 * Query: barcode=... or sku=... (barcode takes precedence if both provided).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const barcode = searchParams.get("barcode")?.trim();
    const sku = searchParams.get("sku")?.trim();

    if (!barcode && !sku) {
      return errorResponse("Query parameter 'barcode' or 'sku' is required", "VALIDATION_ERROR", 400);
    }

    if (barcode) {
      const barcodeResult = await resolveProductBarcodeHit(supabase, providerId, barcode);
      if (barcodeResult) return barcodeResult;
    }

    if (sku) {
      const skuResult = await resolveSkuHit(supabase, providerId, sku);
      if (skuResult) return skuResult;
    }

    return notFoundResponse("No product found for this barcode or SKU");
  } catch (error) {
    return handleApiError(error, "Failed to look up product by barcode");
  }
}
