import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockPatchCustomOfferMessageAttachments = vi.fn();
const mockCreditWalletForCustomOfferAbandon = vi.fn();

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

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/custom-offers/sync-offer-message-attachments", () => ({
  patchCustomOfferMessageAttachments: (...args: unknown[]) =>
    mockPatchCustomOfferMessageAttachments(...args),
}));

vi.mock("@/lib/custom-offers/credit-wallet-for-offer-abandon", () => ({
  creditWalletForCustomOfferAbandon: (...args: unknown[]) =>
    mockCreditWalletForCustomOfferAbandon(...args),
}));

function buildSelectSingle(row: unknown, err: unknown = null) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve({ data: row, error: err }));
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: row, error: err }));
  return chain;
}

function buildUpdateChain(err: unknown = null, claimed: unknown[] = [{ id: "offer-1" }]) {
  const chain: Record<string, unknown> = {};
  chain.update = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.select = vi.fn(() =>
    Promise.resolve({ data: err ? null : claimed, error: err }),
  );
  return chain;
}

describe("POST /api/me/custom-offers/[id]/cancel-payment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-1" } });
    mockPatchCustomOfferMessageAttachments.mockResolvedValue(undefined);
    mockCreditWalletForCustomOfferAbandon.mockResolvedValue(undefined);
  });

  it("resets a payment_pending offer to pending and returns reset:true", async () => {
    const offerRow = {
      id: "offer-1",
      status: "payment_pending",
      provider_id: "prov-1",
      request: { customer_id: "user-1" },
    };
    const serverSelectChain = buildSelectSingle(offerRow);
    mockGetSupabaseServer.mockResolvedValue({ from: vi.fn(() => serverSelectChain) });

    const adminUpdateChain = buildUpdateChain();
    mockGetSupabaseAdmin.mockReturnValue({ from: vi.fn(() => adminUpdateChain) });

    const { POST } = await import("../route");
    const request = new NextRequest(
      "http://localhost/api/me/custom-offers/offer-1/cancel-payment",
      { method: "POST" }
    );
    const response = await POST(request, { params: Promise.resolve({ id: "offer-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ reset: true, status: "pending" });
    expect(adminUpdateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending",
        payment_url: null,
        payment_reference: null,
      })
    );
    expect(mockCreditWalletForCustomOfferAbandon).toHaveBeenCalledWith(
      expect.anything(),
      "offer-1",
      "user-1",
      "prov-1",
      { reason: "cancelled" },
    );
    expect(mockPatchCustomOfferMessageAttachments).toHaveBeenCalledWith(
      expect.anything(),
      "offer-1",
      { status: "pending" }
    );
  });

  it("does not refund wallet when offer was already paid (claim loses race)", async () => {
    const offerRow = {
      id: "offer-1",
      status: "payment_pending",
      provider_id: "prov-1",
      request: { customer_id: "user-1" },
    };
    const serverSelectChain = buildSelectSingle(offerRow);
    // After failed claim, re-read returns paid
    const paidSelect = buildSelectSingle({ status: "paid" });
    let fromCalls = 0;
    mockGetSupabaseServer.mockResolvedValue({
      from: vi.fn(() => {
        fromCalls += 1;
        return fromCalls === 1 ? serverSelectChain : paidSelect;
      }),
    });
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => buildUpdateChain(null, [])),
    });

    const { POST } = await import("../route");
    const request = new NextRequest(
      "http://localhost/api/me/custom-offers/offer-1/cancel-payment",
      { method: "POST" }
    );
    const response = await POST(request, { params: Promise.resolve({ id: "offer-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ reset: false, status: "paid" });
    expect(mockCreditWalletForCustomOfferAbandon).not.toHaveBeenCalled();
  });

  it("returns reset:false without touching the DB when offer is not payment_pending", async () => {
    const offerRow = {
      id: "offer-1",
      status: "pending",
      request: { customer_id: "user-1" },
    };
    const serverSelectChain = buildSelectSingle(offerRow);
    const adminFrom = vi.fn();
    mockGetSupabaseServer.mockResolvedValue({ from: vi.fn(() => serverSelectChain) });
    mockGetSupabaseAdmin.mockReturnValue({ from: adminFrom });

    const { POST } = await import("../route");
    const request = new NextRequest(
      "http://localhost/api/me/custom-offers/offer-1/cancel-payment",
      { method: "POST" }
    );
    const response = await POST(request, { params: Promise.resolve({ id: "offer-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ reset: false, status: "pending" });
    expect(adminFrom).not.toHaveBeenCalled();
    expect(mockPatchCustomOfferMessageAttachments).not.toHaveBeenCalled();
  });

  it("returns 404 when the offer belongs to another user", async () => {
    const offerRow = {
      id: "offer-1",
      status: "payment_pending",
      request: { customer_id: "other-user" },
    };
    mockGetSupabaseServer.mockResolvedValue({
      from: vi.fn(() => buildSelectSingle(offerRow)),
    });

    const { POST } = await import("../route");
    const request = new NextRequest(
      "http://localhost/api/me/custom-offers/offer-1/cancel-payment",
      { method: "POST" }
    );
    const response = await POST(request, { params: Promise.resolve({ id: "offer-1" }) });

    expect(response.status).toBe(404);
  });

  it("returns 404 when the offer does not exist", async () => {
    mockGetSupabaseServer.mockResolvedValue({
      from: vi.fn(() => buildSelectSingle(null, { message: "not found" })),
    });

    const { POST } = await import("../route");
    const request = new NextRequest(
      "http://localhost/api/me/custom-offers/offer-1/cancel-payment",
      { method: "POST" }
    );
    const response = await POST(request, { params: Promise.resolve({ id: "offer-1" }) });

    expect(response.status).toBe(404);
  });
});
