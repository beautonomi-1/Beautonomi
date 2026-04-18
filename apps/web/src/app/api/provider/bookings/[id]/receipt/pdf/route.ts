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
 *      When a valid token is present we synthesize a Bearer header from the
 *      service role so the sibling JSON route's auth check passes, since the
 *      token itself already binds the booking id + minting user.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const id = resolvedParams.id;

    // Check for a signed download token in the query string. When present
    // and valid, rebuild the incoming request with a service-role Bearer
    // header so `requireRoleInApi` inside the sibling route accepts the
    // call. The token has already proven the caller is an authorized
    // provider for this booking (mint route enforces that).
    const token = new URL(request.url).searchParams.get("token");
    let effectiveRequest: NextRequest = request;
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
      const serviceKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
        process.env.SERVICE_ROLE_KEY?.trim() ||
        "";
      if (!serviceKey) {
        return NextResponse.json(
          { error: "Server misconfigured: service role key missing" },
          { status: 500 },
        );
      }
      const rebuiltHeaders = new Headers(request.headers);
      rebuiltHeaders.set("authorization", `Bearer ${serviceKey}`);
      rebuiltHeaders.set("x-receipt-download-user-id", parsed.userId);
      effectiveRequest = new NextRequest(request.url, {
        method: request.method,
        headers: rebuiltHeaders,
      });
    }

    const upstream = await getProviderReceiptJson(effectiveRequest, { params: Promise.resolve(resolvedParams) });

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
    const money = (amount: number | undefined) =>
      new Intl.NumberFormat("en-ZA", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(Number(amount || 0));

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));

    // Receipt header from provider settings
    if (r.receipt_header) {
      doc.fontSize(10).fillColor("#555").text(r.receipt_header, { align: "center" });
      doc.moveDown(0.5);
    }

    doc.fontSize(22).fillColor("#333").text("Receipt", { align: "left" });
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor("#333").text(`Receipt #: ${r.invoice_number || "-"}`);
    if (r.invoice_date) doc.text(`Date: ${r.invoice_date}`);
    if (r.booking_date) doc.text(`Booking date: ${r.booking_date}`);
    doc.moveDown(0.5);

    // Provider & Customer
    doc.fontSize(10).text(`From: ${r.provider?.name || "-"}`);
    if (r.provider?.email) doc.text(`  ${r.provider.email}`);
    if (r.provider?.phone) doc.text(`  ${r.provider.phone}`);
    const addr = r.provider?.address;
    if (addr?.line1) doc.text(`  ${addr.line1}`);
    const cityState = [addr?.city, addr?.state].filter(Boolean).join(", ");
    if (cityState) doc.text(`  ${cityState} ${addr?.postal_code || ""}`);
    doc.moveDown(0.3);

    doc.text(`To: ${r.customer?.name || "-"}`);
    if (r.customer?.email) doc.text(`  ${r.customer.email}`);
    if (r.customer?.phone) doc.text(`  ${r.customer.phone}`);
    doc.moveDown(0.8);

    // Service address
    if (r.location_type === "at_home" && r.service_address?.line1) {
      doc.fontSize(10).text("Service Location:", { underline: true });
      doc.text(r.service_address.line1);
      const saCity = [r.service_address.city, r.service_address.state].filter(Boolean).join(", ");
      if (saCity) doc.text(`${saCity} ${r.service_address.postal_code || ""}`);
      doc.moveDown(0.5);
    }

    // Line items
    doc.fontSize(12).text("Items", { underline: true });
    doc.moveDown(0.4);
    for (const item of r.items || []) {
      doc.fontSize(10);
      const desc = [
        item.description,
        item.staff ? `(${item.staff})` : null,
        item.duration ? `${item.duration} min` : null,
      ]
        .filter(Boolean)
        .join(" ");
      doc.text(`${desc} x${item.quantity || 1}`, { continued: true });
      doc.text(money(item.total), { align: "right" });
    }

    doc.moveDown(0.5);

    // Summary
    doc.fontSize(11).text(`Subtotal: ${money(r.subtotal)}`);
    if (r.discount_amount > 0) {
      doc.text(
        `Discount${r.discount_reason ? ` (${r.discount_reason})` : ""}: -${money(r.discount_amount)}`
      );
    }
    if (r.travel_fee > 0) doc.text(`Travel fee: ${money(r.travel_fee)}`);
    if (r.tax_amount > 0) {
      doc.text(
        `Tax${r.tax_rate > 0 ? ` (${r.tax_rate.toFixed(1)}%)` : ""}: ${money(r.tax_amount)}`
      );
    }
    if (r.service_fee_amount > 0) doc.text(`Service fee: ${money(r.service_fee_amount)}`);
    if (r.tip_amount > 0) doc.text(`Tip: ${money(r.tip_amount)}`);
    if (r.cancellation_fee > 0) doc.text(`Cancellation fee: ${money(r.cancellation_fee)}`);
    doc.moveDown(0.3);
    doc.fontSize(13).text(`Total: ${money(r.total_amount)}`);

    // Deposit / paid / balance
    if (r.deposit_required && r.payment_option === "deposit") {
      doc
        .fontSize(10)
        .text(
          `Deposit${r.deposit_percentage ? ` (${r.deposit_percentage}%)` : ""}: ${money(r.deposit_amount)}`
        );
    }
    if (Number(r.amount_paid || 0) > 0) {
      doc.fontSize(10).text(`Amount paid: ${money(r.amount_paid)}`);
    }
    if (Number(r.balance_due || 0) > 0) {
      doc
        .fontSize(11)
        .fillColor("red")
        .text(`Balance due: ${money(r.balance_due)}`);
      doc.fillColor("#333");
    }

    // Additional charges
    if (r.additional_charges && r.additional_charges.length > 0) {
      doc.moveDown(0.4);
      doc.fontSize(11).text("Additional charges:", { underline: true });
      for (const charge of r.additional_charges) {
        const statusLabel = charge.status === "paid"
          ? `Paid${charge.paid_at ? ` on ${new Date(charge.paid_at).toLocaleDateString()}` : ""}`
          : (charge.status || "pending");
        doc
          .fontSize(10)
          .text(
            `${charge.description || "Charge"}: ${money(charge.amount)} (${statusLabel})`
          );
      }
    }

    // Payment status
    doc.moveDown(0.3);
    doc
      .fontSize(10)
      .fillColor("#333")
      .text(`Payment status: ${r.payment_status || "-"}`);

    // Notes
    if (r.notes) {
      doc.moveDown(0.3);
      doc.fontSize(10).text("Notes:", { underline: true });
      doc.text(r.notes);
    }

    // Receipt footer from provider settings
    if (r.receipt_footer) {
      doc.moveDown(1);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#ddd").lineWidth(0.5).stroke();
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor("#666").text(r.receipt_footer, { align: "center" });
    }

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
