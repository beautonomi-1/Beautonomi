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
 * When a valid token is present we synthesize a service-role Bearer
 * header so the sibling JSON route's auth check passes; the token
 * itself already binds the booking id + minting user.
 */

type ReceiptPayload = {
  receipt?: {
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
    travel_fee?: number;
    tip_amount?: number;
    cancellation_fee?: number;
    discount?: number;
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
    receipt_header?: string | null;
    receipt_footer?: string | null;
  };
};

function money(amount: number | undefined, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const id = resolvedParams.id;

    const token = new URL(request.url).searchParams.get("token");
    let effectiveRequest: NextRequest = request;
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

    // Call the JSON receipt handler directly (same process) to avoid
    // internal HTTP fetch issues with auth/cookie forwarding in production.
    const upstream = await getReceiptJson(effectiveRequest, { params: Promise.resolve(resolvedParams) });

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

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));

    if (receipt.receipt_header) {
      doc.fontSize(10).fillColor("#555").text(receipt.receipt_header, { align: "center" });
      doc.moveDown(0.5);
    }

    doc.fontSize(22).fillColor("#333").text("Receipt", { align: "left" });
    doc.moveDown(0.3);
    doc.fontSize(11).text(`Booking #: ${receipt.booking_number || "-"}`);
    doc.text(`Booking date: ${receipt.booking_date ? new Date(receipt.booking_date).toLocaleDateString("en-ZA") : "-"}`);
    doc.text(`Service date: ${receipt.service_date ? new Date(receipt.service_date).toLocaleDateString("en-ZA") : "-"}`);
    doc.moveDown();
    doc.text(`Customer: ${receipt.customer?.full_name || receipt.customer?.email || "-"}`);
    doc.text(`Provider: ${receipt.provider?.business_name || "-"}`);
    doc.moveDown();

    doc.fontSize(12).text("Items", { underline: true });
    doc.moveDown(0.4);
    for (const item of items) {
      doc.fontSize(10).text(`${item.name} x${item.quantity}`, { continued: true });
      doc.text(money(item.total, currency), { align: "right" });
    }

    doc.moveDown();
    doc.fontSize(11).text(`Subtotal: ${money(receipt.subtotal, currency)}`);
    if (Number(receipt.tax || 0) > 0) {
      const taxLabel = receipt.tax_rate ? `Tax (${receipt.tax_rate}%)` : "Tax";
      doc.text(`${taxLabel}: ${money(receipt.tax, currency)}`);
    }
    if (Number(receipt.fees || 0) > 0) doc.text(`Service / platform fee: ${money(receipt.fees, currency)}`);
    if (Number(receipt.travel_fee || 0) > 0) doc.text(`Travel fee: ${money(receipt.travel_fee, currency)}`);
    if (Number(receipt.tip_amount || 0) > 0) doc.text(`Tip: ${money(receipt.tip_amount, currency)}`);
    if (Number(receipt.cancellation_fee || 0) > 0) doc.text(`Cancellation fee: ${money(receipt.cancellation_fee, currency)}`);
    if (Number(receipt.discount || 0) > 0) {
      const discountLabel = receipt.discount_reason ? `Discount (${receipt.discount_reason})` : "Discount";
      doc.text(`${discountLabel}: -${money(receipt.discount, currency)}`);
    }
    doc.moveDown(0.4);
    doc.fontSize(13).text(`Total: ${money(receipt.total, currency)}`);

    if (receipt.deposit_required && receipt.payment_option === "deposit") {
      doc.fontSize(10).text(`Deposit${receipt.deposit_percentage ? ` (${receipt.deposit_percentage}%)` : ""}: ${money(receipt.deposit_amount, currency)}`);
    }
    if (Number(receipt.amount_paid || 0) > 0) {
      doc.fontSize(10).text(`Amount paid: ${money(receipt.amount_paid, currency)}`);
    }
    if (Number(receipt.balance_due || 0) > 0) {
      doc.fontSize(11).fillColor("red").text(`Balance due: ${money(receipt.balance_due, currency)}`);
      doc.fillColor("black");
    }

    if (receipt.additional_charges && receipt.additional_charges.length > 0) {
      doc.moveDown(0.4);
      doc.fontSize(11).text("Additional charges:", { underline: true });
      for (const charge of receipt.additional_charges) {
        const statusLabel = charge.status === "paid"
          ? `Paid${charge.paid_at ? ` on ${new Date(charge.paid_at).toLocaleDateString()}` : ""}`
          : (charge.status || "pending");
        doc.fontSize(10).text(`${charge.description || "Charge"}: ${money(charge.amount, currency)} (${statusLabel})`);
      }
    }

    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#333").text(`Payment status: ${receipt.payment_status || "-"}`);

    if (receipt.receipt_footer) {
      doc.moveDown(1);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#ddd").lineWidth(0.5).stroke();
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor("#666").text(receipt.receipt_footer, { align: "center" });
    }

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
