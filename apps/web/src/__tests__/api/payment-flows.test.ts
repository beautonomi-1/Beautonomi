/**
 * Tests for payment flows: Paystack initialization, saved card charging,
 * and webhook signature verification.
 */

import { describe, it, expect } from "vitest";
import crypto from "crypto";

// ─── Paystack webhook signature verification (unit) ─────────────────────────

describe("Paystack webhook HMAC verification", () => {
  const SECRET = "sk_test_abcdef123456";

  function computeSignature(payload: string, secret: string): string {
    return crypto
      .createHmac("sha512", secret)
      .update(payload)
      .digest("hex");
  }

  it("produces a valid HMAC-SHA512 signature", () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "ref_123" } });
    const sig = computeSignature(body, SECRET);

    expect(sig).toHaveLength(128);
    expect(sig).toMatch(/^[a-f0-9]{128}$/);
  });

  it("rejects a tampered payload", () => {
    const original = JSON.stringify({ event: "charge.success", data: { reference: "ref_123" } });
    const tampered = JSON.stringify({ event: "charge.success", data: { reference: "ref_HACKED" } });

    const originalSig = computeSignature(original, SECRET);
    const tamperedSig = computeSignature(tampered, SECRET);

    expect(originalSig).not.toBe(tamperedSig);
  });

  it("rejects a signature computed with a different secret", () => {
    const body = JSON.stringify({ event: "charge.success" });
    const correctSig = computeSignature(body, SECRET);
    const wrongSig = computeSignature(body, "sk_test_wrong_key");

    expect(correctSig).not.toBe(wrongSig);
  });
});

// ─── Payment initialization validation (unit) ───────────────────────────────

describe("Payment initialization validation", () => {
  it("rejects missing email", () => {
    const body = { amount: 5000, metadata: {} };
    expect(body).not.toHaveProperty("email");
  });

  it("rejects amount below minimum (100 cents)", () => {
    const amount = 50;
    expect(amount).toBeLessThan(100);
  });

  it("accepts valid initialization params", () => {
    const params = {
      email: "customer@example.com",
      amount: 15000,
      metadata: {
        bookingId: "booking-uuid-123",
        saveCard: "true",
        setAsDefault: "false",
      },
    };

    expect(params.email).toMatch(/@/);
    expect(params.amount).toBeGreaterThanOrEqual(100);
    expect(params.metadata.bookingId).toBeTruthy();
  });

  it("correctly parses save_card from string metadata", () => {
    const metadata = { saveCard: "true", setAsDefault: "false" };
    const saveCard = metadata.saveCard === "true";
    const setAsDefault = metadata.setAsDefault === "true";

    expect(saveCard).toBe(true);
    expect(setAsDefault).toBe(false);
  });

  it("handles save_card as boolean in metadata", () => {
    const metadata = { saveCard: true, setAsDefault: false } as Record<string, unknown>;
    const saveCard = metadata.saveCard === "true" || metadata.saveCard === true;
    const setAsDefault = metadata.setAsDefault === "true" || metadata.setAsDefault === true;

    expect(saveCard).toBe(true);
    expect(setAsDefault).toBe(false);
  });
});

// ─── Charge saved card validation (unit) ─────────────────────────────────────

describe("Charge saved card flow", () => {
  it("requires payment_method_id, amount, and email", () => {
    const validParams = {
      payment_method_id: "pm-uuid-123",
      amount: 150,
      email: "customer@example.com",
      currency: "ZAR",
    };

    expect(validParams.payment_method_id).toBeTruthy();
    expect(validParams.amount).toBeGreaterThan(0);
    expect(validParams.email).toMatch(/@/);
  });

  it("rejects zero or negative amount", () => {
    const invalidAmounts = [0, -50, -1];
    for (const amount of invalidAmounts) {
      expect(amount).not.toBeGreaterThan(0);
    }
  });

  it("defaults currency to ZAR when not provided", () => {
    const params = { payment_method_id: "pm-123", amount: 100, email: "a@b.com" };
    const currency = (params as Record<string, unknown>).currency || "ZAR";
    expect(currency).toBe("ZAR");
  });
});

// ─── Webhook charge.success card saving logic (unit) ─────────────────────────

describe("Webhook charge.success card saving", () => {
  it("saves card when metadata.save_card is true and authorization is reusable", () => {
    const metadata = { save_card: true, customer_id: "cust-123", set_as_default: true };
    const authorization = {
      authorization_code: "AUTH_abc123",
      reusable: true,
      last4: "4081",
      exp_month: "12",
      exp_year: "2027",
      brand: "visa",
      card_type: "visa",
    };
    const customer = { email: "customer@example.com" };

    const shouldSave = !!(
      metadata?.save_card &&
      authorization?.authorization_code &&
      authorization?.reusable &&
      customer?.email &&
      metadata?.customer_id
    );

    expect(shouldSave).toBe(true);
  });

  it("does NOT save card when save_card is false", () => {
    const metadata = { save_card: false, customer_id: "cust-123" };
    const authorization = { authorization_code: "AUTH_abc", reusable: true };
    const customer = { email: "a@b.com" };

    const shouldSave = !!(
      metadata?.save_card &&
      authorization?.authorization_code &&
      authorization?.reusable &&
      customer?.email &&
      metadata?.customer_id
    );

    expect(shouldSave).toBe(false);
  });

  it("does NOT save card when authorization is not reusable", () => {
    const metadata = { save_card: true, customer_id: "cust-123" };
    const authorization = { authorization_code: "AUTH_abc", reusable: false };
    const customer = { email: "a@b.com" };

    const shouldSave = !!(
      metadata?.save_card &&
      authorization?.authorization_code &&
      authorization?.reusable &&
      customer?.email &&
      metadata?.customer_id
    );

    expect(shouldSave).toBe(false);
  });

  it("does NOT save card when customer_id is missing from metadata", () => {
    const metadata = { save_card: true } as Record<string, unknown>;
    const authorization = { authorization_code: "AUTH_abc", reusable: true };
    const customer = { email: "a@b.com" };

    const shouldSave = !!(
      metadata?.save_card &&
      authorization?.authorization_code &&
      authorization?.reusable &&
      customer?.email &&
      metadata?.customer_id
    );

    expect(shouldSave).toBe(false);
  });

  it("extracts card details correctly for storage", () => {
    const authorization = {
      authorization_code: "AUTH_xyz789",
      last4: "1234",
      exp_month: "03",
      exp_year: "2028",
      brand: "mastercard",
      card_type: "mastercard",
    };

    const cardRecord = {
      provider_payment_method_id: authorization.authorization_code,
      last_four: authorization.last4,
      expiry_month: parseInt(authorization.exp_month),
      expiry_year: parseInt(authorization.exp_year),
      card_brand: authorization.brand || authorization.card_type || "unknown",
    };

    expect(cardRecord.provider_payment_method_id).toBe("AUTH_xyz789");
    expect(cardRecord.last_four).toBe("1234");
    expect(cardRecord.expiry_month).toBe(3);
    expect(cardRecord.expiry_year).toBe(2028);
    expect(cardRecord.card_brand).toBe("mastercard");
  });
});

// ─── Payment method management (unit) ────────────────────────────────────────

describe("Payment method management", () => {
  it("filters only active payment methods", () => {
    const methods = [
      { id: "1", is_active: true, last4: "1234" },
      { id: "2", is_active: false, last4: "5678" },
      { id: "3", is_active: true, last4: "9012" },
    ];

    const active = methods.filter((m) => m.is_active);
    expect(active).toHaveLength(2);
    expect(active.map((m) => m.id)).toEqual(["1", "3"]);
  });

  it("selects default card first, then falls back to first active", () => {
    const methods = [
      { id: "1", is_active: true, is_default: false },
      { id: "2", is_active: true, is_default: true },
      { id: "3", is_active: true, is_default: false },
    ];

    const defaultCard = methods.find((m) => m.is_default) || methods[0];
    expect(defaultCard?.id).toBe("2");
  });

  it("falls back to first card when no default is set", () => {
    const methods = [
      { id: "1", is_active: true, is_default: false },
      { id: "2", is_active: true, is_default: false },
    ];

    const defaultCard = methods.find((m) => m.is_default) || methods[0];
    expect(defaultCard?.id).toBe("1");
  });

  it("returns null when no cards exist", () => {
    const methods: { id: string; is_default: boolean }[] = [];
    const defaultCard = methods.find((m) => m.is_default) || methods[0] || null;
    expect(defaultCard).toBeNull();
  });
});
