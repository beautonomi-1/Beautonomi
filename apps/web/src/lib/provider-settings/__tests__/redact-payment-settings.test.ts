import { describe, expect, it } from "vitest";
import { redactProviderPaymentSettings } from "@/lib/provider-settings/redact-payment-settings";

const settings = {
  acceptCash: true,
  taxRatePercent: 15,
  vatNumber: "4123456789",
  yoco: {
    isEnabled: true,
    publicKey: "pk_live_secret",
    connectedDate: "2026-01-01",
    platformEnabled: true,
  },
  paystackTerminal: {
    isEnabled: true,
    platformEnabled: true,
    accepted: true,
    selectable: true,
    terminals: [{ terminal_code: "TERM1", payment_link: "https://pay.example/TERM1" }],
    selectableTerminals: [{ terminal_code: "TERM1" }],
    activeTerminalCount: 1,
  },
};

describe("redactProviderPaymentSettings", () => {
  it("keeps checkout flags and removes the VAT number and terminal codes", () => {
    const redacted = redactProviderPaymentSettings(settings, {
      canCollectCard: false,
      canSeeVatNumber: false,
    });
    expect(redacted.acceptCash).toBe(true);
    expect(redacted.taxRatePercent).toBe(15);
    expect(redacted.vatNumber).toBeNull();
    expect(redacted.yoco.publicKey).toBeNull();
    expect(redacted.yoco.isEnabled).toBe(true);
    expect(redacted.paystackTerminal.terminals).toEqual([]);
    expect(redacted.paystackTerminal.selectable).toBe(false);
    expect(redacted.paystackTerminal.activeTerminalCount).toBe(0);
    expect(settings.vatNumber).toBe("4123456789");
  });

  it("keeps the terminal codes for someone who can take card payments", () => {
    const redacted = redactProviderPaymentSettings(settings, {
      canCollectCard: true,
      canSeeVatNumber: false,
    });
    expect(redacted.paystackTerminal.terminals).toHaveLength(1);
    expect(redacted.yoco.publicKey).toBe("pk_live_secret");
    expect(redacted.vatNumber).toBeNull();
  });
});
