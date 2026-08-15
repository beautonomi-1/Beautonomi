/**
 * Shared renderer for the provider subscription-payment receipt PDF.
 *
 * Keyed on `finance_transactions.id` (one recognized `provider_subscription_payment`
 * row per Paystack reference). Used by BOTH:
 *   - the provider-facing route (session / signed token, ownership enforced), and
 *   - the superadmin-facing admin route (any provider, no ownership check).
 *
 * The receipt always shows the GROSS amount the provider was charged
 * (`net + fees`), robust for new rows (amount=gross) and legacy rows (amount=net).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import PDFDocument from "pdfkit";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { getPlatformDefaultTaxRate } from "@/lib/platform-tax-settings";
import { computeVatInclusiveBreakdown } from "@/lib/receipts/vat-inclusive-breakdown";
import {
  drawPdfFooter,
  drawPdfHeader,
  drawPdfInfoGrid,
  drawPdfLineItems,
  drawPdfTotals,
  formatPdfDate,
  moneyPdf,
} from "@/lib/receipts/pdf-design";

export type SubscriptionReceiptPdfResult =
  | { kind: "ok"; buffer: Buffer; reference: string; filename: string }
  | { kind: "error"; status: number; error: string };

/**
 * Load the subscription payment finance row + related data and render the
 * receipt PDF. Returns a structured result so callers can map to HTTP status.
 *
 * @param enforceProviderId when set, the finance row must belong to this
 *   provider (provider-facing access). When null/undefined the ownership check
 *   is skipped (superadmin viewing any provider's receipt).
 */
export async function generateSubscriptionReceiptPdf(opts: {
  supabase: SupabaseClient;
  financeTxId: string;
  request: NextRequest;
  enforceProviderId?: string | null;
}): Promise<SubscriptionReceiptPdfResult> {
  const { supabase, financeTxId, request, enforceProviderId } = opts;

  const { data: txRow } = await supabase
    .from("finance_transactions")
    .select(
      "id, provider_id, tenant_id, transaction_type, amount, net, fees, description, metadata, created_at",
    )
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
        fees: number | string | null;
        description: string | null;
        metadata: Record<string, unknown> | null;
        created_at: string | null;
      }
    | null;

  if (!tx) {
    return { kind: "error", status: 404, error: "Receipt not found" };
  }
  if (enforceProviderId != null && tx.provider_id !== enforceProviderId) {
    return { kind: "error", status: 404, error: "Receipt not found" };
  }
  if (tx.transaction_type !== "provider_subscription_payment") {
    return {
      kind: "error",
      status: 409,
      error: "A receipt is only available for subscription payments.",
    };
  }

  const providerId = tx.provider_id;
  if (!providerId) {
    return { kind: "error", status: 404, error: "Receipt not found" };
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
    payment_provider?: string | null;
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
  // GROSS the provider actually paid (net + gateway fees).
  const amount = Number(tx.net ?? 0) + Number(tx.fees ?? 0);
  const vatRate = await getPlatformDefaultTaxRate();
  const vatBreakdown = computeVatInclusiveBreakdown(amount, vatRate);

  const isRenewal = metadata.kind === "subscription_renewal";
  const productLabel = isRenewal
    ? `${planName} — subscription renewal`
    : `${planName} — subscription`;
  const reference = String(metadata.reference || metadata.invoice_code || tx.id);

  let isApplePayment = String(metadata.payment_provider ?? "").toLowerCase() === "apple";
  if (!isApplePayment && reference) {
    const { data: paymentTxRow } = await supabase
      .from("payment_transactions")
      .select("provider")
      .eq("reference", reference)
      .maybeSingle();
    isApplePayment = String((paymentTxRow as { provider?: string } | null)?.provider ?? "").toLowerCase() === "apple";
  }

  const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  drawPdfHeader(doc, {
    title: isApplePayment ? "App Store subscription receipt" : "Subscription receipt",
    subtitle: isApplePayment
      ? "Apple is the merchant of record for this App Store purchase"
      : "Provider copy for platform subscription payment records",
    documentNumber: reference,
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
        isApplePayment ? "Processor: Apple App Store" : null,
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
        detail: isApplePayment
          ? "Platform subscription purchased through the App Store"
          : vatBreakdown.ratePercent > 0
            ? "Platform subscription — VAT inclusive"
            : "Platform subscription — charged after payment was verified",
        amount: moneyPdf(amount, currency),
      },
    ],
    { title: "Items" },
  );

  if (isApplePayment) {
    drawPdfTotals(
      doc,
      [{ label: "Gross paid to Apple", value: moneyPdf(amount, currency) }],
      { label: "Total paid to Apple", value: moneyPdf(amount, currency) },
    );
    doc.moveDown(0.5);
    doc
      .fontSize(8)
      .fillColor("#6b7280")
      .text(
        "Apple is the seller of record for App Store purchases. Any applicable VAT or sales tax is collected and remitted by Apple, not Beautonomi. This document is a provider copy for your records and is not a Beautonomi tax invoice.",
        { align: "left" },
      );
  } else if (vatBreakdown.ratePercent > 0) {
    drawPdfTotals(
      doc,
      [
        {
          label: "Subtotal (excl. VAT)",
          value: moneyPdf(vatBreakdown.subtotalExclVat, currency),
        },
        {
          label: `VAT (${vatBreakdown.ratePercent}%)`,
          value: moneyPdf(vatBreakdown.vatAmount, currency),
        },
      ],
      { label: "Total paid", value: moneyPdf(amount, currency) },
    );
    doc.moveDown(0.5);
    doc.fontSize(8).fillColor("#6b7280").text("All amounts are VAT inclusive.", { align: "left" });
  } else {
    drawPdfTotals(
      doc,
      [{ label: "Subtotal", value: moneyPdf(amount, currency) }],
      { label: "Total paid", value: moneyPdf(amount, currency) },
    );
  }

  drawPdfFooter(doc, provider?.receipt_footer ?? null);

  doc.end();
  const buffer = await new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  return {
    kind: "ok",
    buffer,
    reference,
    filename: `subscription-receipt-${reference}.pdf`,
  };
}
