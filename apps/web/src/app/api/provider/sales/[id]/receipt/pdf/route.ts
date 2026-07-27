import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { GET as getSaleReceiptJson } from "../route";
import { parseReceiptDownloadToken } from "@/lib/receipts/receipt-download-token";
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

export const maxDuration = 60;

type ReceiptPayload = {
  receipt?: {
    sale_number?: string | null;
    ref_number?: string | null;
    sale_date?: string | null;
    payment_status?: string | null;
    payment_method?: string | null;
    payment_provider?: string | null;
    customer?: { full_name?: string | null; name?: string | null } | null;
    provider?: { business_name?: string | null; name?: string | null } | null;
    staff?: string | null;
    items?: Array<{
      name?: string;
      item_type?: string;
      quantity?: number;
      unit_price?: number;
      total_price?: number;
    }>;
    subtotal?: number;
    tax_amount?: number;
    discount_amount?: number;
    tip_amount?: number;
    total_amount?: number;
    amount_paid?: number;
    balance_due?: number;
    currency?: string;
    notes?: string | null;
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
        kind: "provider_sale_receipt",
        subjectId: id,
      });
      if (!parsed) {
        return NextResponse.json(
          { error: "Signed download token is invalid or expired" },
          { status: 401 },
        );
      }
    }

    const upstream = await getSaleReceiptJson(request, {
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
      title: "Sale receipt",
      subtitle: "Point-of-sale transaction record",
      documentNumber: String(receipt.sale_number ?? receipt.ref_number ?? id),
      status: receipt.payment_status || "completed",
      note: receipt.receipt_header,
    });

    drawPdfInfoGrid(doc, [
      {
        label: "From",
        lines: [receipt.provider?.business_name ?? receipt.provider?.name ?? "-"],
      },
      {
        label: "Customer",
        lines: [
          receipt.customer?.full_name ?? receipt.customer?.name ?? "Walk-in",
          receipt.staff ? `Staff: ${receipt.staff}` : "",
        ].filter(Boolean),
      },
      {
        label: "Sale date",
        lines: [formatPdfDate(receipt.sale_date)],
      },
    ]);

    drawPdfLineItems(
      doc,
      (receipt.items ?? []).map((it) => ({
        description: `${it.name ?? "Item"}${it.item_type ? ` (${it.item_type})` : ""}${it.quantity && it.quantity > 1 ? ` × ${it.quantity}` : ""}`,
        amount: moneyPdf(it.total_price ?? it.unit_price, currency),
      })),
    );

    const totalRows = [
      { label: "Subtotal", value: moneyPdf(receipt.subtotal, currency) },
      ...(Number(receipt.tax_amount) > 0
        ? [{ label: "Tax", value: moneyPdf(receipt.tax_amount, currency) }]
        : []),
      ...(Number(receipt.discount_amount) > 0
        ? [{ label: "Discount", value: `-${moneyPdf(receipt.discount_amount, currency)}` }]
        : []),
      ...(Number(receipt.tip_amount) > 0
        ? [{ label: "Tip", value: moneyPdf(receipt.tip_amount, currency) }]
        : []),
    ];

    drawPdfTotals(doc, totalRows, {
      label: "Total",
      value: moneyPdf(receipt.total_amount, currency),
    });

    if (receipt.payment_method) {
      drawPdfPayments(doc, [
        {
          label: formatPaymentMethodLabel(receipt.payment_method, receipt.payment_provider),
          amount: moneyPdf(receipt.amount_paid ?? receipt.total_amount, currency),
          tone: "success",
        },
      ]);
    }

    if (Number(receipt.balance_due) > 0.01) {
      drawPdfTotals(
        doc,
        [{ label: "Balance due", value: moneyPdf(receipt.balance_due, currency) }],
        { label: "Outstanding", value: moneyPdf(receipt.balance_due, currency) },
      );
    }

    drawPdfFooter(doc, receipt.receipt_footer);

    doc.end();
    await new Promise<void>((resolve) => doc.on("end", resolve));

    const pdfBuffer = Buffer.concat(chunks);
    const filename = `sale_${receipt.sale_number ?? id}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[sale-receipt-pdf]", error);
    return NextResponse.json({ error: "Failed to generate sale receipt PDF" }, { status: 500 });
  }
}
