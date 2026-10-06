import { describe, expect, it } from "vitest";
import {
  bookingReturnStepLabelKey,
  resolveBookingReturnContext,
} from "../booking-return-context";

describe("resolveBookingReturnContext", () => {
  it("parses booking next with slug and step=time", () => {
    const ctx = resolveBookingReturnContext(
      "/booking?slug=bantu&step=time&auth_return=1",
    );
    expect(ctx).not.toBeNull();
    expect(ctx?.slug).toBe("bantu");
    expect(ctx?.stepLabelKey).toBe("web.auth.bookingReturn.stepTime");
    expect(ctx?.continueHref).toBe("/booking?slug=bantu&step=time&auth_return=1");
    expect(ctx?.authReturn).toBe(true);
  });

  it("returns null for non-booking next", () => {
    expect(resolveBookingReturnContext("/account-settings")).toBeNull();
    expect(resolveBookingReturnContext("/provider/dashboard")).toBeNull();
  });

  it("rejects unsafe next values", () => {
    expect(resolveBookingReturnContext("//evil.example/booking")).toBeNull();
    expect(resolveBookingReturnContext("https://evil.example/booking")).toBeNull();
  });

  it("accepts /booking/on-demand paths", () => {
    const ctx = resolveBookingReturnContext("/booking/on-demand/foo?slug=x");
    expect(ctx?.isBookingReturn).toBe(true);
  });
});

describe("bookingReturnStepLabelKey", () => {
  it("maps pay step", () => {
    expect(bookingReturnStepLabelKey("pay")).toBe("web.auth.bookingReturn.stepPay");
  });
});
