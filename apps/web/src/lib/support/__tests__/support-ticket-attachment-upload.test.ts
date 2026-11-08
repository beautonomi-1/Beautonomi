import { describe, expect, it, vi } from "vitest";
import { MESSAGE_ATTACHMENTS_BUCKET } from "@/lib/messaging/message-attachments";
import {
  guessMimeTypeFromFileName,
  normalizeSupportTicketMessageAttachments,
  signSupportTicketAttachments,
  supportTicketAttachmentStoragePath,
  supportTicketAttachmentStoragePathForTicket,
  supportTicketMessageAttachmentSchema,
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

  it("reads the storage path from an expired signed image URL", () => {
    const expired =
      `https://project.supabase.co/storage/v1/object/sign/${MESSAGE_ATTACHMENTS_BUCKET}/support-tickets/ticket-1/user-1/photo.png?token=expired.jwt`;
    expect(supportTicketAttachmentStoragePath({ url: expired })).toBe(
      "support-tickets/ticket-1/user-1/photo.png",
    );
  });

  it("replaces an expired signed URL with a fresh one", async () => {
    const createSignedUrl = vi.fn(async () => ({
      data: { signedUrl: "https://project.supabase.co/storage/v1/object/sign/message-attachments/support-tickets/ticket-1/user-1/photo.png?token=fresh" },
      error: null,
    }));
    const storageClient = { storage: { from: () => ({ createSignedUrl }) } };
    const signed = await signSupportTicketAttachments(
      [
        {
          url: "https://project.supabase.co/storage/v1/object/sign/message-attachments/support-tickets/ticket-1/user-1/photo.png?token=expired",
          storage_path: "support-tickets/ticket-1/user-1/photo.png",
          name: "photo.png",
          type: "image/png",
        },
      ],
      storageClient,
      "ticket-1",
    );
    expect(createSignedUrl).toHaveBeenCalledWith("support-tickets/ticket-1/user-1/photo.png", expect.any(Number));
    expect(signed).toEqual([
      expect.objectContaining({
        url: "https://project.supabase.co/storage/v1/object/sign/message-attachments/support-tickets/ticket-1/user-1/photo.png?token=fresh",
        name: "photo.png",
      }),
    ]);
  });

  it("does not sign a file stored under another ticket", async () => {
    const createSignedUrl = vi.fn();
    const storageClient = { storage: { from: () => ({ createSignedUrl }) } };
    const original = {
      url: `https://project.supabase.co/storage/v1/object/sign/${MESSAGE_ATTACHMENTS_BUCKET}/support-tickets/other-ticket/user-2/id.png?token=x`,
      name: "id.png",
      type: "image/png",
    };
    const signed = await signSupportTicketAttachments([original], storageClient, "ticket-1");
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(signed).toEqual([original]);
    expect(
      supportTicketAttachmentStoragePathForTicket(
        { storage_path: "support-tickets/ticket-1/../other-ticket/user-2/id.png" },
        "ticket-1",
      ),
    ).toBeNull();
  });

  it("keeps storage_path on saved attachments only for the same ticket", () => {
    const parsed = supportTicketMessageAttachmentSchema.array().parse([
      {
        url: "https://project.supabase.co/storage/v1/object/sign/message-attachments/support-tickets/ticket-1/u/a.png?token=t",
        storage_path: "support-tickets/ticket-1/u/a.png",
        name: "a.png",
        type: "image/png",
      },
      {
        url: "",
        storage_path: "support-tickets/other-ticket/u/b.png",
        name: "b.png",
        type: "image/png",
      },
    ]);
    const normalized = normalizeSupportTicketMessageAttachments(parsed, "ticket-1");
    expect(normalized[0]?.storage_path).toBe("support-tickets/ticket-1/u/a.png");
    expect(normalized[1]).not.toHaveProperty("storage_path");
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
