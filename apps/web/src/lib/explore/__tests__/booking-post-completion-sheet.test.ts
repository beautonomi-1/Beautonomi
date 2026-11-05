import { describe, expect, it } from "vitest";
import { decideBookingPostCompletionSheet } from "../../../../../provider/src/lib/booking-post-completion-sheet";

const base = {
  bookingCompleted: true,
  modalAlreadySeen: false,
  postedJustNow: false,
  ratingLookupSettled: true,
  linkedPostLookupSettled: true,
  hasExistingRating: false,
  linkedPost: null as { id: string; status: "draft" | "published" } | null,
  linkedPostLookupFailed: false,
};

const RATE_ONLY = { open: true, initialStep: "rate", hideAddPhoto: true };

describe("decideBookingPostCompletionSheet", () => {
  it("does not open while lookups are unsettled", () => {
    expect(decideBookingPostCompletionSheet({ ...base, ratingLookupSettled: false })).toEqual({ open: false });
    expect(decideBookingPostCompletionSheet({ ...base, linkedPostLookupSettled: false })).toEqual({ open: false });
    expect(
      decideBookingPostCompletionSheet({ ...base, postedJustNow: true, linkedPostLookupSettled: false }),
    ).toEqual({ open: false });
  });

  it("does not open for a booking that is not completed", () => {
    expect(decideBookingPostCompletionSheet({ ...base, bookingCompleted: false })).toEqual({ open: false });
  });

  it("published and rated stays closed, even right after posting", () => {
    const published = { ...base, linkedPost: { id: "p1", status: "published" as const }, hasExistingRating: true };
    expect(decideBookingPostCompletionSheet(published)).toEqual({ open: false });
    expect(decideBookingPostCompletionSheet({ ...published, postedJustNow: true })).toEqual({ open: false });
  });

  it("published and unrated is rate-only with Add a photo hidden", () => {
    expect(
      decideBookingPostCompletionSheet({ ...base, linkedPost: { id: "p1", status: "published" } }),
    ).toEqual(RATE_ONLY);
  });

  it("posted=1 with a failed lookup is rate-only or closed, never Add a photo", () => {
    expect(
      decideBookingPostCompletionSheet({ ...base, postedJustNow: true, linkedPostLookupFailed: true }),
    ).toEqual(RATE_ONLY);
    expect(
      decideBookingPostCompletionSheet({
        ...base,
        postedJustNow: true,
        linkedPostLookupFailed: true,
        hasExistingRating: true,
      }),
    ).toEqual({ open: false });
  });

  it("posted=1 with an empty lookup is still rate-only (publish already succeeded)", () => {
    expect(decideBookingPostCompletionSheet({ ...base, postedJustNow: true })).toEqual(RATE_ONLY);
  });

  it("posted=1 reopens a sheet that was marked seen", () => {
    expect(
      decideBookingPostCompletionSheet({ ...base, modalAlreadySeen: true, postedJustNow: true }),
    ).toEqual(RATE_ONLY);
  });

  it("a failed lookup without posted=1 stays closed", () => {
    expect(decideBookingPostCompletionSheet({ ...base, linkedPostLookupFailed: true })).toEqual({ open: false });
  });

  it("draft-only continues that draft", () => {
    expect(
      decideBookingPostCompletionSheet({ ...base, linkedPost: { id: "d1", status: "draft" } }),
    ).toEqual({ open: true, initialStep: "continue_draft", draftPostId: "d1", hideAddPhoto: true });
  });

  it("a successful empty lookup keeps the choose step", () => {
    expect(decideBookingPostCompletionSheet({ ...base })).toEqual({
      open: true,
      initialStep: "choose",
      hideAddPhoto: false,
    });
  });

  it("the seen flag keeps a later visit closed", () => {
    expect(decideBookingPostCompletionSheet({ ...base, modalAlreadySeen: true })).toEqual({ open: false });
    expect(
      decideBookingPostCompletionSheet({
        ...base,
        modalAlreadySeen: true,
        linkedPost: { id: "p1", status: "published" },
      }),
    ).toEqual({ open: false });
  });
});
