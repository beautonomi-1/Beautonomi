import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

describe("POST /api/me/support-tickets/[id]/seen", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "customer-1", role: "customer" } });
  });

  it("updates last_customer_view_at for the ticket owner", async () => {
    const updates: Record<string, unknown>[] = [];
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: "ticket-1", user_id: "customer-1" },
              error: null,
            })),
          })),
        })),
        update: vi.fn((payload: Record<string, unknown>) => {
          updates.push(payload);
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          };
        }),
      })),
    };
    mockGetSupabaseServer.mockResolvedValue(supabase);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/me/support-tickets/ticket-1/seen", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "ticket-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(updates[0]).toEqual({ last_customer_view_at: expect.any(String) });
    expect(body.data.seen_at).toEqual(expect.any(String));
  });
});
