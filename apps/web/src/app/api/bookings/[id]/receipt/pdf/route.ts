import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { GET as getReceiptJson } from "../route";
import { parseReceiptDownloadToken } from "@/lib/receipts/receipt-download-token";
import {
  buildReceiptCacheKey,
  isFinalizedForCache,
  loadCachedReceiptPdf,
  saveCachedReceiptPdf,
} from "@/lib/receipts/pdf-cache";
import {
  drawPdfFooter,
  drawPdfHeader,
  drawPdfInfoGrid,
  drawPdfLineItems,
  drawPdfPayments,
  drawPdfTotals,
  formatPaymentMethodLabel,
  formatPdfDate,
  moneyPdf,
} from "@/lib/receipts/pdf-design";
import { assertReceiptInvariant } from "@/lib/bookings/display-invariants";
import { isPaidBookingPaymentStatus } from "@/lib/payments/booking-payment-status";

// Wave 2.5 (audit 2026-04 final 100/100): extend serverless timeout to
// 60s so large receipts (many services + products + additional charges +
// long receipt headers/footers) still complete on the Vercel Pro tier.
// Finalized receipts are cached to Supabase Storage; only the first
// cold request pays the generation cost. Hobby tier silently ignores
// this export.
export const maxDuration = 60;

/**
 * §Customer-launch (audit 2026-04): supports two auth modes:
 *   1. Normal `Authorization: Bearer` / cookie session (customer web).
 *   2. Short-lived `?token=<hmac>` minted by
 *      POST /api/bookings/[id]/receipt/signed-url (native customer app).
 *
 * §Customer-audit 2026-04 follow-up: historically we synthesised a
 * service-role Bearer + `x-receipt-download-user-id` header here so the
 * sibling JSON route's `requireRoleInApi` check would pass. That was
 * broken (service-role JWTs aren't user tokens and `getUser()` rejects
 * them) — the JSON route now reads the `?token=` query directly.
 * We still validate the token here so we can fail fast with 401 before
 * generating any PDF, but we no longer attach a service-role Bearer
 * to the forwarded request.
 */

type ReceiptPayload = {
  receipt?: {
    package_id?: string | null;
    package_name?: string | null;
    booking_number?: string;
    booking_date?: string;
    service_date?: string;
    customer?: { full_name?: string | null; email?: string | null };
    provider?: { business_name?: string | null };
    services?: Array<{ name?: string; quantity?: number; total?: number }>;
    addons?: Array<{ name?: string; quantity?: number; total?: number }>;
    products?: Array<{ name?: string; quantity?: number; total?: number }>;
    subtotal?: number;
    tax?: number;
    tax_rate?: number;
    fees?: number;
    platform_fee_percentage?: number;
    service_fee_percentage?: number;
    travel_fee?: number;
    tip_amount?: number;
    cancellation_fee?: number;
    discount?: number;
    promotion_discount_amount?: number;
    membership_discount_amount?: number;
    loyalty_discount_amount?: number;
    package_discount_amount?: number;
    wallet_amount?: number;
    gift_card_amount?: number;
    total_refunded?: number;
    discount_reason?: string | null;
    total?: number;
    currency?: string;
    payment_status?: string;
    amount_paid?: number;
    balance_due?: number;
    deposit_required?: boolean;
    deposit_amount?: number;
    deposit_percentage?: number;
    payment_option?: string;
    additional_charges?: Array<{ description?: string; amount?: number; status?: string; paid_at?: string | null }>;
    transactions?: Array<{
      id?: string;
      amount?: number | string;
      payment_method?: string | null;
      payment_provider?: string | null;
      status?: string | null;
      created_at?: string | null;
    }>;
    receipt_header?: string | null;
    receipt_footer?: string | null;
  };
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const id = resolvedParams.id;

    const token = new URL(request.url).searchParams.get("token");
    if (token) {
      const parsed = parseReceiptDownloadToken(token, {
        kind: "customer_booking_receipt",
        subjectId: id,
      });
      if (!parsed) {
        return NextResponse.json(
          { error: "Signed download token is invalid or expired" },
          { status: 401 },
        );
      }
    }

    const upstream = await getReceiptJson(request, { params: Promise.resolve(resolvedParams) });

    if (!upstream.ok) {
      const text = await upstream.text();
      return new NextResponse(text, {
        status: upstream.status,
        headers: {
          "content-type": upstream.headers.get("content-type") ?? "application/json",
        },
      });
    }

    const payload = (await upstream.json()) as ReceiptPayload;
    const receipt = payload.receipt;
    if (!receipt) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    // Wave 2.5: try the PDF cache first for finalized receipts.
    const cacheKeyInput = {
      bookingId: id,
      totalAmount: Number(receipt.total || 0),
      totalPaid: Number(receipt.amount_paid || 0),
      walletAmount: Number((receipt as { wallet_amount?: number }).wallet_amount || 0),
      giftCardAmount: Number((receipt as { gift_card_amount?: number }).gift_card_amount || 0),
      totalRefunded: Number((receipt as { total_refunded?: number }).total_refunded || 0),
      paymentStatus: String(receipt.payment_status || ""),
      balanceDue: Number(receipt.balance_due || 0),
    };
    const canCache = isFinalizedForCache(cacheKeyInput);
    const cacheKey = canCache ? buildReceiptCacheKey(cacheKeyInput) : null;
    if (cacheKey) {
      const cached = await loadCachedReceiptPdf(cacheKey);
      if (cached) {
        return new NextResponse(new Uint8Array(cached.buffer), {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": `attachment; filename="receipt-${receipt.booking_number || id}.pdf"`,
            "cache-control": "private, max-age=300",
            "x-receipt-pdf-cache": "hit",
          },
        });
      }
    }

    const currency = receipt.currency || "ZAR";
    const formatPercent = (value?: number) => {
      const n = Number(value || 0);
      if (!Number.isFinite(n) || n <= 0) return "";
      const display = n <= 1 ? n * 100 : n;
      return Number.isInteger(display) ? String(display) : display.toFixed(1);
    };
    const platformFeePercent = formatPercent(receipt.platform_fee_percentage ?? receipt.service_fee_percentage);
    const platformFeeLabel = platformFeePercent ? `Platform fee (${platformFeePercent}%)` : "Platform fee";
    const items = [
      ...(receipt.services || []).map((s) => ({
        name: s.name || "Service",
        quantity: Number(s.quantity || 1),
        total: Number(s.total || 0),
      })),
      ...(receipt.addons || []).map((a) => ({
        name: `Add-on: ${a.name || "Add-on"}`,
        quantity: Number(a.quantity || 1),
        total: Number(a.total || 0),
      })),
      ...(receipt.products || []).map((p) => ({
        name: p.name || "Product",
        quantity: Number(p.quantity || 1),
        total: Number(p.total || 0),
      })),
    ];

    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));

    drawPdfHeader(doc, {
      title: "Receipt",
      subtitle: "Booking receipt and payment summary",
      documentNumber: receipt.booking_number || id,
      status: receipt.payment_status || "pending",
      note: receipt.receipt_header,
    });

    drawPdfInfoGrid(doc, [
      {
        label: "Customer",
        lines: [receipt.customer?.full_name || receipt.customer?.email || "-", receipt.customer?.email],
      },
      {
        label: "Provider",
        lines: [receipt.provider?.business_name || "-"],
      },
      {
        label: "Booking",
        lines: [
          `Booked ${formatPdfDate(receipt.booking_date)}`,
          `Service ${formatPdfDate(receipt.service_date)}`,
          ...(receipt.package_name ? [`Package: ${receipt.package_name}`] : []),
        ],
      },
    ]);

    drawPdfLineItems(
      doc,
      items.map((item) => ({
        description: item.name,
        detail: `Quantity ${item.quantity}`,
        amount: moneyPdf(item.total, currency),
      })),
      { title: "Items" },
    );

    const totalRows = [
      { label: "Subtotal", value: moneyPdf(receipt.subtotal, currency) },
      ...(Number(receipt.travel_fee || 0) > 0 ? [{ label: "Travel fee", value: moneyPdf(receipt.travel_fee, currency) }] : []),
      ...(Number(receipt.tax || 0) > 0
        ? [{ label: receipt.tax_rate ? `Tax (${receipt.tax_rate}%)` : "Tax", value: moneyPdf(receipt.tax, currency) }]
        : []),
      ...(Number(receipt.fees || 0) > 0 ? [{ label: platformFeeLabel, value: moneyPdf(receipt.fees, currency) }] : []),
      ...(Number(receipt.tip_amount || 0) > 0 ? [{ label: "Tip", value: moneyPdf(receipt.tip_amount, currency) }] : []),
      ...(Number(receipt.cancellation_fee || 0) > 0
        ? [{ label: "Cancellation fee", value: moneyPdf(receipt.cancellation_fee, currency), tone: "warning" as const }]
        : []),
      ...(Number(receipt.discount || 0) > 0 &&
      Number(receipt.package_discount_amount || 0) +
        Number(receipt.promotion_discount_amount || 0) +
        Number(receipt.membership_discount_amount || 0) +
        Number(receipt.loyalty_discount_amount || 0) === 0
        ? [{ label: receipt.discount_reason ? `Discount (${receipt.discount_reason})` : "Discount", value: `-${moneyPdf(receipt.discount, currency)}`, tone: "success" as const }]
        : []),
      ...(Number(receipt.package_discount_amount || 0) > 0
        ? [{ label: "Package discount", value: `-${moneyPdf(receipt.package_discount_amount, currency)}`, tone: "success" as const }]
        : []),
      ...(Number(receipt.promotion_discount_amount || 0) > 0
        ? [{ label: "Promotion discount", value: `-${moneyPdf(receipt.promotion_discount_amount, currency)}`, tone: "success" as const }]
        : []),
      ...(Number(receipt.membership_discount_amount || 0) > 0
        ? [{ label: "Membership discount", value: `-${moneyPdf(receipt.membership_discount_amount, currency)}`, tone: "success" as const }]
        : []),
      ...(Number(receipt.loyalty_discount_amount || 0) > 0
        ? [{ label: "Loyalty discount", value: `-${moneyPdf(receipt.loyalty_discount_amount, currency)}`, tone: "success" as const }]
        : []),
      ...(receipt.deposit_required && receipt.payment_option === "deposit"
        ? [{ label: `Deposit${receipt.deposit_percentage ? ` (${receipt.deposit_percentage}%)` : ""}`, value: moneyPdf(receipt.deposit_amount, currency) }]
        : []),
      // §Finance-truth 2026-05: wallet/gift are payment lines (rendered in the
      // Payments section below). Showing them as negative deductions from total
      // here while ALSO including them in `amount_paid` (which migration 582 makes
      // total_paid include) double-counts. Refunds and amount_paid stay summary lines.
      ...(Number(receipt.total_refunded || 0) > 0 ? [{ label: "Refunded", value: `-${moneyPdf(receipt.total_refunded, currency)}`, tone: "warning" as const }] : []),
      ...(Number(receipt.amount_paid || 0) > 0 ? [{ label: "Amount paid", value: moneyPdf(receipt.amount_paid, currency) }] : []),
      ...(Number(receipt.balance_due || 0) > 0
        ? [{ label: "Balance due", value: moneyPdf(receipt.balance_due, currency), tone: "danger" as const }]
        : []),
    ];
    drawPdfTotals(doc, totalRows, { label: "Total", value: moneyPdf(receipt.total, currency) });

    // Payments section: one row per completed booking_payments row. Wallet and
    // gift card credits live here (via migration 582) so customers see exactly
    // what was tendered and via which method.
    const completedPayments = (receipt.transactions || []).filter(
      (t) => isPaidBookingPaymentStatus(t.status),
    );
    if (completedPayments.length > 0) {
      doc.moveDown(0.4);
      drawPdfPayments(
        doc,
        completedPayments.map((t) => ({
          label: formatPaymentMethodLabel(t.payment_method ?? null, t.payment_provider ?? null),
          detail: t.created_at ? formatPdfDate(t.created_at) : null,
          amount: moneyPdf(Number(t.amount || 0), currency),
          tone: "success" as const,
        })),
      );
    }

    assertReceiptInvariant("customer-booking-receipt-pdf", {
      total: Number(receipt.total ?? 0),
      subtotal: Number(receipt.subtotal ?? 0),
      travel_fee: Number(receipt.travel_fee ?? 0),
      tax: Number(receipt.tax ?? 0),
      fees: Number(receipt.fees ?? 0),
      tip_amount: Number(receipt.tip_amount ?? 0),
      discount: Number(receipt.discount ?? 0),
      promotion_discount_amount: Number(receipt.promotion_discount_amount ?? 0),
      membership_discount_amount: Number(receipt.membership_discount_amount ?? 0),
      loyalty_discount_amount: Number(receipt.loyalty_discount_amount ?? 0),
      cancellation_fee: Number(receipt.cancellation_fee ?? 0),
    });

    if (receipt.additional_charges && receipt.additional_charges.length > 0) {
      doc.moveDown(0.4);
      drawPdfLineItems(
        doc,
        receipt.additional_charges.map((charge) => ({
          description: charge.description || "Additional charge",
          detail: charge.status === "paid"
            ? `Paid${charge.paid_at ? ` on ${formatPdfDate(charge.paid_at)}` : ""}`
            : (charge.status || "Pending"),
          amount: moneyPdf(charge.amount, currency),
        })),
        { title: "Additional charges" },
      );
    }

    drawPdfFooter(doc, receipt.receipt_footer);

    doc.end();
    const buffer = await new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    // Wave 2.5: persist cache on first cold generation for finalized
    // receipts. Fire-and-forget; failure to write doesn't block the
    // response.
    if (cacheKey) {
      void saveCachedReceiptPdf(cacheKey, buffer);
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="receipt-${receipt.booking_number || id}.pdf"`,
        "cache-control": canCache ? "private, max-age=300" : "no-store",
        "x-receipt-pdf-cache": canCache ? "miss-written" : "skip",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate PDF receipt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
