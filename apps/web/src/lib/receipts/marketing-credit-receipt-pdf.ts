import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import PDFDocument from "pdfkit";
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

const ALLOWED_TYPES = new Set([
  "provider_marketing_credit_topup",
  "provider_marketing_credit_refund",
]);

export type MarketingCreditReceiptPdfResult =
  | { kind: "ok"; buffer: Buffer; reference: string; filename: string }
  | { kind: "error"; status: number; error: string };

export async function generateMarketingCreditReceiptPdf(opts: {
  supabase: SupabaseClient;
  financeTxId: string;
  request: NextRequest;
  enforceProviderId?: string | null;
}): Promise<MarketingCreditReceiptPdfResult> {
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
  if (!tx.transaction_type || !ALLOWED_TYPES.has(tx.transaction_type)) {
    return {
      kind: "error",
      status: 409,
      error: "A receipt is only available for marketing credit payments.",
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

  const metadata = (tx.metadata ?? {}) as { reference?: string | null };
  const effectiveTenantId =
    tx.tenant_id ?? provider?.tenant_id ?? (await resolveTenantIdWithZaFallback(request));
  const tenantRegion = await getTenantRegionConfig(effectiveTenantId);
  const currency = tenantRegion?.defaultCurrency || LAST_RESORT_CURRENCY;
  const amount = Math.abs(Number(tx.net ?? 0) + Number(tx.fees ?? 0));
  const isRefund = tx.transaction_type === "provider_marketing_credit_refund";
  const reference = String(metadata.reference || tx.id);
  const title = isRefund ? "Marketing credit refund" : "Marketing credit purchase";

  const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  drawPdfHeader(doc, {
    title,
    subtitle: "Provider copy for marketing credit balance movements",
    documentNumber: reference,
    status: isRefund ? "refunded" : "paid",
    note: provider?.receipt_header ?? null,
  });

  drawPdfInfoGrid(doc, [
    { label: "Billed to", lines: [provider?.business_name || "-"] },
    {
      label: isRefund ? "Refunded" : "Paid",
      lines: [
        `${formatPdfDate(tx.created_at)}`,
        metadata.reference ? `Ref: ${metadata.reference}` : null,
      ],
    },
  ]);

  doc.moveDown();
  drawPdfLineItems(
    doc,
    [
      {
        description: tx.description || title,
        detail: isRefund ? "Credit returned to your payment method" : "Marketing credit added to your balance",
        amount: moneyPdf(amount, currency),
      },
    ],
    { title: "Items" },
  );

  drawPdfTotals(
    doc,
    [{ label: "Amount", value: moneyPdf(amount, currency) }],
    { label: isRefund ? "Total refunded" : "Total paid", value: moneyPdf(amount, currency) },
  );

  drawPdfFooter(doc, provider?.receipt_footer ?? null);

  doc.end();
  const buffer = await new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  return {
    kind: "ok",
    buffer,
    reference,
    filename: `marketing-credit-${reference}.pdf`,
  };
}
