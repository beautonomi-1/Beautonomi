import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getUserRoleServer } from "@/lib/auth/role-server";
import { getPortalForUser, type Portal } from "@/lib/auth/role";
import { bootstrapPreferredHomeTenantForAuthedUser } from "@/lib/tenant/assign-preferred-home-tenant-from-host";
import {
  persistJoinedProviderRole,
  syncPortalRoleAfterWorkplaceChange,
} from "@/lib/auth/effective-provider-role";
import { withRouteMetrics } from "@/lib/monitoring/route-metrics";
import type { UserRole } from "@/types/beautonomi";

const ROLE_QUERY_TIMEOUT_MS = 3000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return Promise.race<T | null>([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

/**
 * GET /api/me/role
 * Lightweight endpoint for mobile to check user role (for RoleGate).
 *
 * When the caller is the provider app (X-App: provider), users with users.role = 'customer'
 * are still treated as provider_owner if they own a provider or are owner in provider_staff,
 * so existing provider owners whose role was never upgraded can access the provider app.
 */
async function handleGetRole(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );

    await bootstrapPreferredHomeTenantForAuthedUser(user.id, request);

    let role = user.role;

    // Provider context: web provider portal or provider app (X-App: provider or ?portal=provider)
    const isProviderApp = request.headers.get("X-App") === "provider";
    const isProviderPortal =
      request.nextUrl?.searchParams?.get("portal") === "provider";
    const isProviderContext = isProviderApp || isProviderPortal;

    // Provider context: allow customers who are actually provider owners (role may not have been upgraded)
    if (isProviderContext && role === "customer") {
      const supabaseAdmin = getSupabaseAdmin();
      const ownerStaffResult = await withTimeout(Promise.all([
        supabaseAdmin
          .from("providers")
          .select("id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from("provider_staff")
          .select("id")
          .eq("user_id", user.id)
          .eq("role", "owner")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle(),
      ].map((p) => Promise.resolve(p))), ROLE_QUERY_TIMEOUT_MS);
      const ownerStaffTuple =
        (ownerStaffResult as unknown as [{ data: { id: string } | null }, { data: { id: string } | null }] | null)
        ?? [{ data: null }, { data: null }];
      const [ownerOfProvider, staffAsOwner] = ownerStaffTuple;
      if (ownerOfProvider.data || staffAsOwner.data) {
        role = "provider_owner";
        // Persist so future requests and other APIs see the correct role
        await supabaseAdmin
          .from("users")
          .update({ role: "provider_owner" })
          .eq("id", user.id);
      }
    }

    // Provider context: customers who are active staff (any role) get provider_staff for this request only (no DB write)
    if (isProviderContext && role === "customer") {
      const supabaseAdmin = getSupabaseAdmin();
      const staffRowResult = await withTimeout(
        Promise.resolve(
          supabaseAdmin
          .from("provider_staff")
          .select("id")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle()
        ),
        ROLE_QUERY_TIMEOUT_MS
      );
      const staffRow = (staffRowResult as { data?: { id: string } | null } | null)?.data;
      if (staffRow) {
        role = "provider_staff";
        await persistJoinedProviderRole(user.id);
      }
    }

    if (isProviderContext && (role === "provider_staff" || role === "provider_onboarding")) {
      const healed = await withTimeout(
        syncPortalRoleAfterWorkplaceChange(user.id),
        ROLE_QUERY_TIMEOUT_MS,
      );
      if (healed) role = healed;
    }

    // Provider app boot: when `/api/me/portal` fails, the native shell falls back
    // to this route. Include `portal` (same mapping as `/api/me/portal`) so
    // pending vs active routing matches web — avoid treating every owner as
    // fully in the live portal.
    let portal: Portal | undefined;
    if (isProviderContext) {
      try {
        const supabase = await getSupabaseServer(request);
        const rr = await getUserRoleServer(supabase);
        if (rr) {
          // Use the resolved `role` (customer→owner/staff heuristics above), not
          // only `rr.role`, so portal matches this response when the DB row
          // has not caught up in the same request.
          portal = getPortalForUser({
            role: role as UserRole,
            provider_status: rr.provider_status,
          });
        }
      } catch {
        /* omit portal — client keeps role-only fallback */
      }
    }

    const response = successResponse(portal != null ? { role, portal } : { role });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return handleApiError(error, "Failed to get role");
  }
}

export async function GET(request: NextRequest) {
  return withRouteMetrics(request, "/api/me/role", "GET", () => handleGetRole(request));
}
