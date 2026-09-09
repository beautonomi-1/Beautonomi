import { describe, expect, it, vi, beforeEach } from "vitest";
import { requireProviderReportsAccess } from "../require-provider-reports-access";
import * as requirePermissionModule from "@/lib/auth/requirePermission";
import * as reportGating from "@/lib/subscriptions/report-gating";
import * as apiHelpers from "@/lib/supabase/api-helpers";
import * as supabaseServer from "@/lib/supabase/server";
import * as entitlements from "@/lib/subscriptions/entitlements";

describe("requireProviderReportsAccess", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("skips subscription gate when reportType is omitted", async () => {
    const gateSpy = vi.spyOn(reportGating, "assertReportSubscriptionAccess");
    vi.spyOn(requirePermissionModule, "requirePermission").mockResolvedValue({
      authorized: true,
      user: { id: "u1", role: "provider_owner" },
    });

    const result = await requireProviderReportsAccess(undefined);
    expect(result.authorized).toBe(true);
    expect(gateSpy).not.toHaveBeenCalled();
  });

  it("returns 403 when subscription gate denies", async () => {
    vi.spyOn(requirePermissionModule, "requirePermission").mockResolvedValue({
      authorized: true,
      user: { id: "u1", role: "provider_owner" },
    });
    vi.spyOn(supabaseServer, "getSupabaseServer").mockResolvedValue({} as never);
    vi.spyOn(apiHelpers, "getProviderIdForUser").mockResolvedValue("provider-1");
    vi.spyOn(entitlements, "isUserSuperadmin").mockResolvedValue(false);
    vi.spyOn(reportGating, "assertReportSubscriptionAccess").mockResolvedValue({
      allowed: false,
      response: new Response(JSON.stringify({ error: "denied", code: "SUBSCRIPTION_REQUIRED" }), {
        status: 403,
      }),
    });

    const result = await requireProviderReportsAccess(undefined, { reportType: "staff" });
    expect(result.authorized).toBe(false);
    expect(result.response?.status).toBe(403);
  });
});
