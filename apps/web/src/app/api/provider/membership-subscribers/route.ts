import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { isSalonMembershipEntitledForDiscount } from "@/lib/provider/salon-membership-entitlement";

/**
 * GET /api/provider/membership-subscribers
 *
 * Lists salon `user_memberships` rows for the authenticated provider.
 * Optional `plan_id` scopes to one membership plan; optional `status`
 * filters (`active` | `cancelled` | `expired` | `all`, default `all`).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const providerIdParam = searchParams.get("provider_id");
    const planId = searchParams.get("plan_id");
    const statusFilter = (searchParams.get("status") ?? "all").toLowerCase();

    let providerId: string | null = null;
    if (user.role === "superadmin" && providerIdParam) {
      providerId = providerIdParam;
    } else if (user.role === "superadmin" && !providerIdParam) {
      return errorResponse(
        "superadmin requests must include provider_id",
        "VALIDATION_ERROR",
        400,
      );
    } else {
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) return notFoundResponse("Provider not found");
    }

    if (planId) {
      const planCheck = (supabase.from("membership_plans") as any)
        .select("id, provider_id")
        .eq("id", planId)
        .maybeSingle();
      const { data: planRow } = await planCheck;
      if (!planRow || (providerId && planRow.provider_id !== providerId)) {
        return notFoundResponse("Membership plan not found");
      }
    }

    const admin = getSupabaseAdmin();
    let q = (admin as any)
      .from("user_memberships")
      .select(
        "id, user_id, plan_id, status, started_at, expires_at, cancelled_at, metadata, updated_at",
      )
      .order("started_at", { ascending: false });

    if (providerId) {
      q = q.eq("provider_id", providerId);
    }
    if (planId) {
      q = q.eq("plan_id", planId);
    }
    if (statusFilter !== "all") {
      q = q.eq("status", statusFilter);
    }

    const { data: subs, error } = await q;
    if (error) throw error;

    const rows = subs || [];
    const userIds = [...new Set(rows.map((r: { user_id: string }) => r.user_id))];
    const planIds = [...new Set(rows.map((r: { plan_id: string }) => r.plan_id))];

    const { data: users } =
      userIds.length > 0
        ? await admin
            .from("users")
            .select("id, full_name, email, phone, avatar_url")
            .in("id", userIds)
        : { data: [] };

    const { data: planRows } =
      planIds.length > 0
        ? await (admin as any)
            .from("membership_plans")
            .select("id, name, price_monthly, currency, is_active")
            .in("id", planIds)
        : { data: [] };

    const userById = new Map((users || []).map((u: any) => [u.id, u]));
    const planById = new Map((planRows || []).map((p: any) => [p.id, p]));

    type PlanRow = {
      id: string;
      name: string;
      price_monthly: number | null;
      currency: string | null;
      is_active?: boolean | null;
    };

    const subscribers = rows.map((row: any) => {
      const plan = planById.get(row.plan_id) as PlanRow | undefined;
      const entitlement_active = isSalonMembershipEntitledForDiscount({
        status: row.status,
        expires_at: row.expires_at,
        planIsActive: plan?.is_active ?? undefined,
      });
      return {
      subscription: {
        id: row.id,
        plan_id: row.plan_id,
        status: row.status,
        started_at: row.started_at,
        expires_at: row.expires_at,
        cancelled_at: row.cancelled_at,
        metadata: row.metadata,
        updated_at: row.updated_at,
        entitlement_active,
      },
      user: userById.get(row.user_id) ?? {
        id: row.user_id,
        full_name: null,
        email: null,
        phone: null,
        avatar_url: null,
      },
      plan: plan ?? {
        id: row.plan_id,
        name: "Plan",
        price_monthly: null,
        currency: null,
        is_active: null,
      },
    };
    });

    return successResponse({ subscribers });
  } catch (error) {
    return handleApiError(error, "Failed to list membership subscribers");
  }
}
