import { describe, it, expect } from "vitest";
import { applyCustomOfferAttachmentPatch } from "../sync-offer-message-attachments";

describe("applyCustomOfferAttachmentPatch", () => {
  it("marks finalize_failed without withdrawn/expired flags", () => {
    const base = { type: "custom_offer", offer_id: "x", status: "payment_pending" };
    const out = applyCustomOfferAttachmentPatch(base, { status: "finalize_failed" });
    expect(out.status).toBe("finalize_failed");
    expect(out.withdrawn).toBe(false);
    expect(out.expired).toBe(false);
  });

  it("sets booking_id when paid patch includes bookingId", () => {
    const base = { type: "custom_offer", offer_id: "x" };
    const out = applyCustomOfferAttachmentPatch(base, { status: "paid", bookingId: "b1" });
    expect(out.status).toBe("paid");
    expect(out.booking_id).toBe("b1");
  });
});
