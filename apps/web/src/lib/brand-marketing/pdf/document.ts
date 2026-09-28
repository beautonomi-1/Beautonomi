import PDFDocument from "pdfkit";

export function createBrandPdf(title: string): PDFDocument {
  const doc = new PDFDocument({ margin: 48, size: "A4" });
  doc.fontSize(18).text(title, { underline: true });
  doc.moveDown();
  doc.fontSize(10).fillColor("#444");
  return doc;
}

export async function pdfToBuffer(doc: PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

export function pdfResponse(buffer: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
