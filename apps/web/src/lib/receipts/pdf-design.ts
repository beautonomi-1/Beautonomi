import type PDFDocument from "pdfkit";

type PdfDoc = InstanceType<typeof PDFDocument>;

export const RECEIPT_PDF = {
  ink: "#111827",
  muted: "#6B7280",
  faint: "#F8FAFC",
  line: "#E5E7EB",
  brand: "#FF0077",
  brandDark: "#BE185D",
  success: "#047857",
  warning: "#B45309",
  danger: "#B91C1C",
};

export function moneyPdf(amount: number | undefined, currency = "ZAR", locale = "en-ZA") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
}

export function formatPdfDate(value?: string | null, locale = "en-ZA") {
  if (!value) return "-";
  return new Date(value).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function drawPdfHeader(
  doc: PdfDoc,
  opts: {
    title: string;
    subtitle?: string;
    documentNumber?: string;
    status?: string;
    note?: string | null;
  },
) {
  if (opts.note) {
    doc
      .fontSize(9)
      .fillColor(RECEIPT_PDF.muted)
      .text(opts.note, 50, doc.y, { width: 495, align: "center" });
    doc.moveDown(0.8);
  }

  const y = doc.y;
  doc
    .roundedRect(50, y, 495, 84, 18)
    .fillAndStroke(RECEIPT_PDF.faint, RECEIPT_PDF.line);

  doc
    .fontSize(9)
    .fillColor(RECEIPT_PDF.brand)
    .text("BEAUTONOMI", 74, y + 18, { characterSpacing: 1.4 });
  doc.fontSize(25).fillColor(RECEIPT_PDF.ink).text(opts.title, 74, y + 34, { width: 295 });

  if (opts.subtitle) {
    doc.fontSize(9).fillColor(RECEIPT_PDF.muted).text(opts.subtitle, 74, y + 63, { width: 310 });
  }

  const badge = opts.status?.trim();
  if (badge) {
    doc.roundedRect(410, y + 18, 111, 24, 12).fill("#FDF2F8");
    doc
      .fontSize(8)
      .fillColor(RECEIPT_PDF.brandDark)
      .text(badge.toUpperCase(), 416, y + 25, { width: 99, align: "center" });
  }

  if (opts.documentNumber) {
    doc.fontSize(9).fillColor(RECEIPT_PDF.muted).text("Document no.", 410, y + 52, { width: 111, align: "right" });
    doc.fontSize(11).fillColor(RECEIPT_PDF.ink).text(opts.documentNumber, 410, y + 65, { width: 111, align: "right" });
  }

  doc.y = y + 104;
}

export function drawPdfInfoGrid(
  doc: PdfDoc,
  columns: Array<{ label: string; lines: Array<string | null | undefined> }>,
) {
  const gap = 14;
  const width = (495 - gap * (columns.length - 1)) / columns.length;
  const startY = doc.y;
  const heights = columns.map((col) => 34 + col.lines.filter(Boolean).length * 12);
  const height = Math.max(...heights, 68);

  columns.forEach((col, index) => {
    const x = 50 + index * (width + gap);
    doc.roundedRect(x, startY, width, height, 12).fillAndStroke("#FFFFFF", RECEIPT_PDF.line);
    doc.fontSize(8).fillColor(RECEIPT_PDF.muted).text(col.label.toUpperCase(), x + 14, startY + 13, { width: width - 28 });
    let y = startY + 30;
    for (const line of col.lines.filter(Boolean)) {
      doc.fontSize(9.5).fillColor(RECEIPT_PDF.ink).text(String(line), x + 14, y, { width: width - 28 });
      y += 12;
    }
  });

  doc.y = startY + height + 20;
}

export function drawPdfLineItems(
  doc: PdfDoc,
  items: Array<{ description: string; detail?: string; amount: string }>,
  opts?: { title?: string },
) {
  drawPdfSectionTitle(doc, opts?.title || "Line items");
  const startX = 50;
  const width = 495;
  const headerY = doc.y;
  doc.roundedRect(startX, headerY, width, 26, 8).fill("#F9FAFB");
  doc.fontSize(8).fillColor(RECEIPT_PDF.muted).text("DESCRIPTION", startX + 14, headerY + 9, { width: 330 });
  doc.text("AMOUNT", startX + 390, headerY + 9, { width: 90, align: "right" });
  doc.y = headerY + 34;

  for (const item of items.length ? items : [{ description: "No line items", amount: "" }]) {
    ensurePdfSpace(doc, 42);
    const rowY = doc.y;
    doc.fontSize(10).fillColor(RECEIPT_PDF.ink).text(item.description, startX + 14, rowY, { width: 335 });
    if (item.detail) {
      doc.fontSize(8.5).fillColor(RECEIPT_PDF.muted).text(item.detail, startX + 14, doc.y + 2, { width: 335 });
    }
    doc.fontSize(10).fillColor(RECEIPT_PDF.ink).text(item.amount, startX + 390, rowY, { width: 90, align: "right" });
    doc.y = Math.max(doc.y, rowY + (item.detail ? 30 : 20));
    doc.moveTo(startX + 14, doc.y).lineTo(startX + width - 14, doc.y).strokeColor(RECEIPT_PDF.line).lineWidth(0.5).stroke();
    doc.moveDown(0.45);
  }
}

export function drawPdfTotals(
  doc: PdfDoc,
  rows: Array<{ label: string; value: string; tone?: "muted" | "success" | "danger" | "warning" }>,
  total: { label: string; value: string },
) {
  ensurePdfSpace(doc, 130);
  const x = 330;
  const y = doc.y + 8;
  doc.roundedRect(x, y, 215, 34 + rows.length * 21 + 36, 14).fillAndStroke("#FFFFFF", RECEIPT_PDF.line);
  let cursor = y + 16;
  for (const row of rows) {
    const color =
      row.tone === "success" ? RECEIPT_PDF.success :
      row.tone === "danger" ? RECEIPT_PDF.danger :
      row.tone === "warning" ? RECEIPT_PDF.warning :
      RECEIPT_PDF.ink;
    doc.fontSize(9).fillColor(RECEIPT_PDF.muted).text(row.label, x + 16, cursor, { width: 105 });
    doc.fontSize(9).fillColor(color).text(row.value, x + 122, cursor, { width: 77, align: "right" });
    cursor += 21;
  }
  doc.moveTo(x + 16, cursor).lineTo(x + 199, cursor).strokeColor(RECEIPT_PDF.line).lineWidth(1).stroke();
  cursor += 15;
  doc.fontSize(12).fillColor(RECEIPT_PDF.ink).text(total.label, x + 16, cursor, { width: 85 });
  doc.fontSize(13).fillColor(RECEIPT_PDF.ink).text(total.value, x + 102, cursor - 1, { width: 97, align: "right" });
  doc.y = y + 34 + rows.length * 21 + 48;
}

export function drawPdfFooter(doc: PdfDoc, text?: string | null) {
  if (!text) return;
  ensurePdfSpace(doc, 70);
  doc.moveDown(0.8);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(RECEIPT_PDF.line).lineWidth(0.5).stroke();
  doc.moveDown(0.5);
  doc.fontSize(8.5).fillColor(RECEIPT_PDF.muted).text(text, 70, doc.y, { width: 455, align: "center" });
}

export function drawPdfSectionTitle(doc: PdfDoc, title: string) {
  ensurePdfSpace(doc, 32);
  doc.fontSize(9).fillColor(RECEIPT_PDF.brandDark).text(title.toUpperCase(), 50, doc.y, { characterSpacing: 0.6 });
  doc.moveDown(0.5);
}

export function ensurePdfSpace(doc: PdfDoc, needed: number) {
  if (doc.y + needed > doc.page.height - 70) {
    doc.addPage();
  }
}
