import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import {
  STATIC_APPLE_CATALOG,
  setupSheetToCsv,
  computeAppleTargetPriceZar,
  nearestApplePricePointZar,
} from "@/lib/iap/apple/product-catalog";
import { loadAppleIapConfig } from "@/lib/iap/apple/config";

/**
 * GET /api/admin/monetization/apple/setup-sheet
 * App Store Connect transcription sheet + CSV export.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = getSupabaseAdmin();
    const config = await loadAppleIapConfig(supabase);
    const commissionRate = config?.commissionRate ?? 0.15;

    const { data: dbProducts } = await supabase
      .from("apple_iap_products")
      .select("*")
      .order("kind")
      .order("product_id");

    const rows =
      dbProducts && dbProducts.length > 0
        ? (dbProducts as Array<Record<string, unknown>>).map((p) => {
            const webFromRef = STATIC_APPLE_CATALOG.find((s) => s.productId === p.product_id)?.webPriceZar ?? 0;
            const target = computeAppleTargetPriceZar(webFromRef, commissionRate);
            return {
              ascType:
                p.kind === "consumable" ? "Consumable" : "Auto-Renewable Subscription",
              referenceName: p.reference_name,
              productId: p.product_id,
              duration:
                p.kind === "subscription"
                  ? String(p.product_id).includes(".yearly")
                    ? "1 year"
                    : "1 month"
                  : undefined,
              groupLevel: p.subscription_group_level ?? undefined,
              webPriceZar: webFromRef,
              targetApplePriceZar: target,
              suggestedApplePricePoint: nearestApplePricePointZar(target),
              storedApplePriceZar: Number(p.apple_price_zar ?? 0),
              ascReportedPriceZar: p.asc_reported_price_zar
                ? Number(p.asc_reported_price_zar)
                : null,
              displayName: p.display_name,
              description: p.description,
              isActive: p.is_active,
            };
          })
        : STATIC_APPLE_CATALOG.map((r) => ({
            ascType: r.ascType,
            referenceName: r.referenceName,
            productId: r.productId,
            duration: r.duration,
            groupLevel: r.groupLevel,
            webPriceZar: r.webPriceZar,
            targetApplePriceZar: computeAppleTargetPriceZar(r.webPriceZar, commissionRate),
            suggestedApplePricePoint: nearestApplePricePointZar(
              computeAppleTargetPriceZar(r.webPriceZar, commissionRate),
            ),
            storedApplePriceZar: null,
            ascReportedPriceZar: null,
            displayName: r.displayName,
            description: r.description,
            isActive: true,
          }));

    const format = new URL(request.url).searchParams.get("format");
    if (format === "csv") {
      const csvRows = rows.map((r) => ({
        ascType: r.ascType as "Consumable" | "Auto-Renewable Subscription",
        referenceName: r.referenceName,
        productId: r.productId,
        duration: r.duration,
        groupLevel: r.groupLevel,
        webPriceZar: r.webPriceZar,
        targetApplePriceZar: r.targetApplePriceZar,
        displayName: r.displayName,
        description: r.description,
        refTable: "",
        refKey: "",
      }));
      return new Response(setupSheetToCsv(csvRows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="apple-iap-setup-sheet.csv"',
        },
      });
    }

    return successResponse({
      subscription_group: {
        reference_name: "Beautonomi Partner Plans",
        display_name: "Beautonomi Partner",
        billing_grace_period: "16 days (recommended: On)",
        streamlined_purchasing: "Off for v1",
        family_sharing: "Off",
      },
      commission_rate: commissionRate,
      products: rows,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
