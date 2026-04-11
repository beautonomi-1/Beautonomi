import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";

/**
 * GET /api/provider/bookings/[id]/receipt/pdf
 *
 * Generate a real PDF receipt for a provider booking.
 * Fetches data from the sibling receipt GET route and renders via PDFKit.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const upstreamUrl = new URL(
      `/api/provider/bookings/${id}/receipt`,
      request.url
    );
    const upstream = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers: {
        cookie: request.headers.get("cookie") ?? "",
        authorization: request.headers.get("authorization") ?? "",
      },
      cache: "no-store",
    });

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
        doc
          .fontSize(10)
          .text(
            `${charge.description || "Charge"}: ${money(charge.amount)} (${charge.status || "pending"})`
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

    const filename = r.invoice_number || id;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="receipt-${filename}.pdf"`,
        "cache-control": "no-store",
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
