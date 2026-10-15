import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/cron-auth", () => ({
  verifyCronRequest: vi.fn(() => ({ valid: false })),
}));

vi.mock("@/lib/support/zoho-mail-ingest", () => ({
  syncZohoSupportInbox: vi.fn(),
}));

describe("GET /api/cron/sync-zoho-support-mail", () => {
  it("rejects without cron bearer", async () => {
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/cron/sync-zoho-support-mail"));
    expect(res.status).toBe(401);
  });
});
