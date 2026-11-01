import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockVerifyCron = vi.fn();
const mockRunLocked = vi.fn();

vi.mock("@/lib/cron-auth", () => ({
  verifyCronRequest: (...args: unknown[]) => mockVerifyCron(...args),
}));

vi.mock("@/lib/cron/locked-cron-route", () => ({
  runLockedCronRoute: (...args: unknown[]) => mockRunLocked(...args),
}));

describe("GET /api/cron/issue-provider-invoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyCron.mockReturnValue({ valid: true });
    mockRunLocked.mockImplementation((_name: string, fn: () => Promise<Response>) => fn());
  });

  it("always no-ops with customer_paid_platform_fee_model", async () => {
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/cron/issue-provider-invoices"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe("customer_paid_platform_fee_model");
  });
});
