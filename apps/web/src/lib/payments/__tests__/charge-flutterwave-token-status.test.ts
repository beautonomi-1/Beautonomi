import { beforeEach, describe, expect, it, vi } from "vitest";

const flutterwaveRequest = vi.fn();

vi.mock("@/lib/payments/flutterwave-server", () => ({
  flutterwaveRequest: (...args: unknown[]) => flutterwaveRequest(...args),
  verifyFlutterwaveTransactionById: vi.fn(),
}));

vi.mock("@/lib/payments/settle-flutterwave-online-payment", () => ({
  settleFlutterwaveVerifiedTransaction: vi.fn(),
}));

describe("chargeFlutterwaveTokenized", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps a pending charge open and only fails an explicit decline", async () => {
    const { chargeFlutterwaveTokenized } = await import("../charge-flutterwave-off-session");
    flutterwaveRequest.mockResolvedValueOnce({
      data: { id: 11, status: "pending" },
      message: "Charge initiated",
    });
    const pending = await chargeFlutterwaveTokenized({
      token: "flw-token",
      email: "a@example.com",
      amountInSmallestUnit: 1000,
      currency: "ZAR",
      reference: "ref-pending",
    });
    expect(pending.ok).toBe(false);
    if (pending.ok === false) expect(pending.pending).toBe(true);

    flutterwaveRequest.mockResolvedValueOnce({
      data: { id: 12, status: "failed" },
      message: "Declined",
    });
    const failed = await chargeFlutterwaveTokenized({
      token: "flw-token",
      email: "a@example.com",
      amountInSmallestUnit: 1000,
      currency: "ZAR",
      reference: "ref-failed",
    });
    expect(failed.ok).toBe(false);
    if (failed.ok === false) expect(failed.pending).toBeUndefined();
  });
});
