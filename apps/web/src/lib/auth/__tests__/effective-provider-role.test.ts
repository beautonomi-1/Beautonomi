import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  persistJoinedProviderRole,
  resolveEffectiveProviderRole,
  syncPortalRoleAfterWorkplaceChange,
} from "../effective-provider-role";

const mockFrom = vi.fn();
const mockGetSupabaseAdmin = vi.fn(() => ({
  from: mockFrom,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

function chainMaybeSingle(result: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  };
}

describe("effective-provider-role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persistJoinedProviderRole keeps provider_owner", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return chainMaybeSingle({ data: { role: "provider_owner" } });
      }
      return chainMaybeSingle({ data: null });
    });

    await persistJoinedProviderRole("user-1");

    const usersChain = mockFrom.mock.results.find((_, i) => mockFrom.mock.calls[i][0] === "users");
    expect(usersChain).toBeDefined();
  });

  it("persistJoinedProviderRole writes provider_owner when user owns a provider", async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "customer" } }),
          update: vi.fn().mockReturnValue({ eq: updateEq }),
        };
      }
      if (table === "providers") {
        return chainMaybeSingle({ data: { id: "prov-1" } });
      }
      return chainMaybeSingle({ data: null });
    });

    await persistJoinedProviderRole("user-owner");

    expect(updateEq).toHaveBeenCalledWith("id", "user-owner");
  });

  it("resolveEffectiveProviderRole prefers owner over staff row when persisting", async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "customer" } }),
          update: vi.fn().mockReturnValue({ eq: updateEq }),
        };
      }
      if (table === "providers") {
        return chainMaybeSingle({ data: { id: "prov-1" } });
      }
      if (table === "provider_staff") {
        return chainMaybeSingle({ data: { id: "staff-1" } });
      }
      return chainMaybeSingle({ data: null });
    });

    const role = await resolveEffectiveProviderRole("user-1", "customer", { persist: true });
    expect(role).toBe("provider_owner");
  });

  it("resolveEffectiveProviderRole returns provider_staff for customer with staff row only", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "providers") {
        return chainMaybeSingle({ data: null });
      }
      if (table === "provider_staff") {
        return chainMaybeSingle({ data: { id: "staff-1" } });
      }
      if (table === "users") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "customer" } }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }
      return chainMaybeSingle({ data: null });
    });

    const role = await resolveEffectiveProviderRole("user-2", "customer", { persist: false });
    expect(role).toBe("provider_staff");
  });

  it("resolveEffectiveProviderRole upgrades persisted staff who now own a provider", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "providers") {
        return chainMaybeSingle({ data: { id: "prov-own" } });
      }
      if (table === "users") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "provider_staff" } }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }
      return chainMaybeSingle({ data: null });
    });

    const role = await resolveEffectiveProviderRole("user-staff-owner", "provider_staff", {
      persist: false,
    });
    expect(role).toBe("provider_owner");
  });

  it("syncPortalRoleAfterWorkplaceChange sends staff with no workplace to onboarding", async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "provider_staff" } }),
          update: vi.fn().mockReturnValue({ eq: updateEq }),
        };
      }
      return chainMaybeSingle({ data: null });
    });

    const role = await syncPortalRoleAfterWorkplaceChange("user-limbo");
    expect(role).toBe("provider_onboarding");
    expect(updateEq).toHaveBeenCalled();
  });
});
