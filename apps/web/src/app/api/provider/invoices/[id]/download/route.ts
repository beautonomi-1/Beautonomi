import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/invoices/[id]/download
 * Generate and download invoice as PDF (or HTML for now)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    
    let providerId: string | null = null;
    if (user.role !== "superadmin") {
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) {
        return handleApiError(
          new Error("Provider not found"),
          "Provider not found",
          "NOT_FOUND",
          404
        );
      }
    }

    // Get invoice with all details (providers use business_name, not name)
    let query = supabase
      .from("provider_invoices")
      .select(
        `
        *,
        providers(id, business_name, billing_email, billing_phone, billing_address),
        line_items:provider_invoice_line_items(*),
        payments:provider_invoice_payments(*)
      `
      )
      .eq("id", id);

    if (providerId) {
      query = query.eq("provider_id", providerId);
    }

    const { data: invoice, error } = await query.single();

    if (error || !invoice) {
      return handleApiError(
        new Error("Invoice not found"),
        "Invoice not found",
        "NOT_FOUND",
        404
      );
    }

    // Generate HTML invoice
    const invoiceHTML = generateInvoiceHTML(invoice);

    // Return as HTML (can be converted to PDF later)
    return new Response(invoiceHTML, {
      headers: {
        "Content-Type": "text/html",
        "Content-Disposition": `attachment; filename="invoice-${invoice.invoice_number}.html"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to generate invoice");
  }
}

function generateInvoiceHTML(invoice: any) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-ZA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const provider = invoice.providers;
  const billingAddress = (typeof provider?.billing_address === "object" && provider?.billing_address) || {};
  const providerDisplayName = provider?.business_name ?? (provider as { name?: string })?.name ?? "Provider";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoice.invoice_number}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
      color: #333;
    }
    .header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid #FF0077;
    }
    .invoice-info {
      text-align: right;
    }
    .invoice-number {
      font-size: 24px;
      font-weight: bold;
      color: #FF0077;
      margin-bottom: 10px;
    }
    .section {
      margin-bottom: 30px;
    }
    .section-title {
      font-size: 14px;
      font-weight: bold;
      color: #666;
      margin-bottom: 10px;
      text-transform: uppercase;
    }
    .billing-details {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-bottom: 40px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th {
      background-color: #f5f5f5;
      padding: 12px;
      text-align: left;
      font-weight: bold;
      border-bottom: 2px solid #ddd;
    }
    td {
      padding: 12px;
      border-bottom: 1px solid #eee;
    }
    .text-right {
      text-align: right;
    }
    .totals {
      margin-top: 20px;
      display: flex;
      justify-content: flex-end;
    }
    .totals-table {
      width: 300px;
    }
    .totals-table td {
      padding: 8px 12px;
    }
    .total-row {
      font-weight: bold;
      font-size: 18px;
      border-top: 2px solid #333;
      border-bottom: 2px solid #333;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: bold;
      text-transform: uppercase;
    }
    .status-paid {
      background-color: #10b981;
      color: white;
    }
    .status-sent {
      background-color: #3b82f6;
      color: white;
    }
    .status-overdue {
      background-color: #ef4444;
      color: white;
    }
    .status-draft {
      background-color: #6b7280;
      color: white;
    }
    .footer {
      margin-top: 60px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      font-size: 12px;
      color: #666;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 style="margin: 0; color: #FF0077;">Beautonomi</h1>
      <p style="margin: 5px 0; color: #666;">Platform Invoice</p>
    </div>
    <div class="invoice-info">
      <div class="invoice-number">${invoice.invoice_number}</div>
      <div>Issue Date: ${formatDate(invoice.issue_date)}</div>
      <div>Due Date: ${formatDate(invoice.due_date)}</div>
      <div style="margin-top: 10px;">
        <span class="status-badge status-${invoice.status}">${invoice.status.replace("_", " ")}</span>
      </div>
    </div>
  </div>

  <div class="billing-details">
    <div>
      <div class="section-title">Bill To</div>
      <div>
        <strong>${providerDisplayName}</strong><br>
        ${billingAddress.address_line1 || ""}<br>
        ${billingAddress.city ? billingAddress.city + ", " : ""}
        ${billingAddress.country || ""}<br>
        ${provider?.billing_email || ""}<br>
        ${provider?.billing_phone || ""}
      </div>
    </div>
    <div>
      <div class="section-title">Billing Period</div>
      <div>
        ${formatDate(invoice.period_start)}<br>
        to<br>
        ${formatDate(invoice.period_end)}
      </div>
    </div>
  </div>

  <div class="section">
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th class="text-right">Quantity</th>
          <th class="text-right">Unit Price</th>
          <th class="text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${(invoice.line_items || []).map((item: any) => `
          <tr>
            <td>${item.description}</td>
            <td class="text-right">${item.quantity}</td>
            <td class="text-right">${formatCurrency(item.unit_price)}</td>
            <td class="text-right">${formatCurrency(item.total_price)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  </div>

  <div class="totals">
    <table class="totals-table">
      <tr>
        <td>Subtotal:</td>
        <td class="text-right">${formatCurrency(invoice.subtotal)}</td>
      </tr>
      <tr>
        <td>Tax (${invoice.tax_rate}%):</td>
        <td class="text-right">${formatCurrency(invoice.tax_amount)}</td>
      </tr>
      <tr class="total-row">
        <td>Total:</td>
        <td class="text-right">${formatCurrency(invoice.total_amount)}</td>
      </tr>
      ${Number(invoice.amount_paid ?? 0) > 0 ? `
        <tr>
          <td>Amount Paid:</td>
          <td class="text-right">${formatCurrency(Number(invoice.amount_paid ?? 0))}</td>
        </tr>
        <tr>
          <td><strong>Amount Due:</strong></td>
          <td class="text-right"><strong>${formatCurrency(Number(invoice.amount_due ?? invoice.total_amount ?? 0))}</strong></td>
        </tr>
      ` : ""}
    </table>
  </div>

  ${invoice.notes ? `
    <div class="section">
      <div class="section-title">Notes</div>
      <p>${invoice.notes}</p>
    </div>
  ` : ""}

  <div class="footer">
    <p>Thank you for using Beautonomi. For questions about this invoice, please contact support.</p>
    <p>This is an automatically generated invoice.</p>
  </div>
</body>
</html>
  `;
}
