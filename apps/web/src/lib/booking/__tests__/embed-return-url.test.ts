import { describe, expect, it } from "vitest";
import {
  appendSignedEmbedReturnToSuccessUrl,
  signEmbedReturnUrl,
  validateHttpsReturnUrl,
  verifyEmbedReturnUrl,
} from "../embed-return-url";

describe("embed-return-url", () => {
  it("validates https return URLs only", () => {
    expect(validateHttpsReturnUrl("https://salon.example/book")).toBe("https://salon.example/book");
    expect(validateHttpsReturnUrl("http://salon.example/book")).toBeNull();
    expect(validateHttpsReturnUrl("javascript:alert(1)")).toBeNull();
  });

  it("signs and verifies return URLs for a booking", () => {
    const bookingId = "b1";
    const ret = "https://salon.example/page";
    const sig = signEmbedReturnUrl(ret, bookingId);
    expect(verifyEmbedReturnUrl(ret, bookingId, sig)).toBe(true);
    expect(verifyEmbedReturnUrl(ret, bookingId, "bad")).toBe(false);
    expect(verifyEmbedReturnUrl("https://evil.example", bookingId, sig)).toBe(false);
  });

  it("appends embed and signed return to success path", () => {
    const out = appendSignedEmbedReturnToSuccessUrl("/checkout/success?booking_id=x", {
      embed: true,
      returnUrl: "https://host.example/embed",
      bookingId: "x",
    });
    expect(out).toContain("embed=1");
    expect(out).toContain("return=");
    expect(out).toContain("return_sig=");
  });
});
