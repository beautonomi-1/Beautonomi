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

function buildSupabaseSelectChain(rows: unknown[], selectError: unknown = null) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.then = (resolve: (value: { data: unknown; error: unknown }) => unknown) =>
    Promise.resolve({ data: rows, error: selectError }).then(resolve);
  return chain;
}

function buildSupabaseUpdateChain(updateError: unknown = null) {
  const chain: Record<string, unknown> = {};
  chain.update = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.then = (resolve: (value: { error: unknown }) => unknown) =>
    Promise.resolve({ error: updateError }).then(resolve);
  return chain;
}

describe("GET /api/me/payment-methods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Pin "today" to ensure deterministic is_expired output.
    vi.setSystemTime(new Date("2026-05-19T09:00:00.000Z"));
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns expiry_label and is_expired computed from expiry_month/year", async () => {
    const rows = [
      {
        id: "pm-active",
        type: "card",
        provider: "paystack",
        card_brand: "visa",
        last_four: "4242",
        expiry_month: 12,
        expiry_year: 2030,
        metadata: { cardholder_name: "Sarah" },
        is_default: true,
        is_active: true,
        created_at: "2026-04-01T00:00:00.000Z",
      },
      {
        id: "pm-expired",
        type: "card",
        provider: "paystack",
        card_brand: "mastercard",
        last_four: "5555",
        expiry_month: 4,
        expiry_year: 2026,
        metadata: {},
        is_default: false,
        is_active: true,
        created_at: "2026-03-01T00:00:00.000Z",
      },
    ];

    const fromMock = vi.fn(() => buildSupabaseSelectChain(rows));
    mockGetSupabaseServer.mockResolvedValue({ from: fromMock });

    const { GET } = await import("../route");
    const request = new NextRequest("http://localhost/api/me/payment-methods");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fromMock).toHaveBeenCalledWith("payment_methods");
    expect(body.data).toHaveLength(2);

    const active = body.data.find((c: { id: string }) => c.id === "pm-active");
    expect(active.expiry_label).toBe("12/30");
    expect(active.is_expired).toBe(false);

    const expired = body.data.find((c: { id: string }) => c.id === "pm-expired");
    expect(expired.expiry_label).toBe("04/26");
    expect(expired.is_expired).toBe(true);
  });

  it("returns empty expiry fields when the row has no expiry data", async () => {
    const rows = [
      {
        id: "pm-no-expiry",
        type: "wallet",
        provider: "paystack",
        card_brand: null,
        last_four: null,
        expiry_month: null,
        expiry_year: null,
        metadata: {},
        is_default: true,
        is_active: true,
        created_at: "2026-04-01T00:00:00.000Z",
      },
    ];
    mockGetSupabaseServer.mockResolvedValue({
      from: vi.fn(() => buildSupabaseSelectChain(rows)),
    });

    const { GET } = await import("../route");
    const request = new NextRequest("http://localhost/api/me/payment-methods");
    const response = await GET(request);
    const body = await response.json();

    expect(body.data[0].expiry_label).toBeUndefined();
    expect(body.data[0].is_expired).toBe(false);
  });
});

describe("DELETE /api/me/payment-methods/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("soft-deletes the user's payment method via /[id]", async () => {
    const updateChain = buildSupabaseUpdateChain();
    const fromMock = vi.fn(() => updateChain);
    mockGetSupabaseServer.mockResolvedValue({ from: fromMock });

    const { DELETE } = await import("../[id]/route");
    const request = new NextRequest("http://localhost/api/me/payment-methods/pm-1", {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: "pm-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ success: true });
    expect(fromMock).toHaveBeenCalledWith("payment_methods");
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ is_active: false }),
    );
    expect(updateChain.eq).toHaveBeenCalledWith("id", "pm-1");
    expect(updateChain.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("rejects when id is missing", async () => {
    mockGetSupabaseServer.mockResolvedValue({ from: vi.fn() });

    const { DELETE } = await import("../[id]/route");
    const request = new NextRequest("http://localhost/api/me/payment-methods/", {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: "" }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
  });
});
