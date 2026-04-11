import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";

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
    additional_charges?: Array<{ description?: string; amount?: number; status?: string }>;
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
    const { id } = await params;
    const upstreamUrl = new URL(`/api/bookings/${id}/receipt`, request.url);
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
          "content-type": upstream.headers.get("content-type") ?? "application/json",
        },
      });
    }

    const payload = (await upstream.json()) as ReceiptPayload;
    const receipt = payload.receipt;
    if (!receipt) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
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
        doc.fontSize(10).text(`${charge.description || "Charge"}: ${money(charge.amount, currency)} (${charge.status || "pending"})`);
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

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="receipt-${receipt.booking_number || id}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate PDF receipt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
