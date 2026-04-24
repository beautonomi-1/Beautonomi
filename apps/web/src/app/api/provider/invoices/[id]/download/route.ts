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

  const money = (amount: number) => {
    return new Intl.NumberFormat(fallbackLocale, {
      style: "currency",
      currency: currency.length === 3 ? currency : fallbackCurrency,
    }).format(amount);
  };

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

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  // Header
  doc.fontSize(22).fillColor("#FF0077").text("Beautonomi", { continued: true });
  doc.fontSize(10).fillColor("#666").text("  Platform Invoice", { align: "left" });
  doc.moveDown(0.5);
  doc.fillColor("#FF0077").fontSize(16).text(invoice.invoice_number);
  doc.fillColor("#333").fontSize(10);
  doc.text(`Issue Date: ${fmtDate(invoice.issue_date)}`);
  doc.text(`Due Date: ${fmtDate(invoice.due_date)}`);
  doc.text(`Status: ${statusLabel}`);
  doc.moveDown(0.5);

  // Divider
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#FF0077").lineWidth(2).stroke();
  doc.moveDown(0.8);

  // Bill To
  doc.fontSize(9).fillColor("#666").text("BILL TO", { underline: false });
  doc.fontSize(11).fillColor("#333").text(providerDisplayName);
  if (billingAddress.address_line1) doc.fontSize(10).text(billingAddress.address_line1);
  const cityCountry = [billingAddress.city, billingAddress.country].filter(Boolean).join(", ");
  if (cityCountry) doc.text(cityCountry);
  if (provider?.billing_email) doc.text(provider.billing_email);
  if (provider?.billing_phone) doc.text(provider.billing_phone);
  doc.moveDown(0.5);

  // Billing Period
  doc.fontSize(9).fillColor("#666").text("BILLING PERIOD");
  doc.fontSize(10).fillColor("#333").text(`${fmtDate(invoice.period_start)} to ${fmtDate(invoice.period_end)}`);
  doc.moveDown(0.8);

  // Line items table header
  const colX = { desc: 50, qty: 340, unit: 400, total: 480 };
  doc.fontSize(9).fillColor("#666");
  doc.text("Description", colX.desc, doc.y, { width: 280 });
  const headerY = doc.y - 12;
  doc.text("Qty", colX.qty, headerY, { width: 50, align: "right" });
  doc.text("Unit Price", colX.unit, headerY, { width: 70, align: "right" });
  doc.text("Total", colX.total, headerY, { width: 65, align: "right" });
  doc.moveDown(0.3);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#ddd").lineWidth(1).stroke();
  doc.moveDown(0.3);

  // Line items
  doc.fillColor("#333").fontSize(10);
  for (const item of (invoice.line_items || []) as any[]) {
    const rowY = doc.y;
    doc.text(item.description || "", colX.desc, rowY, { width: 280 });
    const textY = Math.max(doc.y - 12, rowY);
    doc.text(String(item.quantity ?? 1), colX.qty, textY, { width: 50, align: "right" });
    doc.text(money(Number(item.unit_price || 0)), colX.unit, textY, { width: 70, align: "right" });
    doc.text(money(Number(item.total_price || 0)), colX.total, textY, { width: 65, align: "right" });
    doc.moveDown(0.2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#eee").lineWidth(0.5).stroke();
    doc.moveDown(0.2);
  }

  doc.moveDown(0.5);

  // Totals — right-aligned summary
  const summaryX = 380;
  const valX = 480;
  const summaryLine = (label: string, value: string, bold = false) => {
    const y = doc.y;
    doc.fontSize(bold ? 12 : 10).text(label, summaryX, y, { width: 90, align: "left" });
    doc.fontSize(bold ? 12 : 10).text(value, valX, y, { width: 65, align: "right" });
    doc.moveDown(0.3);
  };

  summaryLine("Subtotal:", money(Number(invoice.subtotal || 0)));
  summaryLine(`Tax (${invoice.tax_rate ?? 0}%):`, money(Number(invoice.tax_amount || 0)));

  doc.moveTo(summaryX, doc.y).lineTo(545, doc.y).strokeColor("#333").lineWidth(1.5).stroke();
  doc.moveDown(0.3);
  summaryLine("Total:", money(Number(invoice.total_amount || 0)), true);
  doc.moveTo(summaryX, doc.y).lineTo(545, doc.y).strokeColor("#333").lineWidth(1.5).stroke();
  doc.moveDown(0.3);

  if (Number(invoice.amount_paid ?? 0) > 0) {
    summaryLine("Amount Paid:", money(Number(invoice.amount_paid)));
    const amountDue = Number(invoice.amount_due ?? invoice.total_amount ?? 0);
    if (amountDue > 0) {
      doc.fillColor("red");
      summaryLine("Amount Due:", money(amountDue), true);
      doc.fillColor("#333");
    }
  }

  // Notes
  if (invoice.notes) {
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor("#666").text("NOTES");
    doc.fontSize(10).fillColor("#333").text(invoice.notes);
  }

  // Footer
  doc.moveDown(2);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#ddd").lineWidth(0.5).stroke();
  doc.moveDown(0.5);
  doc.fontSize(9).fillColor("#666").text(
    "Thank you for using Beautonomi. For questions about this invoice, please contact support.",
    { align: "center" }
  );
  doc.text("This is an automatically generated invoice.", { align: "center" });

  doc.end();
  return new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
