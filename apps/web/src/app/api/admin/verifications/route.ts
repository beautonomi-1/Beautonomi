import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { USER_VERIFICATION_QUEUE_STATUSES } from "@/lib/admin/verification-queue-statuses";
import { filterVerificationsForAdminTenant } from "@/lib/admin/verification-tenant-access";

/**
 * GET /api/admin/verifications
 * Get all pending verifications (for admin review)
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    const admin = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending"; // Filter by status

    // Service role: admin_trust is not is_superadmin() for user_verifications RLS.
    // Include null tenant_id rows when the submitting user is in admin tenant scope.
    let query = admin
      .from("user_verifications")
      .select("*")
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .order("submitted_at", { ascending: false });

    if (status === "pending") {
      query = query.in("status", [...USER_VERIFICATION_QUEUE_STATUSES]);
    } else if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data: verificationsRaw, error } = await query;

    if (error) {
      console.error("Error fetching verifications:", error);
      return successResponse([]);
    }

    const verifications = await filterVerificationsForAdminTenant(
      admin,
      tenantId,
      verificationsRaw ?? [],
    );

    if (verifications.length === 0) {
      return successResponse([]);
    }

    // Fetch related user data separately
    type VerificationRow = { user_id?: string; reviewed_by?: string };
    const vList = verifications as VerificationRow[];
    const userIds = [...new Set(vList.map((v) => v.user_id).filter(Boolean))];
    const reviewerIds = [...new Set(vList.map((v) => v.reviewed_by).filter(Boolean))];

    const { data: users } = userIds.length > 0
      ? await admin
          .from("users")
          .select("id, full_name, email, phone, avatar_url")
          .in("id", userIds)
      : { data: [] };

    const { data: reviewers } = reviewerIds.length > 0
      ? await admin
          .from("users")
          .select("id, full_name, email")
          .in("id", reviewerIds)
      : { data: [] };

    // NOTE: `providers` has no `verification_status` column — the canonical KYC
    // status lives in `provider_verification_status`. Select the real provider
    // columns here and resolve the KYC status separately below, otherwise the
    // whole select errors and the admin queue loses all provider context.
    const [ownerProvidersRes, staffProvidersRes] = await Promise.all([
      userIds.length > 0
        ? admin
            .from("providers")
            .select("id, user_id, business_name, slug, is_verified")
            .in("user_id", userIds)
        : Promise.resolve({ data: [] }),
      userIds.length > 0
        ? admin
            .from("provider_staff")
            .select("user_id, providers:providers!provider_staff_provider_id_fkey(id, business_name, slug, is_verified)")
            .in("user_id", userIds)
            .eq("is_active", true)
        : Promise.resolve({ data: [] }),
    ]);

    type UserRow = { id: string; full_name?: string; email?: string; phone?: string | null; avatar_url?: string | null };
    type ProviderInfo = {
      id: string;
      business_name?: string | null;
      slug?: string | null;
      is_verified?: boolean | null;
      verification_status?: string | null;
      relationship: "owner" | "staff";
    };
    const userMap = new Map((users || []).map((u: UserRow) => [u.id, u]));
    const reviewerMap = new Map((reviewers || []).map((r: UserRow) => [r.id, r]));
    const providerMap = new Map<string, ProviderInfo>();
    for (const p of (ownerProvidersRes.data || []) as Array<{ id: string; user_id?: string; business_name?: string | null; slug?: string | null; is_verified?: boolean | null }>) {
      if (!p.user_id) continue;
      providerMap.set(p.user_id, {
        id: p.id,
        business_name: p.business_name,
        slug: p.slug,
        is_verified: p.is_verified ?? null,
        verification_status: null,
        relationship: "owner",
      });
    }
    for (const row of (staffProvidersRes.data || []) as Array<{ user_id?: string; providers?: ProviderInfo | ProviderInfo[] | null }>) {
      if (!row.user_id || providerMap.has(row.user_id)) continue;
      const provider = Array.isArray(row.providers) ? row.providers[0] : row.providers;
      if (!provider?.id) continue;
      providerMap.set(row.user_id, {
        id: provider.id,
        business_name: provider.business_name,
        slug: provider.slug,
        is_verified: provider.is_verified ?? null,
        verification_status: null,
        relationship: "staff",
      });
    }

    // Resolve canonical KYC status from `provider_verification_status` for every
    // provider we surfaced, then fold it into each provider entry so the admin
    // queue shows the real Sumsub/manual KYC state (falling back to the
    // marketplace `is_verified` flag when no KYC row exists yet).
    const providerIdsForKyc = [...new Set([...providerMap.values()].map((p) => p.id))];
    if (providerIdsForKyc.length > 0) {
      const { data: kycRows } = await admin
        .from("provider_verification_status")
        .select("provider_id, status")
        .in("provider_id", providerIdsForKyc);
      const kycByProvider = new Map(
        ((kycRows || []) as Array<{ provider_id: string; status?: string | null }>).map((r) => [
          r.provider_id,
          r.status ?? null,
        ]),
      );
      for (const info of providerMap.values()) {
        info.verification_status =
          kycByProvider.get(info.id) ?? (info.is_verified ? "approved" : null);
      }
    }

    const enrichedVerifications = vList.map((v) => ({
      ...v,
      user: userMap.get(v.user_id ?? "") ?? {
        id: v.user_id,
        full_name: "Unknown User",
        email: "N/A",
        phone: null,
      },
      reviewer: v.reviewed_by ? reviewerMap.get(v.reviewed_by) ?? null : null,
      provider: providerMap.get(v.user_id ?? "") ?? null,
    }));

    return successResponse(enrichedVerifications);
  } catch (error) {
    return handleApiError(error, "Failed to fetch verifications");
  }
}
