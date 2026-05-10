export type ProviderBookingProductInput = {
  productId?: string | null;
  product_id?: string | null;
  productVariantId?: string | null;
  product_variant_id?: string | null;
  quantity?: number | string | null;
  unitPrice?: number | string | null;
  unit_price?: number | string | null;
  totalPrice?: number | string | null;
  total_price?: number | string | null;
};

export type ValidatedProviderBookingProduct = {
  productId: string;
  productVariantId: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  currency: string | null;
  name: string;
  trackStock: boolean;
};

export type ValidateProviderBookingProductsResult =
  | { ok: true; products: ValidatedProviderBookingProduct[] }
  | { ok: false; message: string; code: "VALIDATION_ERROR" | "INSUFFICIENT_STOCK" | "PRODUCT_VALIDATION_FAILED" };

export async function validateProviderBookingProducts(
  supabase: any,
  providerId: string,
  inputProducts: ProviderBookingProductInput[] | undefined,
): Promise<ValidateProviderBookingProductsResult> {
  const input = Array.isArray(inputProducts) ? inputProducts : [];
  if (input.length === 0) return { ok: true, products: [] };

  const productIds = input
    .map((product) => product.productId ?? product.product_id)
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  if (productIds.length !== input.length) {
    return { ok: false, message: "Each product line must include a product.", code: "VALIDATION_ERROR" };
  }

  const variantIds = input
    .map((product) => product.productVariantId ?? product.product_variant_id ?? null)
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0);

  const { data: productRows, error: productsError } = await supabase
    .from("products")
    .select("id, provider_id, name, retail_price, currency, is_active, retail_sales_enabled, track_stock_quantity, quantity, has_variants")
    .in("id", [...new Set(productIds)]);
  if (productsError) {
    return {
      ok: false,
      message: productsError.message || "We couldn't validate selected products. Please try again.",
      code: "PRODUCT_VALIDATION_FAILED",
    };
  }

  const productById = new Map<string, any>();
  for (const product of productRows ?? []) productById.set(product.id, product);

  const variantById = new Map<string, any>();
  if (variantIds.length > 0) {
    const { data: variantRows, error: variantsError } = await supabase
      .from("product_variants")
      .select("id, product_id, retail_price, quantity")
      .in("id", [...new Set(variantIds)]);
    if (variantsError) {
      return {
        ok: false,
        message: variantsError.message || "We couldn't validate selected product options. Please try again.",
        code: "PRODUCT_VALIDATION_FAILED",
      };
    }
    for (const variant of variantRows ?? []) variantById.set(variant.id, variant);
  }

  const validated: ValidatedProviderBookingProduct[] = [];
  for (const product of input) {
    const productId = product.productId ?? product.product_id;
    const productData = productId ? productById.get(productId) : null;
    if (!productId || !productData || productData.provider_id !== providerId || !productData.is_active) {
      return { ok: false, message: "One selected product is no longer available.", code: "VALIDATION_ERROR" };
    }
    if (productData.retail_sales_enabled === false) {
      return {
        ok: false,
        message: `${productData.name} is not available for booking add-ons.`,
        code: "VALIDATION_ERROR",
      };
    }

    const qtyRaw = Number(product.quantity ?? 1);
    const quantity = Math.max(1, Math.floor(qtyRaw));
    if (!Number.isFinite(qtyRaw) || quantity < 1 || quantity > 10_000) {
      return { ok: false, message: "Product quantity is invalid.", code: "VALIDATION_ERROR" };
    }

    const variantId = product.productVariantId ?? product.product_variant_id ?? null;
    const trackStock = productData.track_stock_quantity !== false;
    let unitPrice = Number(productData.retail_price ?? 0);

    if (productData.has_variants === true) {
      if (!variantId) {
        return {
          ok: false,
          message: `Select an option for ${productData.name}.`,
          code: "VALIDATION_ERROR",
        };
      }
      const variant = variantById.get(variantId);
      if (!variant || variant.product_id !== productId) {
        return { ok: false, message: "Selected product option is invalid.", code: "VALIDATION_ERROR" };
      }
      const variantPrice = Number(variant.retail_price);
      unitPrice = Number.isFinite(variantPrice) && variantPrice > 0 ? variantPrice : unitPrice;
      if (trackStock) {
        const available = Number(variant.quantity ?? 0);
        if (quantity > available) {
          return {
            ok: false,
            message: `${productData.name}: only ${available} in stock for that option.`,
            code: "INSUFFICIENT_STOCK",
          };
        }
      }
    } else {
      if (variantId) {
        return {
          ok: false,
          message: `${productData.name} does not use product options.`,
          code: "VALIDATION_ERROR",
        };
      }
      if (trackStock) {
        const available = Number(productData.quantity ?? 0);
        if (quantity > available) {
          return {
            ok: false,
            message: `${productData.name}: only ${available} in stock.`,
            code: "INSUFFICIENT_STOCK",
          };
        }
      }
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return { ok: false, message: "Product price is invalid.", code: "VALIDATION_ERROR" };
    }

    validated.push({
      productId,
      productVariantId: variantId || null,
      quantity,
      unitPrice,
      totalPrice: unitPrice * quantity,
      currency: productData.currency ?? null,
      name: productData.name ?? "Product",
      trackStock,
    });
  }

  return { ok: true, products: validated };
}
