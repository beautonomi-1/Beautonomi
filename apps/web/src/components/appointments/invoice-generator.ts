import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { i18n, initI18n } from "@beautonomi/i18n";

function inv(key: string, opts?: Record<string, unknown>) {
  if (!i18n.isInitialized) {
    initI18n();
  }
  return String(i18n.t(`web.appointments.invoiceGenerator.${key}`, opts));
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function generateInvoiceHTMLFromData(
  invoiceData: any,
  providerCurrency?: string,
): string {
  const displayCurrency =
    (invoiceData.currency as string | undefined)?.trim() ||
    providerCurrency?.trim() ||
    LAST_RESORT_CURRENCY;
  const formatCurrency = (amount: number) => {
    return `${displayCurrency} ${amount.toFixed(2)}`;
  };
  const platformFeeAmount = Number(
    (invoiceData as any).platform_fee_amount ?? (invoiceData as any).service_fee_amount ?? 0,
  );
  const rawPlatformFeePercentage = Number(
    (invoiceData as any).platform_fee_percentage ?? (invoiceData as any).service_fee_percentage ?? 0,
  );
  const platformFeePercentage =
    Number.isFinite(rawPlatformFeePercentage) && rawPlatformFeePercentage > 0
      ? rawPlatformFeePercentage <= 1
        ? rawPlatformFeePercentage * 100
        : rawPlatformFeePercentage
      : 0;
  const platformFeePercentageLabel =
    platformFeePercentage > 0
      ? inv("platformFeePct", { pct: platformFeePercentage.toFixed(platformFeePercentage % 1 === 0 ? 0 : 1) })
      : "";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${escapeHtml(inv("documentTitle", { number: invoiceData.invoice_number }))}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
          .header { text-align: center; margin-bottom: 30px; }
          .invoice-details { display: flex; justify-content: space-between; margin-bottom: 30px; }
          .section { margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background-color: #f5f5f5; }
          .total { font-size: 18px; font-weight: bold; }
          .text-end { text-align: right; }
          .summary { margin-top: 20px; }
          .summary-row { display: flex; justify-content: space-between; padding: 5px 0; }
          .summary-total { border-top: 2px solid #000; margin-top: 10px; padding-top: 10px; font-weight: bold; }
        </style>
      </head>
      <body>
        ${invoiceData.receipt_header ? `<div style="text-align: center; margin-bottom: 15px; color: #555; font-size: 14px; white-space: pre-line;">${escapeHtml(invoiceData.receipt_header)}</div>` : ''}
        <div class="header">
          <h1>${escapeHtml(inv("heading"))}</h1>
          <p>${escapeHtml(inv("invoiceNumber", { number: invoiceData.invoice_number }))}</p>
          <p>${escapeHtml(inv("date", { date: invoiceData.invoice_date }))}</p>
          ${invoiceData.booking_date ? `<p>${escapeHtml(inv("bookingDate", { date: invoiceData.booking_date }))}</p>` : ''}
        </div>
        
        <div class="invoice-details">
          <div>
            <h3>${escapeHtml(inv("from"))}</h3>
            <p><strong>${escapeHtml(invoiceData.provider.name)}</strong></p>
            ${invoiceData.provider.email ? `<p>${escapeHtml(inv("email", { email: invoiceData.provider.email }))}</p>` : ''}
            ${invoiceData.provider.phone ? `<p>${escapeHtml(inv("phone", { phone: invoiceData.provider.phone }))}</p>` : ''}
            ${invoiceData.provider.address.line1 ? `<p>${escapeHtml(invoiceData.provider.address.line1)}</p>` : ''}
            ${invoiceData.provider.address.line2 ? `<p>${escapeHtml(invoiceData.provider.address.line2)}</p>` : ''}
            ${invoiceData.provider.address.city ? `<p>${escapeHtml(invoiceData.provider.address.city)}${invoiceData.provider.address.state ? ', ' + escapeHtml(invoiceData.provider.address.state) : ''} ${escapeHtml(invoiceData.provider.address.postal_code || '')}</p>` : ''}
          </div>
          <div>
            <h3>${escapeHtml(inv("billTo"))}</h3>
            <p><strong>${escapeHtml(invoiceData.customer.name)}</strong></p>
            ${invoiceData.customer.email ? `<p>${escapeHtml(inv("email", { email: invoiceData.customer.email }))}</p>` : ''}
            ${invoiceData.customer.phone ? `<p>${escapeHtml(inv("phone", { phone: invoiceData.customer.phone }))}</p>` : ''}
          </div>
        </div>
        
        ${invoiceData.location_type === 'at_home' && invoiceData.service_address ? `
          <div class="section" style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
            <h3 style="margin-top: 0;">${escapeHtml(inv("serviceLocation"))}</h3>
            ${invoiceData.service_address.line1 ? `<p style="margin: 5px 0;">${escapeHtml(invoiceData.service_address.line1)}</p>` : ''}
            ${invoiceData.service_address.line2 ? `<p style="margin: 5px 0;">${escapeHtml(invoiceData.service_address.line2)}</p>` : ''}
            ${invoiceData.service_address.city ? `<p style="margin: 5px 0;">${escapeHtml(invoiceData.service_address.city)}${invoiceData.service_address.state ? ', ' + escapeHtml(invoiceData.service_address.state) : ''} ${escapeHtml(invoiceData.service_address.postal_code || '')}</p>` : ''}
          </div>
        ` : ''}
        
        <div class="section">
          <table>
            <thead>
              <tr>
                <th>${escapeHtml(inv("description"))}</th>
                <th class="text-end">${escapeHtml(inv("quantity"))}</th>
                <th class="text-end">${escapeHtml(inv("unitPrice"))}</th>
                <th class="text-end">${escapeHtml(inv("total"))}</th>
              </tr>
            </thead>
            <tbody>
              ${invoiceData.items.map((item: any) => `
                <tr>
                  <td>${escapeHtml(item.description)}${item.staff ? ` (${escapeHtml(item.staff)})` : ''}${item.duration ? ` (${escapeHtml(inv("durationMin", { duration: item.duration }))})` : ''}</td>
                  <td class="text-end">${item.quantity}</td>
                  <td class="text-end">${formatCurrency(item.unit_price)}</td>
                  <td class="text-end">${formatCurrency(item.total)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        
        <div class="summary">
          <div class="summary-row">
            <span>${escapeHtml(inv("subtotal"))}</span>
            <span>${formatCurrency(invoiceData.subtotal)}</span>
          </div>
          ${invoiceData.discount_amount > 0 ? `
            <div class="summary-row">
              <span>${escapeHtml(invoiceData.discount_reason ? inv("discountWithReason", { reason: invoiceData.discount_reason }) : inv("discount"))}:</span>
              <span>-${formatCurrency(invoiceData.discount_amount)}</span>
            </div>
          ` : ''}
          ${invoiceData.travel_fee > 0 ? `
            <div class="summary-row">
              <span>${escapeHtml(inv("travelFee"))}</span>
              <span>${formatCurrency(invoiceData.travel_fee)}</span>
            </div>
          ` : ''}
          ${invoiceData.tax_amount > 0 ? `
            <div class="summary-row">
              <span>${escapeHtml(invoiceData.tax_rate > 0 ? inv("taxWithRate", { rate: invoiceData.tax_rate.toFixed(1) }) : inv("tax"))}:</span>
              <span>${formatCurrency(invoiceData.tax_amount)}</span>
            </div>
          ` : ''}
          ${platformFeeAmount > 0 ? `
            <div class="summary-row">
              <span>${escapeHtml(inv("platformFeeWithPct", { pct: platformFeePercentageLabel }))}</span>
              <span>${formatCurrency(platformFeeAmount)}</span>
            </div>
          ` : ''}
          ${invoiceData.tip_amount > 0 ? `
            <div class="summary-row">
              <span>${escapeHtml(inv("tip"))}</span>
              <span>${formatCurrency(invoiceData.tip_amount)}</span>
            </div>
          ` : ''}
          ${(invoiceData as any).cancellation_fee > 0 ? `
            <div class="summary-row">
              <span>${escapeHtml(inv("cancellationFee"))}</span>
              <span>${formatCurrency((invoiceData as any).cancellation_fee)}</span>
            </div>
          ` : ''}
          <div class="summary-row summary-total">
            <span>${escapeHtml(inv("totalAmount"))}</span>
            <span>${formatCurrency(invoiceData.total_amount)}</span>
          </div>
          ${invoiceData.deposit_required && invoiceData.payment_option === 'deposit' ? `
            <div class="summary-row" style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #ccc;">
              <span>${escapeHtml(invoiceData.deposit_percentage > 0 ? inv("depositWithPct", { pct: invoiceData.deposit_percentage }) : inv("deposit"))}:</span>
              <span>${formatCurrency(invoiceData.deposit_amount || 0)}</span>
            </div>
            ${invoiceData.amount_paid != null ? `
              <div class="summary-row">
                <span>${escapeHtml(inv("amountPaid"))}</span>
                <span>${formatCurrency(invoiceData.amount_paid)}</span>
              </div>
            ` : ''}
            ${invoiceData.balance_due != null && invoiceData.balance_due > 0 ? `
              <div class="summary-row" style="font-weight: bold; color: #b91c1c;">
                <span>${escapeHtml(inv("balanceDue"))}</span>
                <span>${formatCurrency(invoiceData.balance_due)}</span>
              </div>
            ` : ''}
          ` : `
            ${invoiceData.amount_paid != null && invoiceData.amount_paid > 0 && invoiceData.balance_due != null && invoiceData.balance_due > 0 ? `
              <div class="summary-row" style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #ccc;">
                <span>${escapeHtml(inv("amountPaid"))}</span>
                <span>${formatCurrency(invoiceData.amount_paid)}</span>
              </div>
              <div class="summary-row" style="font-weight: bold; color: #b91c1c;">
                <span>${escapeHtml(inv("balanceDue"))}</span>
                <span>${formatCurrency(invoiceData.balance_due)}</span>
              </div>
            ` : ''}
          `}
        </div>
        
        ${invoiceData.additional_charges && invoiceData.additional_charges.length > 0 ? `
          <div class="section" style="margin-top: 20px;">
            <h3>${escapeHtml(inv("additionalCharges"))}</h3>
            ${invoiceData.additional_charges.map((charge: any) => {
              const statusLabel = charge.status === 'paid'
                ? (charge.paid_at ? inv("paidOn", { date: new Date(charge.paid_at).toLocaleDateString() }) : inv("paid"))
                : (charge.status || inv("pending"));
              const statusColor = charge.status === 'paid' ? '#28a745' : '#dc3545';
              return `
              <div class="summary-row">
                <span>${escapeHtml(charge.description || inv("additionalChargeFallback"))} <em style="color: ${statusColor}; font-size: 0.85em;">(${escapeHtml(statusLabel)})</em></span>
                <span>${formatCurrency(charge.amount || 0)}</span>
              </div>`;
            }).join('')}
          </div>
        ` : ''}
        
        ${invoiceData.payment_status ? `
          <div class="section" style="margin-top: 20px; padding: 10px; background-color: ${
            invoiceData.payment_status === 'paid' ? '#d4edda' : 
            invoiceData.payment_status === 'pending' ? '#fff3cd' : '#f8d7da'
          }; border-radius: 5px;">
            <p style="margin: 0;"><strong>${escapeHtml(inv("paymentStatus"))}</strong> ${
              invoiceData.payment_status === 'paid' ? escapeHtml(inv("statusPaid")) :
              invoiceData.payment_status === 'pending' ? escapeHtml(inv("statusPending")) :
              invoiceData.payment_status === 'failed' ? escapeHtml(inv("statusFailed")) :
              escapeHtml(invoiceData.payment_status.toUpperCase())
            }</p>
          </div>
        ` : ''}
        
        ${invoiceData.notes ? `
          <div class="section">
            <h3>${escapeHtml(inv("notes"))}</h3>
            <p>${escapeHtml(invoiceData.notes)}</p>
          </div>
        ` : ''}
        ${invoiceData.receipt_footer ? `<div style="margin-top: 40px; padding-top: 15px; border-top: 1px solid #ddd; text-align: center; color: #666; font-size: 12px; white-space: pre-line;">${escapeHtml(invoiceData.receipt_footer)}</div>` : ''}
      </body>
    </html>
  `;
}
