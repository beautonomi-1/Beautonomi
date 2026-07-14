import { describe, expect, it } from "vitest";
import { applyCustomOfferAttachmentPatch } from "../sync-offer-message-attachments";

describe("applyCustomOfferAttachmentPatch", () => {
  it("marks expired and clears withdrawn", () => {
    const out = applyCustomOfferAttachmentPatch(
      { type: "custom_offer", offer_id: "x", withdrawn: true },
      { status: "expired" },
    );
    expect(out.status).toBe("expired");
    expect(out.expired).toBe(true);
    expect(out.withdrawn).toBe(false);
  });

  it("marks declined without withdrawn/expired flags", () => {
    const out = applyCustomOfferAttachmentPatch(
      { type: "custom_offer", offer_id: "x", withdrawn: true, expired: true },
      { status: "declined" },
    );
    expect(out.status).toBe("declined");
    expect(out.withdrawn).toBe(false);
    expect(out.expired).toBe(false);
  });

  it("sets booking_id when paid", () => {
    const out = applyCustomOfferAttachmentPatch({ type: "custom_offer", offer_id: "x" }, {
      status: "paid",
      bookingId: "b1",
    });
    expect(out.status).toBe("paid");
    expect(out.booking_id).toBe("b1");
  });

  it("stores change_request_note for changes_requested", () => {
    const out = applyCustomOfferAttachmentPatch(
      { type: "custom_offer", offer_id: "x" },
      { status: "changes_requested", changeRequestNote: "Please adjust price" },
    );
    expect(out.status).toBe("changes_requested");
    expect(out.change_request_note).toBe("Please adjust price");
    expect(out.withdrawn).toBe(false);
    expect(out.expired).toBe(false);
  });

  it("clears booking_id when reset to pending", () => {
    const out = applyCustomOfferAttachmentPatch(
      { type: "custom_offer", offer_id: "x", booking_id: "b1" },
      { status: "pending" },
    );
    expect(out.status).toBe("pending");
    expect(out.booking_id).toBe(null);
    expect(out.withdrawn).toBe(false);
    expect(out.expired).toBe(false);
  });

  it("applies price and duration patches when editing an offer", () => {
    const out = applyCustomOfferAttachmentPatch(
      { type: "custom_offer", offer_id: "x", price: 100, duration_minutes: 60 },
      { status: "pending", price: 150, durationMinutes: 90 },
    );
    expect(out.price).toBe(150);
    expect(out.duration_minutes).toBe(90);
  });
});
