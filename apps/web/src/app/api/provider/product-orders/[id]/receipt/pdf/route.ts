import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { GET as getProviderOrderReceiptJson } from "../route";
import { parseReceiptDownloadToken } from "@/lib/receipts/receipt-download-token";
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
    platform_fee?: number;
    wallet_amount?: number;
    total?: number;
    currency?: string;
    payment_status?: string;
    provider?: { business_name?: string | null } | null;
    receipt_header?: string | null;
    receipt_footer?: string | null;
  };
};

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

    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));

    drawPdfHeader(doc, {
      title: "Order receipt",
      subtitle: "Provider copy for product order payment records",
      documentNumber: receipt.order_number || id,
      status: receipt.payment_status || receipt.status || "pending",
      note: receipt.receipt_header,
    });

    drawPdfInfoGrid(doc, [
      { label: "From", lines: [receipt.provider?.business_name || "-"] },
      { label: "Customer", lines: [receipt.customer?.full_name || "-", receipt.customer?.email, receipt.customer?.phone] },
      {
        label: "Order",
        lines: [
          `Placed ${formatPdfDate(receipt.order_date)}`,
          receipt.fulfillment_type ? `Fulfillment: ${receipt.fulfillment_type === "delivery" ? "Delivery" : "Collection"}` : null,
        ],
      },
    ]);

    if (receipt.fulfillment_type === "delivery" && receipt.delivery_address) {
      drawPdfSectionTitle(doc, "Delivery address");
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
      drawPdfSectionTitle(doc, "Collection at");
      if (receipt.collection_location.name) doc.text(receipt.collection_location.name);
      if (receipt.collection_location.address_line1)
        doc.text(receipt.collection_location.address_line1);
      if (receipt.collection_location.city) doc.text(receipt.collection_location.city);
    }

    doc.moveDown();
    drawPdfLineItems(
      doc,
      (receipt.items || []).map((item) => ({
        description: item.name || "Item",
        detail: `Quantity ${Number(item.quantity || 1)}${item.price ? ` · Unit ${moneyPdf(item.price, currency)}` : ""}`,
        amount: moneyPdf(item.total, currency),
      })),
      { title: "Items" },
    );

    drawPdfTotals(
      doc,
      [
        { label: "Subtotal", value: moneyPdf(receipt.subtotal, currency) },
        ...(Number(receipt.discount || 0) > 0 ? [{ label: "Discount", value: `-${moneyPdf(receipt.discount, currency)}`, tone: "success" as const }] : []),
        ...(Number(receipt.delivery_fee || 0) > 0 ? [{ label: "Delivery", value: moneyPdf(receipt.delivery_fee, currency) }] : []),
        ...(Number(receipt.tax || 0) > 0 ? [{ label: "Tax", value: moneyPdf(receipt.tax, currency) }] : []),
        ...(Number(receipt.platform_fee || 0) > 0 ? [{ label: "Platform fee (customer-paid, retained by platform)", value: moneyPdf(receipt.platform_fee, currency) }] : []),
        ...(Number(receipt.wallet_amount || 0) > 0 ? [{ label: "Paid from wallet", value: moneyPdf(receipt.wallet_amount, currency), tone: "success" as const }] : []),
      ],
      { label: "Total", value: moneyPdf(receipt.total, currency) },
    );

    drawPdfFooter(doc, receipt.receipt_footer);

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
