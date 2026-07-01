import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTenantRegionConfig } from "@/lib/regions/config";
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
 * GET /api/me/membership/receipts/[financeTxId]/pdf
 *
 * Customer-facing PDF receipt for a membership payment.
 * Keyed on `finance_transactions.id` (membership_sale rows).
 * Ownership verified via `finance_transactions.metadata.user_id === authenticated user.id`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ financeTxId: string }> },
) {
  try {
    const { financeTxId } = await params;
    const supabase = getSupabaseAdmin();

    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );

    const { data: txRow } = await supabase
      .from("finance_transactions")
      .select("id, provider_id, tenant_id, transaction_type, amount, fees, net, description, metadata, created_at")
      .eq("id", financeTxId)
      .maybeSingle();

    const tx = txRow as {
      id: string;
      provider_id: string | null;
      tenant_id: string | null;
      transaction_type: string | null;
      amount: number | string | null;
      fees: number | string | null;
      net: number | string | null;
      description: string | null;
      metadata: Record<string, unknown> | null;
      created_at: string | null;
    } | null;

    if (!tx) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    if (tx.transaction_type !== "membership_sale") {
      return NextResponse.json(
        { error: "A receipt is only available for membership payments." },
        { status: 409 },
      );
    }

    // Ownership check: metadata.user_id must match the authenticated user.
    const metaUserId = tx.metadata?.user_id as string | undefined;
    if (!metaUserId || metaUserId !== user.id) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    const metadata = tx.metadata as {
      kind?: string;
      reference?: string;
      membership_order_id?: string;
      plan_id?: string;
      user_id?: string;
    };

    // Load plan name
    let planName = "Membership";
    if (metadata.plan_id) {
      const { data: planRow } = await (supabase.from("membership_plans") as any)
        .select("name")
        .eq("id", metadata.plan_id)
        .maybeSingle();
      if ((planRow as { name?: string } | null)?.name) {
        planName = (planRow as { name: string }).name;
      }
    }

    // Load provider name
    let providerName = "Your salon";
    let receiptHeader: string | null = null;
    let receiptFooter: string | null = null;
    if (tx.provider_id) {
      const { data: provRow } = await supabase
        .from("providers")
        .select("business_name, receipt_header, receipt_footer")
        .eq("id", tx.provider_id)
        .maybeSingle();
      const prov = provRow as { business_name?: string; receipt_header?: string; receipt_footer?: string } | null;
      if (prov?.business_name) providerName = prov.business_name;
      receiptHeader = prov?.receipt_header ?? null;
      receiptFooter = prov?.receipt_footer ?? null;
    }

    // Load customer name
    let customerName = "Member";
    const { data: userRow } = await (supabase.from("users") as any)
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();
    const userInfo = userRow as { full_name?: string; email?: string } | null;
    if (userInfo?.full_name) customerName = userInfo.full_name;

    const tenantId = tx.tenant_id ?? null;
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const currency = tenantRegion?.defaultCurrency || LAST_RESORT_CURRENCY;
    const grossAmount = Number(tx.amount ?? 0);
    const feeAmount = Number(tx.fees ?? 0);
    // `net` on membership_sale rows is 0 (platform takes no commission).
    // Use grossAmount as the customer-facing total — that is what they paid.
    const netAmount = grossAmount;
    const reference = metadata.reference ?? tx.id;
    const isRenewal = metadata.kind === "membership_renewal";
    const productLabel = isRenewal
      ? `${planName} at ${providerName} — renewal`
      : `${planName} at ${providerName} — membership`;

    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));

    drawPdfHeader(doc, {
      title: "Membership receipt",
      subtitle: isRenewal ? "Auto-renewal payment" : "Membership subscription payment",
      documentNumber: String(reference),
      status: "paid",
      note: receiptHeader,
    });

    drawPdfInfoGrid(doc, [
      { label: "Member", lines: [customerName, userInfo?.email ?? null] },
      {
        label: "Payment",
        lines: [
          `Paid ${formatPdfDate(tx.created_at)}`,
          reference ? `Ref: ${reference}` : null,
        ],
      },
      { label: "Provider", lines: [providerName] },
    ]);

    doc.moveDown();
    drawPdfLineItems(
      doc,
      [
        {
          description: productLabel,
          detail: `${planName} membership benefits`,
          amount: moneyPdf(grossAmount, currency),
        },
      ],
      { title: "Items" },
    );

    drawPdfTotals(
      doc,
      [
        { label: "Subtotal", value: moneyPdf(grossAmount, currency) },
        ...(feeAmount > 0 ? [{ label: "Processing fee", value: moneyPdf(feeAmount, currency) }] : []),
      ],
      { label: "Total paid", value: moneyPdf(netAmount, currency) },
    );

    drawPdfFooter(doc, receiptFooter);

    doc.end();
    const buffer = await new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="membership-receipt-${reference}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate membership receipt PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
