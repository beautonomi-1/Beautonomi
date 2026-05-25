import { describe, expect, it } from "vitest";
import {
  buildPaystackTerminalName,
  buildPaystackTerminalPaymentUrl,
  computePaystackTerminalAssetStatus,
  isTrustedPaystackTerminalAssetUrl,
  normalizeWhatsAppTarget,
  scorePaystackTerminalProviderMatch,
} from "../paystack-terminal-assets";

describe("Paystack Terminal assets", () => {
  it("computes asset readiness from link and poster or QR availability", () => {
    expect(computePaystackTerminalAssetStatus({})).toBe("missing_assets");
    expect(computePaystackTerminalAssetStatus({ payment_link: "https://paystack.shop/pay/vt_1" })).toBe(
      "link_ready",
    );
    expect(computePaystackTerminalAssetStatus({ poster_url: "https://example.supabase.co/poster.png" })).toBe(
      "poster_ready",
    );
    expect(
      computePaystackTerminalAssetStatus({
        payment_link: "https://paystack.shop/pay/vt_1",
        qr_url: "https://example.supabase.co/qr.png",
      }),
    ).toBe("ready");
  });

  it("builds identifiable Paystack terminal names", () => {
    expect(
      buildPaystackTerminalName({
        providerBusinessName: "Glow Studio",
        locationName: "Rosebank",
        requestedName: "Front desk",
        uniqueSuffix: "provider-8f3a2c",
      }),
    ).toBe("Glow Studio - Rosebank - Front desk - 8F3A2C");
    expect(
      buildPaystackTerminalName({
        providerBusinessName: "Nala Beauty",
        requestedName: null,
        uniqueSuffix: "00000000-0000-0000-0000-00000091b7d0",
        portable: true,
      }),
    ).toBe("Nala Beauty - Mobile terminal - 91B7D0");
  });

  it("validates trusted hosted asset URLs", () => {
    expect(buildPaystackTerminalPaymentUrl("VT_68SBY77G")).toBe("https://paystack.shop/pay/vt_68sby77g");
    expect(isTrustedPaystackTerminalAssetUrl("https://paystack.shop/pay/vt_1")).toBe(true);
    expect(isTrustedPaystackTerminalAssetUrl("https://assets.supabase.co/poster.pdf")).toBe(true);
    expect(isTrustedPaystackTerminalAssetUrl("http://paystack.shop/pay/vt_1")).toBe(false);
    expect(isTrustedPaystackTerminalAssetUrl("https://paystaack.shop/pay/vt_1")).toBe(false);
    expect(isTrustedPaystackTerminalAssetUrl("https://evil.example/pay/VT_1")).toBe(false);
  });

  it("uses WhatsApp destination and names to suggest provider matches", () => {
    const score = scorePaystackTerminalProviderMatch({
      terminalName: "Glow Studio - Rosebank",
      terminalCode: "VT_1",
      destinations: [{ target: "+27821234567" }],
      provider: { id: "provider-1", business_name: "Glow Studio", phone: "+27821234567" },
      location: { name: "Rosebank" },
    });
    expect(score.confidence).toBeGreaterThanOrEqual(80);
    expect(score.reasons).toContain("business_name_in_terminal_name");
    expect(normalizeWhatsAppTarget("+27 82 123 4567")).toBe("+27821234567");
  });
});
