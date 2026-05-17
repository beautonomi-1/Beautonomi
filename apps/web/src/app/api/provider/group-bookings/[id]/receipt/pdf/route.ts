import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { GET as getGroupReceiptJson } from "../route";
import { parseReceiptDownloadToken } from "@/lib/receipts/receipt-download-token";
import {
  drawPdfFooter,
  drawPdfHeader,
  drawPdfInfoGrid,
  drawPdfLineItems,
  drawPdfPayments,
  drawPdfSectionTitle,
  drawPdfTotals,
  formatPaymentMethodLabel,
  formatPdfDate,
  moneyPdf,
} from "@/lib/receipts/pdf-design";

export const maxDuration = 60;

type GroupReceiptData = {
  ref_number: string;
  title?: string;
  status?: string;
  scheduled_at?: string | null;
  provider?: { name?: string; email?: string; phone?: string; receipt_header?: string | null };
  location?: { type?: string; name?: string | null; line1?: string; city?: string; state?: string; postal_code?: string };
  package_name?: string | null;
  settlement_basis?: string;
  participant_count?: number;
  items?: Array<{
    participant_name?: string;
    description?: string;
    duration_minutes?: number | null;
    addons_summary?: string | null;
    booking_number?: string | null;
    service_amount?: number;
    booking_total?: number | null;
    tax_amount?: number | null;
    platform_fee_amount?: number | null;
    amount_paid?: number | null;
    refunded?: number | null;
  }>;
  // §Group-booking-audit 2026-05 (receipt completeness): flat list of every
  // recorded `booking_payments` row across the group so the PDF renders a
  // proper Payments section with method + when + amount per row.
  payments?: Array<{
    booking_number?: string | null;
    participant_name?: string | null;
    payment_method?: string | null;
    payment_provider?: string | null;
    amount?: number;
    paid_at?: string | null;
    status?: string | null;
    notes?: string | null;
  }>;
  // §Group-booking-audit 2026-05 (receipt completeness): retail products
  // attached to the group session (sold alongside services). Previously the
  // PDF ignored these so receipts under-reported what the customer received.
  products?: Array<{
    product_name?: string | null;
    product_variant_name?: string | null;
    quantity?: number;
    unit_price?: number;
    total_price?: number;
  }>;
  subtotal: number;
  products_total?: number;
  package_discount_amount?: number;
  linked_discount_amount?: number;
  travel_fee?: number;
  tax_amount?: number;
  platform_fee_amount?: number;
  total_amount: number;
  group_session_total?: number;
  amount_paid?: number;
  total_refunded?: number;
  balance_due?: number;
  estimated_session_amount?: number;
  is_estimate_only?: boolean;
  payment_status?: string;
  currency?: string;
  notes?: string | null;
  receipt_footer?: string | null;
};

function normalizeGroupBookingId(rawId: string): string {
  return rawId.startsWith("group:") ? rawId.slice("group:".length) : rawId;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const resolvedParams = await params;
    const id = normalizeGroupBookingId(resolvedParams.id);

    const token = new URL(request.url).searchParams.get("token");
    if (token) {
      const parsed = parseReceiptDownloadToken(token, {
        kind: "provider_group_booking_receipt",
        subjectId: id,
      });
      if (!parsed) {
        return NextResponse.json({ error: "Signed download token is invalid or expired" }, { status: 401 });
      }
    }

    const upstream = await getGroupReceiptJson(request, {
      params: Promise.resolve({ id }),
    });
    if (!upstream.ok) {
      const text = await upstream.text();
      return new NextResponse(text, {
        status: upstream.status,
        headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
      });
    }

    const payload = (await upstream.json()) as { data?: GroupReceiptData };
    const r = payload.data;
    if (!r) return NextResponse.json({ error: "Receipt data not found" }, { status: 404 });

    const currency = r.currency || "ZAR";
    const money = (amount: number | undefined | null) => moneyPdf(Number(amount || 0), currency);
    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));

    drawPdfHeader(doc, {
      title: "Group Receipt",
      subtitle: "Aggregate provider copy for group booking records",
      documentNumber: r.ref_number,
      status: r.payment_status || r.status || "pending",
      note: r.provider?.receipt_header,
    });

    const locationLines = [
      r.location?.name,
      r.location?.line1,
      [r.location?.city, r.location?.state, r.location?.postal_code].filter(Boolean).join(", "),
    ].filter(Boolean);

    drawPdfInfoGrid(doc, [
      {
        label: "Provider",
        lines: [r.provider?.name || "-", r.provider?.email, r.provider?.phone],
      },
      {
        label: "Group",
        lines: [
          r.title || "Group booking",
          r.scheduled_at ? `Scheduled ${formatPdfDate(r.scheduled_at)}` : null,
          `${r.participant_count || 0} participant${r.participant_count === 1 ? "" : "s"}`,
        ],
      },
      {
        label: "Package / Location",
        lines: [
          r.package_name ? `Package: ${r.package_name}` : "No package attached",
          r.location?.type ? r.location.type.replace("_", " ") : null,
          ...locationLines,
        ],
      },
    ]);

    drawPdfLineItems(
      doc,
      (r.items || []).map((item) => ({
        description: `${item.participant_name || "Participant"} - ${item.description || "Service"}`,
        detail: [
          item.duration_minutes ? `${item.duration_minutes} min` : null,
          item.addons_summary ? `Extras: ${item.addons_summary}` : null,
          item.booking_number ? `Linked booking ${item.booking_number}` : "No linked participant invoice",
          Number(item.tax_amount || 0) > 0 ? `Tax ${money(item.tax_amount)}` : null,
          Number(item.platform_fee_amount || 0) > 0 ? `Platform fee ${money(item.platform_fee_amount)}` : null,
          item.amount_paid != null ? `Paid ${money(item.amount_paid)}` : null,
          item.refunded ? `Refunded ${money(item.refunded)}` : null,
        ].filter(Boolean).join(" · "),
        amount: money(item.booking_total ?? item.service_amount ?? 0),
      })),
      { title: "Participants" },
    );

    // §Group-booking-audit 2026-05: render retail products attached to the
    // group as their own line items section so receipts cover the full sale,
    // not only participant services.
    if (Array.isArray(r.products) && r.products.length > 0) {
      drawPdfLineItems(
        doc,
        r.products.map((product) => {
          const qty = Math.max(1, Number(product.quantity || 1));
          const unit = Number(product.unit_price || 0);
          const total = Number(product.total_price || unit * qty);
          return {
            description: `${product.product_name || "Product"}${product.product_variant_name ? ` · ${product.product_variant_name}` : ""}`,
            detail: `Qty ${qty} × ${money(unit)}`,
            amount: money(total),
          };
        }),
        { title: "Products" },
      );
    }

    // §Group-booking-audit 2026-05: render every recorded payment so the
    // customer copy includes a clear "Payments" trail with method + when.
    if (Array.isArray(r.payments) && r.payments.length > 0) {
      drawPdfPayments(
        doc,
        r.payments.map((payment) => ({
          label: formatPaymentMethodLabel(payment.payment_method, payment.payment_provider),
          detail: [
            payment.participant_name ? `For ${payment.participant_name}` : null,
            payment.booking_number ? `Booking ${payment.booking_number}` : null,
            payment.paid_at ? `Paid ${formatPdfDate(payment.paid_at)}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || null,
          amount: money(Number(payment.amount || 0)),
          tone: "success" as const,
        })),
        { title: "Payments" },
      );
    }

    if (r.settlement_basis === "group_session_estimate") {
      drawPdfSectionTitle(doc, "Settlement note");
      doc
        .fontSize(9)
        .fillColor("#6B7280")
        .text(
          "This aggregate document uses the group session estimate because no linked participant booking invoices were found. Participant receipts remain the source of truth once individual bookings/payments are created.",
          { width: 495 },
        );
      doc.moveDown(0.7);
    }

    /**
     * §Group-booking-audit 2026-05: when no participant bookings exist yet
     * (`settlement_basis === "group_session_estimate"`), the only financial
     * line is whatever the group session itself carries (typically travel
     * fee). Painting that as a red "Balance due" suggested the provider was
     * owed money even though there is no invoice to collect against. Now we
     * surface it as a neutral "Estimated session amount" line so the receipt
     * matches the participant-less reality the provider sees in the dialog.
     */
    const isEstimateOnly =
      r.is_estimate_only === true ||
      (r.settlement_basis === "group_session_estimate" && (r.participant_count || 0) === 0);
    const estimateAmount = Number(r.estimated_session_amount || r.balance_due || 0);
    drawPdfTotals(
      doc,
      [
        { label: "Subtotal", value: money(r.subtotal) },
        ...(Number(r.package_discount_amount || 0) > 0
          ? [{ label: "Package discount", value: `-${money(r.package_discount_amount)}`, tone: "success" as const }]
          : []),
        ...(Number(r.linked_discount_amount || 0) > 0 && Number(r.package_discount_amount || 0) === 0
          ? [{ label: "Discounts", value: `-${money(r.linked_discount_amount)}`, tone: "success" as const }]
          : []),
        ...(Number(r.travel_fee || 0) > 0 ? [{ label: "Travel fee", value: money(r.travel_fee) }] : []),
        ...(Number(r.tax_amount || 0) > 0 ? [{ label: "Tax", value: money(r.tax_amount) }] : []),
        ...(Number(r.platform_fee_amount || 0) > 0
          ? [{ label: "Platform fee (customer-paid, retained by platform)", value: money(r.platform_fee_amount) }]
          : []),
        ...(!isEstimateOnly && Number(r.group_session_total || 0) !== Number(r.total_amount || 0)
          ? [{ label: "Group session total", value: money(r.group_session_total) }]
          : []),
        ...(Number(r.amount_paid || 0) > 0 ? [{ label: "Amount paid", value: money(r.amount_paid) }] : []),
        ...(Number(r.total_refunded || 0) > 0 ? [{ label: "Refunded", value: `-${money(r.total_refunded)}`, tone: "warning" as const }] : []),
        ...(isEstimateOnly
          ? [{ label: "Estimated session amount", value: money(estimateAmount) }]
          : Number(r.balance_due || 0) > 0
            ? [{ label: "Balance due", value: money(r.balance_due), tone: "danger" as const }]
            : []),
      ],
      { label: isEstimateOnly ? "Session estimate" : "Total", value: money(r.total_amount) },
    );

    if (r.notes) {
      doc.moveDown(0.3);
      drawPdfSectionTitle(doc, "Notes");
      doc.fontSize(9).fillColor("#111827").text(r.notes, { width: 495 });
    }

    drawPdfFooter(doc, r.receipt_footer);
    doc.end();

    const buffer = await new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="group-receipt-${r.ref_number || id}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate group receipt PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
