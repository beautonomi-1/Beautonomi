import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockVerify = vi.fn();
const mockLocked = vi.fn();
const mockAdmin = vi.fn();

vi.mock("@/lib/cron-auth", () => ({
  verifyCronRequest: (...args: unknown[]) => mockVerify(...args),
}));

vi.mock("@/lib/cron/locked-cron-route", () => ({
  runLockedCronRoute: (...args: unknown[]) => mockLocked(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockAdmin(),
}));

vi.mock("@/lib/notifications/notification-service", () => ({
  notifyProviderInvoiceOverdue: vi.fn(async () => {}),
}));

describe("mark-provider-invoices-overdue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerify.mockReturnValue({ valid: true });
    mockLocked.mockImplementation((_n: string, fn: () => Promise<Response>) => fn());
  });

  it("does not mark platform_fee invoices overdue", async () => {
    const updates: unknown[] = [];
    mockAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table !== "provider_invoices") throw new Error(table);
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          gt: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [
              {
                id: "fee-1",
                provider_id: "p1",
                invoice_type: "platform_fee",
                status: "sent",
                amount_due: 100,
                due_date: "2020-01-01",
              },
            ],
            error: null,
          }),
          update: vi.fn((payload: unknown) => {
            updates.push(payload);
            return { eq: vi.fn().mockResolvedValue({ error: null }) };
          }),
        };
      }),
    });

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/cron/mark-provider-invoices-overdue"));
    expect(res.status).toBe(200);
    expect(updates).toHaveLength(0);
  });
});
