import { afterEach, describe, expect, it, vi } from "vitest";
import { isBookingEmbedSurface, isLikelyFramed, navigateForEmbedBreakout, postBookingEmbedMessage } from "./embed-host";
import { BOOKING_EMBED_MESSAGE_SOURCE } from "@beautonomi/utils";

describe("embed-host", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats a thrown top access as framed", () => {
    vi.stubGlobal("window", {
      self: {},
      get top() {
        throw new Error("cross-origin");
      },
    });
    expect(isLikelyFramed()).toBe(true);
  });

  it("posts the beautonomi-booking-embed contract to parent", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("window", {
      self: {},
      top: {},
      parent: { postMessage },
    });
    postBookingEmbedMessage("ready");
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        source: BOOKING_EMBED_MESSAGE_SOURCE,
        type: "ready",
      }),
      "*",
    );
  });

  it("breaks out of a framed widget via top.location after posting payment_redirect", () => {
    const postMessage = vi.fn();
    const top = { location: { href: "https://salon.example/" } };
    vi.stubGlobal("window", {
      self: {},
      top,
      parent: { postMessage },
      location: {
        href: "https://app.beautonomi.com/book/continue",
        origin: "https://app.beautonomi.com",
      },
    });
    navigateForEmbedBreakout("https://checkout.paystack.com/pay/abc", "payment_redirect");
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        source: BOOKING_EMBED_MESSAGE_SOURCE,
        type: "payment_redirect",
        url: "https://checkout.paystack.com/pay/abc",
      }),
      "*",
    );
    expect(top.location.href).toBe("https://checkout.paystack.com/pay/abc");
  });

  it("resolves relative login URLs against Beautonomi, not the salon origin", () => {
    const postMessage = vi.fn();
    const top = { location: { href: "https://salon.example/services" } };
    vi.stubGlobal("window", {
      self: {},
      top,
      parent: { postMessage },
      location: {
        href: "https://app.beautonomi.com/book/continue?embed=1",
        origin: "https://app.beautonomi.com",
        search: "?embed=1",
      },
    });
    navigateForEmbedBreakout("/login?next=%2Fbook%2Fcontinue%3Fembed%3D1", "auth_required");
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "auth_required",
        url: "https://app.beautonomi.com/login?next=%2Fbook%2Fcontinue%3Fembed%3D1",
      }),
      "*",
    );
    expect(top.location.href).toBe(
      "https://app.beautonomi.com/login?next=%2Fbook%2Fcontinue%3Fembed%3D1",
    );
  });

  it("treats ?embed=1 as an embed surface even when not framed", () => {
    const win: { location: { search: string }; self?: unknown; top?: unknown } = {
      location: { search: "?hold_id=abc&embed=1" },
    };
    win.self = win;
    win.top = win;
    vi.stubGlobal("window", win);
    expect(isLikelyFramed()).toBe(false);
    expect(isBookingEmbedSurface()).toBe(true);
  });
});
