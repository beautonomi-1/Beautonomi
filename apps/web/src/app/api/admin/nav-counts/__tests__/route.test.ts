import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ADMIN_SECTION_ROLES, ALL_SECTIONS } from "@/lib/admin-sections";
import type { AdminSection } from "@beautonomi/admin-access";
import type { UserRole } from "@/types/beautonomi";

const mockRequireRoleInApi = vi.fn();
const mockResolveAdminApiTenantId = vi.fn();
const mockFetchAllProviderIdsForTenant = vi.fn();
const mockCountRefundable = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockCountSupportTicketsForNav = vi.fn();
const mockCountAgentProposalsForNav = vi.fn();
const mockCountAgentProposalsBySection = vi.fn();
const mockGetEffectiveAdminSectionRoles = vi.fn();

function defaultEffectiveRoles(): Record<AdminSection, UserRole[]> {
  const result = {} as Record<AdminSection, UserRole[]>;
  for (const s of ALL_SECTIONS) {
    result[s] = ADMIN_SECTION_ROLES[s];
  }
  return result;
}

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
    getEffectiveAdminSectionRoles: (...args: unknown[]) => mockGetEffectiveAdminSectionRoles(...args),
  };
});

vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: (...args: unknown[]) => mockResolveAdminApiTenantId(...args),
}));

vi.mock("@/lib/tenant/admin-tenant-scope", () => ({
  fetchAllProviderIdsForTenant: (...args: unknown[]) => mockFetchAllProviderIdsForTenant(...args),
}));

vi.mock("@/lib/admin/count-refunds-needing-review", () => ({
  countRefundsNeedingReview: (...args: unknown[]) => mockCountRefundable(...args),
}));

vi.mock("@/lib/support/support-ticket-nav-count", () => ({
  countSupportTicketsForNav: (...args: unknown[]) => mockCountSupportTicketsForNav(...args),
}));

vi.mock("@/lib/ai/agent-proposal-nav-count", () => ({
  countAgentProposalsForNav: (...args: unknown[]) => mockCountAgentProposalsForNav(...args),
  countAgentProposalsBySection: (...args: unknown[]) => mockCountAgentProposalsBySection(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/admin/verification-tenant-access", () => ({
  filterVerificationsForAdminTenant: async (_s: unknown, _t: unknown, rows: unknown[]) => rows,
}));

vi.mock("@/lib/admin/safety-events-tenant-scope", () => ({
  countAllOpenSafetyEvents: async () => 0,
  countOpenSafetyEventsForTenant: async () => 0,
}));
vi.mock("@/lib/provider-ops/stall-thresholds", () => ({
  loadProviderOpsStallSettings: async () => ({
    stall_threshold_hours: 24,
    dropoff_threshold_hours: 168,
    auto_sms_on_stall: false,
    sla_contact_stalled_hours: 4,
    sla_contact_dropped_hours: 24,
  }),
  isStalledByThreshold: () => false,
}));

function makeCountChain(count: number) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    is: () => chain,
    or: () => chain,
    lt: () => chain,
    not: () => chain,
    gte: () => chain,
    then: (resolve: (v: unknown) => void) => resolve({ count, error: null }),
  };
  return chain;
}

function makeSupabase(unreadNotifications = 0) {
  return {
    from: (table: string) => {
      if (table === "notifications") return makeCountChain(unreadNotifications);
      if (table === "user_verifications") return makeCountChain(0);
      if (table === "payouts") return makeCountChain(0);
      if (table === "booking_disputes") return makeCountChain(0);
      if (table === "providers") return makeCountChain(0);
      if (table === "bookings") return makeCountChain(0);
      if (table === "user_reports") return makeCountChain(0);
      if (table === "content_reports") return makeCountChain(0);
      if (table === "user_blocks") return makeCountChain(12);
      if (table === "product_orders") return makeCountChain(0);
      if (table === "product_return_requests") return makeCountChain(0);
      if (table === "provider_subscriptions") return makeCountChain(0);
      if (table === "webhook_events") return makeCountChain(0);
      if (table === "provider_leads") return makeCountChain(0);
      if (table === "provider_onboarding_tracking") return makeCountChain(0);
      return makeCountChain(0);
    },
    rpc: async () => ({ data: [], error: null }),
  };
}

describe("GET /api/admin/nav-counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "admin-1", role: "superadmin" } });
    mockResolveAdminApiTenantId.mockResolvedValue("tenant-1");
    mockFetchAllProviderIdsForTenant.mockResolvedValue([]);
    mockGetSupabaseAdmin.mockReturnValue(makeSupabase());
    mockCountSupportTicketsForNav.mockResolvedValue({ awaiting_response: 0, sla_breached: 0 });
    mockCountAgentProposalsForNav.mockResolvedValue(0);
    mockCountAgentProposalsBySection.mockResolvedValue({});
    mockGetEffectiveAdminSectionRoles.mockResolvedValue(defaultEffectiveRoles());
  });

  it("uses needs-review refund count for /admin/refunds", async () => {
    mockCountRefundable.mockResolvedValue(42);

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/admin/nav-counts"));
    const body = await res.json();

    expect(mockCountRefundable).toHaveBeenCalledWith(expect.anything(), "tenant-1");
    expect(body.data["/admin/refunds"]).toBe(42);
  });

  it("includes tenant user_blocks total for /admin/user-blocks badge", async () => {
    mockCountRefundable.mockResolvedValue(0);

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/admin/nav-counts"));
    const body = await res.json();

    expect(body.data["/admin/user-blocks"]).toBe(12);
  });

  it("includes unread persisted notifications for /admin/notifications/inbox", async () => {
    mockGetSupabaseAdmin.mockReturnValue(makeSupabase(7));

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/admin/nav-counts"));
    const body = await res.json();

    expect(body.data["/admin/notifications/inbox"]).toBe(7);
  });

  it("uses global support ticket count for admin_support", async () => {
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "admin-2", role: "admin_support" } });
    mockCountSupportTicketsForNav.mockResolvedValue({ awaiting_response: 11, sla_breached: 3 });
    mockCountRefundable.mockResolvedValue(0);

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/admin/nav-counts"));
    const body = await res.json();

    expect(mockCountSupportTicketsForNav).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ role: "admin_support" }),
    );
    expect(body.data["/admin/support-tickets"]).toBe(11);
    expect(body.data["/admin/support-tickets/sla-breached"]).toBe(3);
  });

  it("includes agent proposal nav keys for superadmin only", async () => {
    mockCountAgentProposalsForNav.mockResolvedValue(4);
    mockCountRefundable.mockResolvedValue(0);

    const { GET } = await import("../route");
    const superRes = await GET(new NextRequest("http://localhost/api/admin/nav-counts"));
    const superBody = await superRes.json();
    expect(superBody.data["/admin/control-plane/modules/agents"]).toBe(4);
    expect(superBody.data["/admin/control-plane/integrations/ai"]).toBe(4);

    mockRequireRoleInApi.mockResolvedValue({ user: { id: "admin-3", role: "admin_finance" } });
    mockCountAgentProposalsForNav.mockResolvedValue(0);
    const { GET: GET2 } = await import("../route");
    const res = await GET2(new NextRequest("http://localhost/api/admin/nav-counts"));
    const body = await res.json();
    expect(body.data["/admin/control-plane/modules/agents"]).toBe(0);
    expect(body.data["/admin/control-plane/integrations/ai"]).toBe(0);
  });

  it("merges domain AI queue badges from countAgentProposalsBySection", async () => {
    mockCountAgentProposalsBySection.mockResolvedValue({
      "/admin/finance/ai-queue": 2,
      "/admin/support-tickets/ai-drafts": 1,
    });

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/admin/nav-counts"));
    const body = await res.json();

    expect(body.data["/admin/finance/ai-queue"]).toBe(2);
    expect(body.data["/admin/support-tickets/ai-drafts"]).toBe(1);
  });
});
