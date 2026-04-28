import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  handleApiError,
  forbiddenResponse,
  userHasProviderAccessAdmin,
} from "@/lib/supabase/api-helpers";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { getTenantLocaleTagFromRegionConfig } from "@/lib/locale/tenant-locale";
import { parseReceiptDownloadToken } from "@/lib/receipts/receipt-download-token";
import {
  RECEIPT_PDF,
  drawPdfFooter,
  drawPdfHeader,
  drawPdfInfoGrid,
  drawPdfLineItems,
  drawPdfSectionTitle,
  drawPdfTotals,
  moneyPdf,
} from "@/lib/receipts/pdf-design";

/**
 * GET /api/provider/invoices/[id]/download
 * Generate and download invoice as a real PDF file using PDFKit.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const admin = getSupabaseAdmin();

    // Accept the short-lived HMAC `?token=` from the signed-url sibling so
    // mobile clients can open the PDF in a system viewer without a Bearer.
    const url = new URL(request.url);
    const downloadToken = url.searchParams.get("token");
    let user: { id: string; role: string };
    if (downloadToken) {
      const parsed = parseReceiptDownloadToken(downloadToken, {
        kind: "provider_invoice",
        subjectId: id,
      });
      if (!parsed) {
        return NextResponse.json(
          { error: "Signed download token is invalid or expired" },
          { status: 401 },
        );
      }
      const { data: userRow } = await admin
        .from("users")
        .select("id, role")
        .eq("id", parsed.userId)
        .maybeSingle();
      if (!userRow) {
        return NextResponse.json(
          { error: "Signed download token is invalid or expired" },
          { status: 401 },
        );
      }
      user = {
        id: userRow.id as string,
        role: (userRow.role as string) || "provider_owner",
      };
    } else {
      const authed = await requireRoleInApi(
        ["provider_owner", "provider_staff", "superadmin"],
        request,
      );
      user = { id: authed.user.id, role: authed.user.role as string };
    }

    const { data: invoice, error } = await admin
      .from("provider_invoices")
      .select(
        `
        *,
        providers(id, business_name, billing_email, billing_phone, billing_address, currency, tenant_id),
        line_items:provider_invoice_line_items(*),
        payments:provider_invoice_payments(*)
      `
      )
      .eq("id", id)
      .maybeSingle();

    if (error || !invoice) {
      return handleApiError(
        new Error("Invoice not found"),
        "Invoice not found",
        "NOT_FOUND",
        404
      );
    }

    const invPid = (invoice as { provider_id?: string | null }).provider_id;
    if (user.role !== "superadmin") {
      if (!invPid) {
        return forbiddenResponse("Invalid invoice record");
      }
      const allowed = await userHasProviderAccessAdmin(admin, user.id, invPid);
      if (!allowed) {
        return forbiddenResponse("You do not have access to this invoice");
      }
    }

    const inv = invoice as {
      tenant_id?: string | null;
      providers?: { tenant_id?: string | null; currency?: string | null } | null;
    };
    const tenantForConfig =
      inv.tenant_id ?? inv.providers?.tenant_id ?? null;
    const tenantRegionConfig = await getTenantRegionConfig(
      tenantForConfig ?? (await resolveTenantIdWithZaFallback(request))
    );

    const buffer = await generateInvoicePDF(invoice, tenantRegionConfig);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="invoice-${invoice.invoice_number}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to generate invoice");
  }
}

async function generateInvoicePDF(invoice: any, tenantRegionConfig: import("@/lib/regions/config").TenantRegionConfig | null): Promise<Buffer> {
  const fallbackCurrency =
    tenantRegionConfig?.defaultCurrency ||
    (invoice?.providers as { currency?: string } | undefined)?.currency?.trim() ||
    LAST_RESORT_CURRENCY;
  const fallbackLocale = getTenantLocaleTagFromRegionConfig(tenantRegionConfig);
  const currency = fallbackCurrency;

  const money = (amount: number) => moneyPdf(amount, currency.length === 3 ? currency : fallbackCurrency, fallbackLocale);

  const fmtDate = (date: string) => {
    return new Date(date).toLocaleDateString(fallbackLocale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const provider = invoice.providers;
  const billingAddress = (typeof provider?.billing_address === "object" && provider?.billing_address) || {};
  const providerDisplayName = provider?.business_name ?? (provider as { name?: string })?.name ?? "Provider";
  const statusLabel = (invoice.status || "draft").replace(/_/g, " ").toUpperCase();

  const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  drawPdfHeader(doc, {
    title: "Platform invoice",
    subtitle: "Beautonomi subscription and platform services",
    documentNumber: invoice.invoice_number,
    status: statusLabel,
  });

  const cityCountry = [billingAddress.city, billingAddress.country].filter(Boolean).join(", ");
  drawPdfInfoGrid(doc, [
    {
      label: "Bill to",
      lines: [providerDisplayName, billingAddress.address_line1, cityCountry, provider?.billing_email, provider?.billing_phone],
    },
    {
      label: "Invoice dates",
      lines: [`Issued ${fmtDate(invoice.issue_date)}`, `Due ${fmtDate(invoice.due_date)}`],
    },
    {
      label: "Billing period",
      lines: [`${fmtDate(invoice.period_start)} to ${fmtDate(invoice.period_end)}`],
    },
  ]);

  drawPdfLineItems(
    doc,
    ((invoice.line_items || []) as any[]).map((item) => ({
      description: item.description || "Invoice line item",
      detail: `Qty ${item.quantity ?? 1} · Unit ${money(Number(item.unit_price || 0))}`,
      amount: money(Number(item.total_price || 0)),
    })),
    { title: "Invoice details" },
  );

  const amountDue = Number(invoice.amount_due ?? invoice.total_amount ?? 0);
  drawPdfTotals(
    doc,
    [
      { label: "Subtotal", value: money(Number(invoice.subtotal || 0)) },
      { label: `Tax (${invoice.tax_rate ?? 0}%)`, value: money(Number(invoice.tax_amount || 0)) },
      ...(Number(invoice.amount_paid ?? 0) > 0
        ? [{ label: "Amount paid", value: money(Number(invoice.amount_paid)), tone: "success" as const }]
        : []),
      ...(amountDue > 0 ? [{ label: "Amount due", value: money(amountDue), tone: "danger" as const }] : []),
    ],
    { label: "Total", value: money(Number(invoice.total_amount || 0)) },
  );

  // Notes
  if (invoice.notes) {
    doc.moveDown(0.5);
    drawPdfSectionTitle(doc, "Notes");
    doc.fontSize(10).fillColor(RECEIPT_PDF.ink).text(invoice.notes);
  }

  drawPdfFooter(
    doc,
    "Thank you for using Beautonomi. For questions about this invoice, please contact support.\nThis is an automatically generated invoice.",
  );

  doc.end();
  return new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
