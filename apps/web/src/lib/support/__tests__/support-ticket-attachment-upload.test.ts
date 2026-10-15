import { describe, expect, it } from "vitest";
import {
  guessMimeTypeFromFileName,
  validateSupportTicketAttachmentCandidate,
} from "@/lib/support/support-ticket-attachment-upload";

describe("support ticket attachment policy", () => {
  it("guesses mime from extension", () => {
    expect(guessMimeTypeFromFileName("photo.JPG")).toBe("image/jpeg");
    expect(guessMimeTypeFromFileName("doc.pdf")).toBe("application/pdf");
  });

  it("rejects disallowed extensions", () => {
    expect(
      validateSupportTicketAttachmentCandidate({
        name: "virus.exe",
        type: "application/octet-stream",
        size: 100,
      }),
    ).toMatch(/Invalid file type/);
  });

  it("accepts allowed pdf under size cap", () => {
    expect(
      validateSupportTicketAttachmentCandidate({
        name: "invoice.pdf",
        type: "application/pdf",
        size: 1024,
      }),
    ).toBeNull();
  });
});
