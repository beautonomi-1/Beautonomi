import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseAdmin = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

describe("POST /api/me/support-tickets/[id]/csat", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "customer-1", role: "customer" } });
  });

  it("stores owner CSAT for resolved tickets, closes them, and attributes to the assigned agent", async () => {
    const updates: Record<string, unknown>[] = [];
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: "ticket-1", user_id: "customer-1", status: "resolved", assigned_to: "agent-1" },
              error: null,
            })),
          })),
        })),
        update: vi.fn((payload: Record<string, unknown>) => {
          updates.push(payload);
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: {
                      id: "ticket-1",
                      status: "closed",
                      closed_at: payload.closed_at,
                      csat_score: 5,
                      csat_comment: "Great",
                      csat_submitted_at: payload.csat_submitted_at,
                    },
                    error: null,
                  })),
                })),
              })),
            })),
          };
        }),
      })),
    };
    mockGetSupabaseAdmin.mockReturnValue(supabase);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/me/support-tickets/ticket-1/csat", {
      method: "POST",
      body: JSON.stringify({ score: 5, comment: "Great" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "ticket-1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({
      csat_score: 5,
      csat_comment: "Great",
      csat_agent_id: "agent-1",
      status: "closed",
      closed_at: expect.any(String),
      csat_submitted_at: expect.any(String),
    });
    expect(json.data?.ticket?.status).toBe("closed");
    expect(json.data?.closedOnSubmit).toBe(true);
  });

  it("allows re-rating an already-closed ticket without changing closed_at", async () => {
    const updates: Record<string, unknown>[] = [];
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: "ticket-1", user_id: "customer-1", status: "closed", assigned_to: "agent-1" },
              error: null,
            })),
          })),
        })),
        update: vi.fn((payload: Record<string, unknown>) => {
          updates.push(payload);
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: {
                      id: "ticket-1",
                      status: "closed",
                      closed_at: "2026-07-01T00:00:00.000Z",
                      csat_score: 4,
                      csat_comment: null,
                      csat_submitted_at: payload.csat_submitted_at,
                    },
                    error: null,
                  })),
                })),
              })),
            })),
          };
        }),
      })),
    };
    mockGetSupabaseAdmin.mockReturnValue(supabase);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/me/support-tickets/ticket-1/csat", {
      method: "POST",
      body: JSON.stringify({ score: 4 }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "ticket-1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(updates[0]).not.toHaveProperty("status");
    expect(updates[0]).not.toHaveProperty("closed_at");
    expect(json.data?.closedOnSubmit).toBe(false);
  });
});
