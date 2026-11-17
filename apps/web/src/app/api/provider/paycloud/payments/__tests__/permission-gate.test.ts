import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

describe("PayCloud payments POST (F3-27)", () => {
  it("requires process_payments and server-side amount guards", () => {
    const src = readFileSync(path.join(__dirname, "..", "route.ts"), "utf8");
    expect(src).toContain('requirePermission("process_payments"');
    expect(src).toContain("computeExpectedAmountForEntity");
    expect(src).toContain("validatePaycloudPaymentInitiate");
  });
});

const mockRequirePermission = vi.fn();

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

describe("POST /api/provider/paycloud/payments authz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when process_payments is missing", async () => {
    mockRequirePermission.mockResolvedValue({
      authorized: false,
      response: NextResponse.json(
        { data: null, error: { message: "Forbidden", code: "FORBIDDEN" } },
        { status: 403 },
      ),
    });
    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("http://localhost/api/provider/paycloud/payments", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledWith("process_payments", expect.anything());
  });
});
