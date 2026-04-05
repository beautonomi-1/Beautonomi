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
    fees?: number;
    travel_fee?: number;
    tip_amount?: number;
    cancellation_fee?: number;
    discount?: number;
    total?: number;
    currency?: string;
    payment_status?: string;
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

    doc.fontSize(22).text("Receipt", { align: "left" });
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
    if (Number(receipt.tax || 0) > 0) doc.text(`Tax: ${money(receipt.tax, currency)}`);
    if (Number(receipt.fees || 0) > 0) doc.text(`Service / platform fee: ${money(receipt.fees, currency)}`);
    if (Number(receipt.travel_fee || 0) > 0) doc.text(`Travel fee: ${money(receipt.travel_fee, currency)}`);
    if (Number(receipt.tip_amount || 0) > 0) doc.text(`Tip: ${money(receipt.tip_amount, currency)}`);
    if (Number(receipt.cancellation_fee || 0) > 0) doc.text(`Cancellation fee: ${money(receipt.cancellation_fee, currency)}`);
    if (Number(receipt.discount || 0) > 0) doc.text(`Discount: -${money(receipt.discount, currency)}`);
    doc.moveDown(0.4);
    doc.fontSize(13).text(`Total: ${money(receipt.total, currency)}`);
    doc.fontSize(10).text(`Payment status: ${receipt.payment_status || "-"}`);

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
