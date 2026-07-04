import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { GET as getTerminalOrderReceiptJson } from "../route";
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

type ReceiptPayload = {
  receipt?: {
    order_id?: string;
    order_date?: string;
    order_status?: string;
    invoice_status?: string;
    commercial_model?: string;
    reference?: string;
    product_name?: string;
    vendor?: string | null;
    model?: string | null;
    quantity?: number;
    unit_price?: number;
    tax?: number;
    total?: number;
    currency?: string;
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
        kind: "provider_terminal_order_receipt",
        subjectId: id,
      });
      if (!parsed) {
        return NextResponse.json({ error: "Signed download token is invalid or expired" }, { status: 401 });
      }
    }

    const upstream = await getTerminalOrderReceiptJson(request, {
      params: Promise.resolve(resolvedParams),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return new NextResponse(text, {
        status: upstream.status,
        headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
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
      title: "Terminal order receipt",
      subtitle: "Card machine / payment terminal purchase",
      documentNumber: receipt.reference || id,
      status: receipt.invoice_status || receipt.order_status || "pending",
      note: receipt.receipt_header,
    });

    drawPdfInfoGrid(doc, [
      { label: "Provider", lines: [receipt.provider?.business_name || "-"] },
      {
        label: "Order",
        lines: [
          `Placed ${formatPdfDate(receipt.order_date)}`,
          receipt.commercial_model ? `Model: ${receipt.commercial_model.replace(/_/g, " ")}` : null,
        ],
      },
    ]);

    drawPdfSectionTitle(doc, "Items");
    drawPdfLineItems(doc, [
      {
        name: receipt.product_name || "Terminal device",
        detail: [receipt.vendor, receipt.model].filter(Boolean).join(" · ") || undefined,
        qty: receipt.quantity ?? 1,
        unitPrice: receipt.unit_price ?? 0,
        total: (receipt.unit_price ?? 0) * (receipt.quantity ?? 1),
      },
    ]);

    drawPdfTotals(doc, [
      { label: "Subtotal", value: moneyPdf((receipt.unit_price ?? 0) * (receipt.quantity ?? 1), currency) },
      ...(Number(receipt.tax ?? 0) > 0
        ? [{ label: "VAT", value: moneyPdf(receipt.tax ?? 0, currency) }]
        : []),
      { label: "Total", value: moneyPdf(receipt.total ?? 0, currency), bold: true },
    ]);

    drawPdfFooter(doc, receipt.receipt_footer ?? undefined);
    doc.end();

    await new Promise<void>((resolve) => doc.on("end", resolve));
    const pdf = Buffer.concat(chunks);

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="terminal-order-${id}.pdf"`,
      },
    });
  } catch (err) {
    console.error("[terminal-order-receipt-pdf]", err);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
