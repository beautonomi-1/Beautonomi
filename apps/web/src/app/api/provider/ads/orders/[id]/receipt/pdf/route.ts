import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import {
  requireRoleInApi,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { parseReceiptDownloadToken } from "@/lib/receipts/receipt-download-token";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import {
  drawPdfFooter,
  drawPdfHeader,
  drawPdfInfoGrid,
  drawPdfLineItems,
  drawPdfTotals,
  formatPdfDate,
  moneyPdf,
} from "@/lib/receipts/pdf-design";

export const maxDuration = 60;

/**
 * GET /api/provider/ads/orders/[id]/receipt/pdf
 *
 * Provider-facing PDF receipt for a paid ads budget order, mirroring the
 * product-order receipt. Session-authed (provider_owner / provider_staff /
 * superadmin). Only paid orders produce a receipt.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    // Two auth modes (mirrors product-order receipts):
    //   1. Short-lived `?token=` minted for the native app (no Bearer on GET).
    //   2. Normal session (provider web / superadmin).
    const token = new URL(request.url).searchParams.get("token");
    let providerId: string | null = null;
    if (token) {
      const parsed = parseReceiptDownloadToken(token, {
        kind: "provider_ads_receipt",
        subjectId: id,
      });
      if (!parsed) {
        return NextResponse.json(
          { error: "Signed download token is invalid or expired" },
          { status: 401 },
        );
      }
      providerId = await getProviderIdForUser(parsed.userId, supabase);
    } else {
      const { user } = await requireRoleInApi(
        ["provider_owner", "provider_staff", "superadmin"],
        request,
      );
      providerId = await getProviderIdForUser(user.id, supabase);
    }
    if (!providerId) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    const { data: orderRow } = await supabase
      .from("ads_budget_orders")
      .select("id, amount, status, currency, campaign_id, provider_id, paystack_reference, paid_at, created_at")
      .eq("id", id)
      .maybeSingle();
    const order = orderRow as
      | {
          id: string;
          amount: number | string | null;
          status: string | null;
          currency: string | null;
          campaign_id: string | null;
          provider_id: string | null;
          paystack_reference: string | null;
          paid_at: string | null;
          created_at: string | null;
        }
      | null;

    if (!order || order.provider_id !== providerId) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (String(order.status ?? "") !== "paid") {
      return NextResponse.json(
        { error: "A receipt is only available once the order is paid." },
        { status: 409 },
      );
    }

    const { data: provRow } = await supabase
      .from("providers")
      .select("business_name, tenant_id, receipt_header, receipt_footer")
      .eq("id", providerId)
      .maybeSingle();
    const provider = provRow as
      | {
          business_name?: string | null;
          tenant_id?: string | null;
          receipt_header?: string | null;
          receipt_footer?: string | null;
        }
      | null;

    let campaign: { billing_model?: string | null; duration_days?: number | null; pack_impressions?: number | null } | null =
      null;
    if (order.campaign_id) {
      const { data: campRow } = await supabase
        .from("ads_campaigns")
        .select("billing_model, duration_days, pack_impressions")
        .eq("id", order.campaign_id)
        .maybeSingle();
      campaign = campRow as typeof campaign;
    }

    const effectiveTenantId =
      provider?.tenant_id ?? (await resolveTenantIdWithZaFallback(request));
    const tenantRegion = await getTenantRegionConfig(effectiveTenantId);
    const currency =
      order.currency || tenantRegion?.defaultCurrency || LAST_RESORT_CURRENCY;
    const amount = Number(order.amount || 0);

    const billingModel = campaign?.billing_model ?? "cpc_budget";
    const productLabel =
      billingModel === "time_based"
        ? `Sponsored time boost${campaign?.duration_days ? ` (${campaign.duration_days} days)` : ""}`
        : billingModel === "impression_pack"
          ? `Sponsored impression pack${campaign?.pack_impressions ? ` (${campaign.pack_impressions} impressions)` : ""}`
          : "Sponsored ads campaign budget";

    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));

    drawPdfHeader(doc, {
      title: "Ads receipt",
      subtitle: "Provider copy for sponsored advertising payment records",
      documentNumber: order.paystack_reference || order.id,
      status: "paid",
      note: provider?.receipt_header ?? null,
    });

    drawPdfInfoGrid(doc, [
      { label: "Billed to", lines: [provider?.business_name || "-"] },
      {
        label: "Order",
        lines: [
          `Paid ${formatPdfDate(order.paid_at || order.created_at)}`,
          order.paystack_reference ? `Ref: ${order.paystack_reference}` : null,
        ],
      },
      { label: "Product", lines: [productLabel] },
    ]);

    doc.moveDown();
    drawPdfLineItems(
      doc,
      [
        {
          description: productLabel,
          detail: "Sponsored placement — charged once, after payment was verified",
          amount: moneyPdf(amount, currency),
        },
      ],
      { title: "Items" },
    );

    drawPdfTotals(
      doc,
      [{ label: "Subtotal", value: moneyPdf(amount, currency) }],
      { label: "Total paid", value: moneyPdf(amount, currency) },
    );

    drawPdfFooter(doc, provider?.receipt_footer ?? null);

    doc.end();
    const buffer = await new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="ads-receipt-${order.paystack_reference || order.id}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate ads receipt PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
