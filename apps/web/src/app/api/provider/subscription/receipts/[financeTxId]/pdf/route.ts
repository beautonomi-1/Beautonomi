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
 * GET /api/provider/subscription/receipts/[financeTxId]/pdf
 *
 * Provider-facing PDF receipt for a subscription payment. Keyed on
 * `finance_transactions.id` so it covers BOTH one-off subscription orders and
 * recurring renewals (every recognized payment posts exactly one
 * `provider_subscription_payment` finance row via the unified helper).
 *
 * Dual auth (mirrors ads / product-order receipts):
 *   1. Short-lived `?token=` minted for the native app.
 *   2. Normal session (provider_owner / provider_staff / superadmin).
 * Only a recognized payment row produces a receipt.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ financeTxId: string }> },
) {
  try {
    const { financeTxId } = await params;
    const supabase = getSupabaseAdmin();

    const token = new URL(request.url).searchParams.get("token");
    let providerId: string | null = null;
    if (token) {
      const parsed = parseReceiptDownloadToken(token, {
        kind: "provider_subscription_receipt",
        subjectId: financeTxId,
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

    const { data: txRow } = await supabase
      .from("finance_transactions")
      .select("id, provider_id, tenant_id, transaction_type, amount, net, description, metadata, created_at")
      .eq("id", financeTxId)
      .maybeSingle();
    const tx = txRow as
      | {
          id: string;
          provider_id: string | null;
          tenant_id: string | null;
          transaction_type: string | null;
          amount: number | string | null;
          net: number | string | null;
          description: string | null;
          metadata: Record<string, unknown> | null;
          created_at: string | null;
        }
      | null;

    if (!tx || tx.provider_id !== providerId) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }
    if (tx.transaction_type !== "provider_subscription_payment") {
      return NextResponse.json(
        { error: "A receipt is only available for subscription payments." },
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

    const metadata = (tx.metadata ?? {}) as {
      reference?: string | null;
      plan_id?: string | null;
      kind?: string | null;
      invoice_code?: string | null;
      subscription_code?: string | null;
    };

    let planName = "Subscription plan";
    if (metadata.plan_id) {
      const { data: planRow } = await supabase
        .from("subscription_plans")
        .select("name")
        .eq("id", metadata.plan_id)
        .maybeSingle();
      if ((planRow as { name?: string } | null)?.name) {
        planName = (planRow as { name: string }).name;
      }
    }

    const effectiveTenantId =
      tx.tenant_id ?? provider?.tenant_id ?? (await resolveTenantIdWithZaFallback(request));
    const tenantRegion = await getTenantRegionConfig(effectiveTenantId);
    const currency = tenantRegion?.defaultCurrency || LAST_RESORT_CURRENCY;
    const amount = Number(tx.net ?? tx.amount ?? 0);

    const isRenewal = metadata.kind === "subscription_renewal";
    const productLabel = isRenewal
      ? `${planName} — subscription renewal`
      : `${planName} — subscription`;
    const reference = metadata.reference || metadata.invoice_code || tx.id;

    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));

    drawPdfHeader(doc, {
      title: "Subscription receipt",
      subtitle: "Provider copy for platform subscription payment records",
      documentNumber: String(reference),
      status: "paid",
      note: provider?.receipt_header ?? null,
    });

    drawPdfInfoGrid(doc, [
      { label: "Billed to", lines: [provider?.business_name || "-"] },
      {
        label: "Payment",
        lines: [
          `Paid ${formatPdfDate(tx.created_at)}`,
          metadata.reference ? `Ref: ${metadata.reference}` : null,
        ],
      },
      { label: "Plan", lines: [planName] },
    ]);

    doc.moveDown();
    drawPdfLineItems(
      doc,
      [
        {
          description: productLabel,
          detail: "Platform subscription — charged after payment was verified",
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
        "content-disposition": `attachment; filename="subscription-receipt-${reference}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate subscription receipt PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
