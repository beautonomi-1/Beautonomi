import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/core";
import { scrubSentryEvent } from "../../lib/sentry/before-send";

function ev(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return { ...overrides } as ErrorEvent;
}

describe("scrubSentryEvent", () => {
  it("strips email/ip_address from user and keeps only id", () => {
    const out = scrubSentryEvent(
      ev({
        user: {
          id: "abc-123",
          email: "user@example.com",
          ip_address: "1.2.3.4",
          username: "alice",
        },
      }),
    );
    expect(out?.user).toEqual({ id: "abc-123" });
  });

  it("redacts Authorization / Cookie / Paystack webhook signature headers", () => {
    const out = scrubSentryEvent(
      ev({
        request: {
          url: "https://app.example/api/me/bookings",
          headers: {
            Authorization: "Bearer secret",
            Cookie: "session=xyz",
            "X-Paystack-Signature": "signature-xyz",
            "User-Agent": "curl",
          },
        },
      }),
    );
    const headers = out?.request?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("[redacted]");
    expect(headers.Cookie).toBe("[redacted]");
    expect(headers["X-Paystack-Signature"]).toBe("[redacted]");
    expect(headers["User-Agent"]).toBe("curl");
  });

  it("drops request.data entirely for Paystack webhook URL", () => {
    const out = scrubSentryEvent(
      ev({
        request: {
          url: "https://app.example/api/payments/webhook",
          data: { event: "charge.success", data: { customer: { email: "x@y.com" } } },
        },
      }),
    );
    expect(out?.request?.data).toBe("[redacted: sensitive endpoint]");
  });

  it("drops request.data on generic webhook prefix", () => {
    const out = scrubSentryEvent(
      ev({
        request: {
          url: "https://app.example/api/webhooks/yoco",
          data: JSON.stringify({ reference: "abc", email: "leak@example.com" }),
        },
      }),
    );
    expect(out?.request?.data).toBe("[redacted: sensitive endpoint]");
  });

  it("scrubs sensitive keys (password, token, email) inside request body", () => {
    const out = scrubSentryEvent(
      ev({
        request: {
          url: "https://app.example/api/me/profile",
          data: { name: "Alice", email: "a@b.com", password: "hunter2", nested: { token: "t" } },
        },
      }),
    );
    const body = out?.request?.data as Record<string, unknown>;
    expect(body.name).toBe("Alice");
    expect(body.email).toBe("[redacted]");
    expect(body.password).toBe("[redacted]");
    expect((body.nested as Record<string, unknown>).token).toBe("[redacted]");
  });
});
