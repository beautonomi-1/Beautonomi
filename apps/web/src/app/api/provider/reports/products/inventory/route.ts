import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireProviderReportsAccess } from "@/lib/reports/require-provider-reports-access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";
import {
  displayRetailPriceMin,
  effectiveStockQuantity,
  retailStockValue,
} from "@/lib/provider-portal/product-inventory-metrics";

const PREVIEW_LIMIT_LOW = 25;
const PREVIEW_LIMIT_OUT = 25;

export type InventoryProductRow = {
  id: string;
  name: string;
  category: string | null;
  has_variants: boolean;
  is_active: boolean | null;
  track_stock_quantity: boolean | null;
  low_stock_level: number | null;
  quantity: number;
  stock_quantity: number;
  price: number;
  retail_price: number;
  retail_line_value: number;
};

/**
 * GET /api/provider/reports/products/inventory
 *
 * Snapshot of catalogue stock from `products` (+ nested `product_variants`).
 * **Provider-wide only** — stock is not stored per branch in this schema.
 */
export async function GET(_request: NextRequest) {
  try {
    const permissionCheck = await requireProviderReportsAccess(_request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);

    if (!providerId) return notFoundResponse("Provider not found");

    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);

    const { data: products, error: productsError } = await supabaseAdmin
      .from("products")
      .select(
        "id, name, category, retail_price, quantity, low_stock_level, track_stock_quantity, is_active, has_variants, product_variants(quantity, retail_price)",
      )
      .eq("provider_id", providerId)
      .order("name", { ascending: true });

    if (productsError) {
      return handleApiError(new Error(productsError.message || "Failed to fetch products"), "Failed to load inventory");
    }

    const rows = products || [];

    const shapeRow = (p: (typeof rows)[number]): InventoryProductRow => {
      const stock_quantity = effectiveStockQuantity(p);
      const price = displayRetailPriceMin(p);
      const retail_line_value = retailStockValue(p);
      return {
        id: p.id,
        name: p.name,
        category: p.category ?? null,
        has_variants: Boolean(p.has_variants),
        is_active: p.is_active ?? null,
        track_stock_quantity: p.track_stock_quantity ?? null,
        low_stock_level: p.low_stock_level != null ? Number(p.low_stock_level) : null,
        quantity: stock_quantity,
        stock_quantity,
        price,
        retail_price: price,
        retail_line_value,
      };
    };

    const tracksStock = (p: (typeof rows)[number]) => p.track_stock_quantity !== false;

    const lowStockCandidates = rows.filter((p) => {
      if (!tracksStock(p)) return false;
      const q = effectiveStockQuantity(p);
      const lowStockLevel = Number(p.low_stock_level ?? 5);
      return q > 0 && q <= lowStockLevel;
    });

    const outOfStockCandidates = rows.filter((p) => {
      if (!tracksStock(p)) return false;
      return effectiveStockQuantity(p) === 0;
    });

    const lowStockCount = lowStockCandidates.length;
    const outOfStockCount = outOfStockCandidates.length;

    const totalProducts = rows.length;
    const activeProducts = rows.filter((p) => p.is_active).length;
    const inactiveProducts = totalProducts - activeProducts;
    const productsTrackingStock = rows.filter((p) => tracksStock(p)).length;

    const totalStockValue = rows.reduce((sum, p) => sum + retailStockValue(p), 0);

    const lowStockProducts = lowStockCandidates.map(shapeRow).slice(0, PREVIEW_LIMIT_LOW);
    const outOfStockProducts = outOfStockCandidates.map(shapeRow).slice(0, PREVIEW_LIMIT_OUT);

    const categoryMap = new Map<string, { count: number; stockValue: number }>();
    rows.forEach((product) => {
      const category = product.category || "Uncategorized";
      const existing = categoryMap.get(category) || { count: 0, stockValue: 0 };
      existing.count += 1;
      existing.stockValue += retailStockValue(product);
      categoryMap.set(category, existing);
    });

    const categoryBreakdown = Array.from(categoryMap.entries())
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.stockValue - a.stockValue);

    const reportBasis =
      `Catalogue snapshot from \`products\` (nested \`product_variants\`) for this provider. ` +
      `Generated in context of ${reportContext.timezone} for date/time labels only — quantities are not stored per branch. ` +
      `Effective quantity is the sum of \`product_variants.quantity\` when \`has_variants\` is true and at least one variant row exists; otherwise \`products.quantity\`. ` +
      `Retail stock value is Σ (\`quantity × retail_price\`) per variant line, or \`products.quantity × products.retail_price\` when there are no variant rows. ` +
      `When \`track_stock_quantity\` is false, stock value is treated as 0 and the SKU is excluded from low/out-of-stock alerts. ` +
      `Low stock: tracked SKUs with quantity from 1 through \`low_stock_level\` inclusive (\`low_stock_level\` defaults to 5 when null). ` +
      `Out of stock: tracked SKUs with effective quantity 0.`;

    return successResponse({
      timezone: reportContext.timezone,
      asOf: new Date().toISOString(),
      reportBasis,
      basis: {
        scope:
          "Provider-wide catalogue only — the schema does not store stock or retail value per salon location.",
        quantityRule:
          "Variant quantities summed only when has_variants is true and product_variants has at least one row; otherwise parent quantity.",
        valueRule:
          "Per product: sum of (variant qty × variant retail price) when variant rows exist; else parent qty × parent retail price; if track_stock_quantity is false, value is 0.",
        alertsRule:
          "Low/out counts include only products where track_stock_quantity is not false; low band uses low_stock_level ?? 5.",
        categoryRule:
          "Each category row counts every product in that category; stock value sums each product’s retail stock value (untracked contributes 0).",
        previews: `Low-stock and out-of-stock lists show at most ${PREVIEW_LIMIT_LOW} and ${PREVIEW_LIMIT_OUT} rows; headline counts are for the full catalogue.`,
      },
      totalProducts,
      activeProducts,
      inactiveProducts,
      productsTrackingStock,
      totalStockValue,
      lowStockCount,
      outOfStockCount,
      previewLimits: { lowStock: PREVIEW_LIMIT_LOW, outOfStock: PREVIEW_LIMIT_OUT },
      lowStockProducts,
      outOfStockProducts,
      categoryBreakdown,
      allProducts: rows.map(shapeRow),
    });
  } catch (error) {
    return handleApiError(error, "Failed to load inventory report");
  }
}
