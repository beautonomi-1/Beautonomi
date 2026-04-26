import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { GET as getProviderOrderReceiptJson } from "../route";
import { parseReceiptDownloadToken } from "@/lib/receipts/receipt-download-token";

export const maxDuration = 60;

/**
 * GET /api/provider/product-orders/[id]/receipt/pdf
 *
 * Two auth modes:
 *   1. Normal `Authorization: Bearer` / cookie session (provider web).
 *   2. Short-lived `?token=<hmac>` minted by
 *      POST /api/provider/product-orders/[id]/receipt/signed-url
 */

type ReceiptPayload = {
  receipt?: {
    order_number?: string;
    order_date?: string;
    status?: string;
    fulfillment_type?: string;
    customer?: { full_name?: string | null; email?: string | null; phone?: string | null } | null;
    delivery_address?: {
      address_line1?: string | null;
      address_line2?: string | null;
      city?: string | null;
      state?: string | null;
      postal_code?: string | null;
      country?: string | null;
    } | null;
    collection_location?: {
      name?: string | null;
      address_line1?: string | null;
      city?: string | null;
    } | null;
    items?: Array<{ name?: string; quantity?: number; price?: number; total?: number }>;
    subtotal?: number;
    tax?: number;
    delivery_fee?: number;
    discount?: number;
    total?: number;
    currency?: string;
    payment_status?: string;
    provider?: { business_name?: string | null } | null;
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
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const resolvedParams = await params;
    const id = resolvedParams.id;

    const token = new URL(request.url).searchParams.get("token");
    if (token) {
      const parsed = parseReceiptDownloadToken(token, {
        kind: "provider_order_receipt",
        subjectId: id,
      });
      if (!parsed) {
        return NextResponse.json(
          { error: "Signed download token is invalid or expired" },
          { status: 401 },
        );
      }
    }

    const upstream = await getProviderOrderReceiptJson(request, {
      params: Promise.resolve(resolvedParams),
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

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));

    if (receipt.receipt_header) {
      doc.fontSize(10).fillColor("#555").text(receipt.receipt_header, { align: "center" });
      doc.moveDown(0.5);
    }

    doc.fontSize(22).fillColor("#333").text("Order receipt", { align: "left" });
    doc.moveDown(0.3);
    if (receipt.provider?.business_name) {
      doc.fontSize(11).text(`From: ${receipt.provider.business_name}`);
      doc.moveDown(0.2);
    }
    doc.fontSize(11).text(`Order #: ${receipt.order_number || "-"}`);
    doc.text(
      `Date: ${receipt.order_date ? new Date(receipt.order_date).toLocaleDateString("en-ZA") : "-"}`,
    );
    if (receipt.status) doc.text(`Status: ${receipt.status}`);
    if (receipt.fulfillment_type) {
      doc.text(
        `Fulfillment: ${receipt.fulfillment_type === "delivery" ? "Delivery" : "Collection"}`,
      );
    }
    doc.moveDown();
    if (receipt.customer?.full_name) doc.text(`Customer: ${receipt.customer.full_name}`);
    if (receipt.customer?.email) doc.text(`  ${receipt.customer.email}`);
    if (receipt.customer?.phone) doc.text(`  ${receipt.customer.phone}`);

    if (receipt.fulfillment_type === "delivery" && receipt.delivery_address) {
      doc.moveDown(0.4);
      doc.fontSize(11).text("Delivery address", { underline: true });
      doc.fontSize(10);
      if (receipt.delivery_address.address_line1) doc.text(receipt.delivery_address.address_line1);
      if (receipt.delivery_address.address_line2) doc.text(receipt.delivery_address.address_line2);
      const cityLine = [
        receipt.delivery_address.city,
        receipt.delivery_address.state,
        receipt.delivery_address.postal_code,
      ]
        .filter(Boolean)
        .join(", ");
      if (cityLine) doc.text(cityLine);
      if (receipt.delivery_address.country) doc.text(receipt.delivery_address.country);
    } else if (receipt.fulfillment_type === "collection" && receipt.collection_location) {
      doc.moveDown(0.4);
      doc.fontSize(11).text("Collection at", { underline: true });
      doc.fontSize(10);
      if (receipt.collection_location.name) doc.text(receipt.collection_location.name);
      if (receipt.collection_location.address_line1)
        doc.text(receipt.collection_location.address_line1);
      if (receipt.collection_location.city) doc.text(receipt.collection_location.city);
    }

    doc.moveDown();
    doc.fontSize(12).text("Items", { underline: true });
    doc.moveDown(0.4);
    for (const item of receipt.items || []) {
      const quantity = Number(item.quantity || 1);
      doc.fontSize(10).text(`${item.name || "Item"} x${quantity}`, { continued: true });
      doc.text(money(item.total, currency), { align: "right" });
    }

    doc.moveDown();
    doc.fontSize(11).text(`Subtotal: ${money(receipt.subtotal, currency)}`);
    if (Number(receipt.discount || 0) > 0) {
      doc.text(`Discount: -${money(receipt.discount, currency)}`);
    }
    if (Number(receipt.delivery_fee || 0) > 0) {
      doc.text(`Delivery: ${money(receipt.delivery_fee, currency)}`);
    }
    if (Number(receipt.tax || 0) > 0) {
      doc.text(`Tax: ${money(receipt.tax, currency)}`);
    }
    doc.moveDown(0.4);
    doc.fontSize(13).text(`Total: ${money(receipt.total, currency)}`);

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
        "content-disposition": `attachment; filename="order-${receipt.order_number || id}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate order receipt PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
