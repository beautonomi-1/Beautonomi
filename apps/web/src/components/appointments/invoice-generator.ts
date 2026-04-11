import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

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

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Invoice - ${invoiceData.invoice_number}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
          .header { text-align: center; margin-bottom: 30px; }
          .invoice-details { display: flex; justify-content: space-between; margin-bottom: 30px; }
          .section { margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background-color: #f5f5f5; }
          .total { font-size: 18px; font-weight: bold; }
          .text-right { text-align: right; }
          .summary { margin-top: 20px; }
          .summary-row { display: flex; justify-content: space-between; padding: 5px 0; }
          .summary-total { border-top: 2px solid #000; margin-top: 10px; padding-top: 10px; font-weight: bold; }
        </style>
      </head>
      <body>
        ${invoiceData.receipt_header ? `<div style="text-align: center; margin-bottom: 15px; color: #555; font-size: 14px; white-space: pre-line;">${invoiceData.receipt_header}</div>` : ''}
        <div class="header">
          <h1>INVOICE</h1>
          <p>Invoice #: ${invoiceData.invoice_number}</p>
          <p>Date: ${invoiceData.invoice_date}</p>
          ${invoiceData.booking_date ? `<p>Booking Date: ${invoiceData.booking_date}</p>` : ''}
        </div>
        
        <div class="invoice-details">
          <div>
            <h3>From:</h3>
            <p><strong>${invoiceData.provider.name}</strong></p>
            ${invoiceData.provider.email ? `<p>Email: ${invoiceData.provider.email}</p>` : ''}
            ${invoiceData.provider.phone ? `<p>Phone: ${invoiceData.provider.phone}</p>` : ''}
            ${invoiceData.provider.address.line1 ? `<p>${invoiceData.provider.address.line1}</p>` : ''}
            ${invoiceData.provider.address.line2 ? `<p>${invoiceData.provider.address.line2}</p>` : ''}
            ${invoiceData.provider.address.city ? `<p>${invoiceData.provider.address.city}${invoiceData.provider.address.state ? ', ' + invoiceData.provider.address.state : ''} ${invoiceData.provider.address.postal_code || ''}</p>` : ''}
          </div>
          <div>
            <h3>Bill To:</h3>
            <p><strong>${invoiceData.customer.name}</strong></p>
            ${invoiceData.customer.email ? `<p>Email: ${invoiceData.customer.email}</p>` : ''}
            ${invoiceData.customer.phone ? `<p>Phone: ${invoiceData.customer.phone}</p>` : ''}
          </div>
        </div>
        
        ${invoiceData.location_type === 'at_home' && invoiceData.service_address ? `
          <div class="section" style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
            <h3 style="margin-top: 0;">Service Location:</h3>
            ${invoiceData.service_address.line1 ? `<p style="margin: 5px 0;">${invoiceData.service_address.line1}</p>` : ''}
            ${invoiceData.service_address.line2 ? `<p style="margin: 5px 0;">${invoiceData.service_address.line2}</p>` : ''}
            ${invoiceData.service_address.city ? `<p style="margin: 5px 0;">${invoiceData.service_address.city}${invoiceData.service_address.state ? ', ' + invoiceData.service_address.state : ''} ${invoiceData.service_address.postal_code || ''}</p>` : ''}
          </div>
        ` : ''}
        
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
              ${invoiceData.items.map((item: any) => `
                <tr>
                  <td>${item.description}${item.staff ? ` (${item.staff})` : ''}${item.duration ? ` (${item.duration} min)` : ''}</td>
                  <td class="text-right">${item.quantity}</td>
                  <td class="text-right">${formatCurrency(item.unit_price)}</td>
                  <td class="text-right">${formatCurrency(item.total)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        
        <div class="summary">
          <div class="summary-row">
            <span>Subtotal:</span>
            <span>${formatCurrency(invoiceData.subtotal)}</span>
          </div>
          ${invoiceData.discount_amount > 0 ? `
            <div class="summary-row">
              <span>Discount${invoiceData.discount_reason ? ` (${invoiceData.discount_reason})` : ''}:</span>
              <span>-${formatCurrency(invoiceData.discount_amount)}</span>
            </div>
          ` : ''}
          ${invoiceData.travel_fee > 0 ? `
            <div class="summary-row">
              <span>Travel Fee:</span>
              <span>${formatCurrency(invoiceData.travel_fee)}</span>
            </div>
          ` : ''}
          ${invoiceData.tax_amount > 0 ? `
            <div class="summary-row">
              <span>Tax${invoiceData.tax_rate > 0 ? ` (${invoiceData.tax_rate.toFixed(1)}%)` : ''}:</span>
              <span>${formatCurrency(invoiceData.tax_amount)}</span>
            </div>
          ` : ''}
          ${(invoiceData as any).service_fee_amount > 0 ? `
            <div class="summary-row">
              <span>Service Fee${(invoiceData as any).service_fee_percentage > 0 ? ` (${((invoiceData as any).service_fee_percentage * 100).toFixed(1)}%)` : ''}:</span>
              <span>${formatCurrency((invoiceData as any).service_fee_amount)}</span>
            </div>
          ` : ''}
          ${invoiceData.tip_amount > 0 ? `
            <div class="summary-row">
              <span>Tip:</span>
              <span>${formatCurrency(invoiceData.tip_amount)}</span>
            </div>
          ` : ''}
          ${(invoiceData as any).cancellation_fee > 0 ? `
            <div class="summary-row">
              <span>Cancellation fee:</span>
              <span>${formatCurrency((invoiceData as any).cancellation_fee)}</span>
            </div>
          ` : ''}
          <div class="summary-row summary-total">
            <span>Total Amount:</span>
            <span>${formatCurrency(invoiceData.total_amount)}</span>
          </div>
          ${invoiceData.deposit_required && invoiceData.payment_option === 'deposit' ? `
            <div class="summary-row" style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #ccc;">
              <span>Deposit${invoiceData.deposit_percentage > 0 ? ` (${invoiceData.deposit_percentage}%)` : ''}:</span>
              <span>${formatCurrency(invoiceData.deposit_amount || 0)}</span>
            </div>
            ${invoiceData.amount_paid != null ? `
              <div class="summary-row">
                <span>Amount Paid:</span>
                <span>${formatCurrency(invoiceData.amount_paid)}</span>
              </div>
            ` : ''}
            ${invoiceData.balance_due != null && invoiceData.balance_due > 0 ? `
              <div class="summary-row" style="font-weight: bold; color: #b91c1c;">
                <span>Balance Due:</span>
                <span>${formatCurrency(invoiceData.balance_due)}</span>
              </div>
            ` : ''}
          ` : `
            ${invoiceData.amount_paid != null && invoiceData.amount_paid > 0 && invoiceData.balance_due != null && invoiceData.balance_due > 0 ? `
              <div class="summary-row" style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #ccc;">
                <span>Amount Paid:</span>
                <span>${formatCurrency(invoiceData.amount_paid)}</span>
              </div>
              <div class="summary-row" style="font-weight: bold; color: #b91c1c;">
                <span>Balance Due:</span>
                <span>${formatCurrency(invoiceData.balance_due)}</span>
              </div>
            ` : ''}
          `}
        </div>
        
        ${invoiceData.additional_charges && invoiceData.additional_charges.length > 0 ? `
          <div class="section" style="margin-top: 20px;">
            <h3>Additional Charges</h3>
            ${invoiceData.additional_charges.map((charge: any) => `
              <div class="summary-row">
                <span>${charge.description || 'Additional charge'} <em style="color: #666; font-size: 0.85em;">(${charge.status || 'pending'})</em></span>
                <span>${formatCurrency(charge.amount || 0)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
        
        ${invoiceData.payment_status ? `
          <div class="section" style="margin-top: 20px; padding: 10px; background-color: ${
            invoiceData.payment_status === 'paid' ? '#d4edda' : 
            invoiceData.payment_status === 'pending' ? '#fff3cd' : '#f8d7da'
          }; border-radius: 5px;">
            <p style="margin: 0;"><strong>Payment Status:</strong> ${
              invoiceData.payment_status === 'paid' ? 'PAID' :
              invoiceData.payment_status === 'pending' ? 'PENDING' :
              invoiceData.payment_status === 'failed' ? 'FAILED' :
              invoiceData.payment_status.toUpperCase()
            }</p>
          </div>
        ` : ''}
        
        ${invoiceData.notes ? `
          <div class="section">
            <h3>Notes:</h3>
            <p>${invoiceData.notes}</p>
          </div>
        ` : ''}
        ${invoiceData.receipt_footer ? `<div style="margin-top: 40px; padding-top: 15px; border-top: 1px solid #ddd; text-align: center; color: #666; font-size: 12px; white-space: pre-line;">${invoiceData.receipt_footer}</div>` : ''}
      </body>
    </html>
  `;
}
