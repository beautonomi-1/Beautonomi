import type PDFDocument from "pdfkit";
import {
  drawPdfPayments,
  drawPdfSectionTitle,
  drawPdfTotals,
  formatPaymentMethodLabel,
  formatPdfDate,
  moneyPdf,
} from "./pdf-design";

type PdfDoc = InstanceType<typeof PDFDocument>;

type OrderReceiptPdfExtras = {
  payment_method?: string | null;
  payment_reference?: string | null;
  payment_provider?: string | null;
  amount_paid?: number | null;
  balance_due?: number | null;
  wallet_amount?: number | null;
  tracking_number?: string | null;
  carrier?: string | null;
  tracking_url?: string | null;
  estimated_delivery_date?: string | null;
  delivery_instructions?: string | null;
  refunded_amount?: number | null;
  refund_reason?: string | null;
  refund_method?: string | null;
  total?: number | null;
  currency?: string;
};

export function drawOrderReceiptPdfExtras(doc: PdfDoc, receipt: OrderReceiptPdfExtras) {
  const currency = receipt.currency || "ZAR";

  if (receipt.tracking_number || receipt.tracking_url || receipt.carrier) {
    drawPdfSectionTitle(doc, "Shipping");
    if (receipt.carrier) doc.text(`Carrier: ${receipt.carrier}`);
    if (receipt.tracking_number) doc.text(`Tracking: ${receipt.tracking_number}`);
    if (receipt.tracking_url) doc.text(`Track online: ${receipt.tracking_url}`);
    if (receipt.estimated_delivery_date) {
      doc.text(`Estimated delivery: ${formatPdfDate(receipt.estimated_delivery_date)}`);
    }
    if (receipt.delivery_instructions) doc.text(`Instructions: ${receipt.delivery_instructions}`);
    doc.moveDown(0.5);
  }

  const walletAmt = Number(receipt.wallet_amount || 0);
  const amountPaid = Number(receipt.amount_paid ?? 0);
  const paymentLines: Parameters<typeof drawPdfPayments>[1] = [];

  if (walletAmt > 0.01) {
    paymentLines.push({
      label: "Wallet",
      amount: moneyPdf(walletAmt, currency),
      tone: "success",
    });
  }

  const method = receipt.payment_method;
  const nonWalletPaid = Math.max(0, amountPaid - walletAmt);
  if (method && nonWalletPaid > 0.01) {
    paymentLines.push({
      label: formatPaymentMethodLabel(method, receipt.payment_provider ?? null),
      detail: receipt.payment_reference ?? null,
      amount: moneyPdf(nonWalletPaid, currency),
      tone: "success",
    });
  } else if (method && amountPaid > 0.01 && walletAmt <= 0.01) {
    paymentLines.push({
      label: formatPaymentMethodLabel(method, receipt.payment_provider ?? null),
      detail: receipt.payment_reference ?? null,
      amount: moneyPdf(amountPaid, currency),
      tone: "success",
    });
  }

  if (paymentLines.length > 0) {
    drawPdfPayments(doc, paymentLines);
  }

  if (Number(receipt.refunded_amount) > 0) {
    drawPdfTotals(
      doc,
      [
        {
          label: "Refunded",
          value: `-${moneyPdf(receipt.refunded_amount, currency)}`,
          tone: "success",
        },
        ...(receipt.refund_reason
          ? [{ label: "Refund reason", value: receipt.refund_reason }]
          : []),
        ...(receipt.refund_method
          ? [{ label: "Refund method", value: receipt.refund_method }]
          : []),
      ],
      { label: "Net after refunds", value: moneyPdf(Math.max(0, Number(receipt.total || 0) - Number(receipt.refunded_amount || 0)), currency) },
    );
  }

  if (Number(receipt.balance_due) > 0.01) {
    drawPdfTotals(
      doc,
      [{ label: "Balance due", value: moneyPdf(receipt.balance_due, currency) }],
      { label: "Outstanding", value: moneyPdf(receipt.balance_due, currency) },
    );
  }
}
