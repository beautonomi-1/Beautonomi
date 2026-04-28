import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { GET as getProviderReceiptJson } from "../route";
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
  drawPdfSectionTitle,
  drawPdfTotals,
  formatPdfDate,
  moneyPdf,
} from "@/lib/receipts/pdf-design";

// Wave 2.5 (audit 2026-04 final 100/100): 60s serverless budget +
// Supabase Storage-backed cache for finalized receipts. Cold cost is
// paid once; subsequent downloads are a single storage read.
export const maxDuration = 60;

/**
 * GET /api/provider/bookings/[id]/receipt/pdf
 *
 * Generate a real PDF receipt for a provider booking.
 * Calls the sibling receipt handler directly (same process) to avoid
 * internal HTTP fetch issues with auth/cookie forwarding in production.
 *
 * Two auth modes:
 *   1. Normal `Authorization: Bearer` / cookie session (web).
 *   2. Short-lived `?token=<hmac>` minted by
 *      POST /api/provider/bookings/[id]/receipt/signed-url (native app).
 *
 * §Provider-audit 2026-04: the JSON sibling used to be fed a service-role
 * Bearer so its `requireRoleInApi` check would pass. That was broken
 * (service-role JWTs aren't user tokens) — the JSON route now reads the
 * `?token=` query directly. We still validate here so we can fail fast
 * before generating a PDF, but we no longer attach a service-role Bearer.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const id = resolvedParams.id;

    // Group bookings don't have individual PDF receipts; return a clear error.
    if (id.startsWith("group:")) {
      return NextResponse.json(
        { error: "PDF receipts for group bookings are managed from the Group Bookings section." },
        { status: 404 },
      );
    }

    const token = new URL(request.url).searchParams.get("token");
    if (token) {
      const parsed = parseReceiptDownloadToken(token, {
        kind: "provider_booking_receipt",
        subjectId: id,
      });
      if (!parsed) {
        return NextResponse.json(
          { error: "Signed download token is invalid or expired" },
          { status: 401 },
        );
      }
    }

    const upstream = await getProviderReceiptJson(request, { params: Promise.resolve(resolvedParams) });

    if (!upstream.ok) {
      const text = await upstream.text();
      return new NextResponse(text, {
        status: upstream.status,
        headers: {
          "content-type":
            upstream.headers.get("content-type") ?? "application/json",
        },
      });
    }

    const payload = (await upstream.json()) as { data?: ReceiptData };
    const r = payload.data;
    if (!r) {
      return NextResponse.json(
        { error: "Receipt data not found" },
        { status: 404 }
      );
    }

    // Wave 2.5: serve from cache when booking is finalized.
    const cacheInput = {
      bookingId: id,
      totalAmount: Number(r.total_amount || 0),
      totalPaid: Number(r.amount_paid || 0),
      totalRefunded: Number((r as ReceiptData & { total_refunded?: number }).total_refunded || 0),
      paymentStatus: String(r.payment_status || ""),
      balanceDue: Number(r.balance_due || 0),
    };
    const canCache = isFinalizedForCache(cacheInput);
    const cacheKey = canCache ? buildReceiptCacheKey(cacheInput) : null;
    if (cacheKey) {
      const cached = await loadCachedReceiptPdf(cacheKey);
      if (cached) {
        const cachedFilename = r.invoice_number || id;
        return new NextResponse(new Uint8Array(cached.buffer), {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": `attachment; filename="receipt-${cachedFilename}.pdf"`,
            "cache-control": "private, max-age=300",
            "x-receipt-pdf-cache": "hit",
          },
        });
      }
    }

    const currency = r.currency || "ZAR";
    const money = (amount: number | undefined) => moneyPdf(amount, currency);

    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));

    drawPdfHeader(doc, {
      title: "Receipt",
      subtitle: "Provider copy for booking payment records",
      documentNumber: r.invoice_number || id,
      status: r.payment_status || "pending",
      note: r.receipt_header,
    });

    const addr = r.provider?.address;
    const providerAddress = [
      addr?.line1,
      [addr?.city, addr?.state, addr?.postal_code].filter(Boolean).join(", "),
    ].filter(Boolean);
    drawPdfInfoGrid(doc, [
      {
        label: "From",
        lines: [r.provider?.name || "-", r.provider?.email, r.provider?.phone, ...providerAddress],
      },
      {
        label: "To",
        lines: [r.customer?.name || "-", r.customer?.email, r.customer?.phone],
      },
      {
        label: "Booking",
        lines: [
          r.invoice_date ? `Issued ${formatPdfDate(r.invoice_date)}` : null,
          r.booking_date ? `Booked ${formatPdfDate(r.booking_date)}` : null,
        ],
      },
    ]);

    // Service address
    if (r.location_type === "at_home" && r.service_address?.line1) {
      drawPdfSectionTitle(doc, "Service location");
      doc.fontSize(10).fillColor("#111827").text(r.service_address.line1);
      const saCity = [r.service_address.city, r.service_address.state].filter(Boolean).join(", ");
      if (saCity) doc.text(`${saCity} ${r.service_address.postal_code || ""}`);
      doc.moveDown(0.5);
    }

    drawPdfLineItems(
      doc,
      (r.items || []).map((item) => ({
        description: item.description || "Item",
        detail: [
          item.staff ? `Staff: ${item.staff}` : null,
          item.duration ? `${item.duration} min` : null,
          `Quantity ${item.quantity || 1}`,
        ].filter(Boolean).join(" · "),
        amount: money(item.total),
      })),
      { title: "Items" },
    );

    drawPdfTotals(
      doc,
      [
        { label: "Subtotal", value: money(r.subtotal) },
        ...(r.discount_amount > 0
          ? [{ label: r.discount_reason ? `Discount (${r.discount_reason})` : "Discount", value: `-${money(r.discount_amount)}`, tone: "success" as const }]
          : []),
        ...(r.travel_fee > 0 ? [{ label: "Travel fee", value: money(r.travel_fee) }] : []),
        ...(r.tax_amount > 0 ? [{ label: r.tax_rate > 0 ? `Tax (${r.tax_rate.toFixed(1)}%)` : "Tax", value: money(r.tax_amount) }] : []),
        ...(r.service_fee_amount > 0 ? [{ label: "Service fee", value: money(r.service_fee_amount) }] : []),
        ...(r.tip_amount > 0 ? [{ label: "Tip", value: money(r.tip_amount) }] : []),
        ...(r.cancellation_fee > 0 ? [{ label: "Cancellation fee", value: money(r.cancellation_fee), tone: "warning" as const }] : []),
        ...(r.deposit_required && r.payment_option === "deposit"
          ? [{ label: `Deposit${r.deposit_percentage ? ` (${r.deposit_percentage}%)` : ""}`, value: money(r.deposit_amount) }]
          : []),
        ...(Number(r.amount_paid || 0) > 0 ? [{ label: "Amount paid", value: money(r.amount_paid) }] : []),
        ...(Number(r.balance_due || 0) > 0 ? [{ label: "Balance due", value: money(r.balance_due), tone: "danger" as const }] : []),
      ],
      { label: "Total", value: money(r.total_amount) },
    );

    // Additional charges
    if (r.additional_charges && r.additional_charges.length > 0) {
      doc.moveDown(0.4);
      drawPdfLineItems(
        doc,
        r.additional_charges.map((charge) => ({
          description: charge.description || "Additional charge",
          detail: charge.status === "paid"
            ? `Paid${charge.paid_at ? ` on ${formatPdfDate(charge.paid_at)}` : ""}`
            : (charge.status || "Pending"),
          amount: money(charge.amount),
        })),
        { title: "Additional charges" },
      );
    }

    // Notes
    if (r.notes) {
      doc.moveDown(0.3);
      drawPdfSectionTitle(doc, "Notes");
      doc.text(r.notes);
    }

    drawPdfFooter(doc, r.receipt_footer);

    doc.end();
    const buffer = await new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    if (cacheKey) {
      void saveCachedReceiptPdf(cacheKey, buffer);
    }

    const filename = r.invoice_number || id;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="receipt-${filename}.pdf"`,
        "cache-control": canCache ? "private, max-age=300" : "no-store",
        "x-receipt-pdf-cache": canCache ? "miss-written" : "skip",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate PDF receipt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type ReceiptData = {
  invoice_number?: string;
  invoice_date?: string;
  booking_date?: string;
  provider?: {
    name?: string;
    email?: string;
    phone?: string;
    address?: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postal_code?: string;
    };
  };
  customer?: { name?: string; email?: string; phone?: string };
  items?: Array<{
    description?: string;
    staff?: string;
    duration?: number;
    quantity?: number;
    unit_price?: number;
    total?: number;
  }>;
  subtotal: number;
  discount_amount: number;
  discount_reason?: string | null;
  travel_fee: number;
  tax_amount: number;
  tax_rate: number;
  service_fee_amount: number;
  service_fee_percentage: number;
  tip_amount: number;
  cancellation_fee: number;
  total_amount: number;
  currency?: string;
  payment_status?: string;
  deposit_required?: boolean;
  deposit_amount?: number;
  deposit_percentage?: number;
  payment_option?: string;
  amount_paid?: number;
  balance_due?: number;
  additional_charges?: Array<{
    description?: string;
    amount?: number;
    status?: string;
    paid_at?: string | null;
  }>;
  location_type?: string;
  service_address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
  };
  notes?: string | null;
  receipt_header?: string | null;
  receipt_footer?: string | null;
};
