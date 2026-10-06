import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError, requireRoleInApi } from "@/lib/supabase/api-helpers";
import { NextRequest } from "next/server";
import { bootstrapPreferredHomeTenantForAuthedUser } from "@/lib/tenant/assign-preferred-home-tenant-from-host";
import { resolveVerificationPolicy } from "@/lib/verification/verification-policy";
import { buildProfileCompletion } from "@/lib/profile/build-profile-completion";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { resolveEffectiveVerificationDisplayStatus } from "@/lib/identity-verification/resolve-effective-verification-display-status";

/**
 * GET /api/me/profile-completion
 * 
 * Calculate profile completion percentage and checklist items
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);

    await bootstrapPreferredHomeTenantForAuthedUser(user.id, request);

    // Auth user for email_confirmed_at (Supabase verification state)
    const { data: { user: authUser } } = await supabase.auth.getUser();

    // Get user data
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    if (userError || !userData) {
      throw new Error("User not found");
    }

    // Get profile data
    const { data: profileData } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    // Get verification status
    const { data: verification } = await supabase
      .from("user_verifications")
      .select("status")
      .eq("user_id", user.id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Calculate completion for each item
    const isCustomer = user.role === "customer";
    const { searchParams } = new URL(request.url);
    const env = searchParams.get("environment") ?? "production";
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const verificationPolicy = await resolveVerificationPolicy(tenantId, env);
    const identityRequiredForCustomer = isCustomer && verificationPolicy.requiredForCustomers;

    const sessionIdentityStatus = isCustomer
      ? await resolveEffectiveVerificationDisplayStatus(user.id, "customer")
      : null;
    const identityChecklistComplete =
      userData.identity_verified === true ||
      userData.identity_verification_status === "approved" ||
      verification?.status === "approved" ||
      sessionIdentityStatus === "approved";

    const { data: addressRow } = await supabase
      .from("user_addresses")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    const completion = buildProfileCompletion({
      userData: { ...userData, role: user.role },
      profileData: profileData ?? null,
      authUser: authUser ?? null,
      hasAnyAddress: !!addressRow,
      identityChecklistComplete,
      identityRequiredForCustomer,
    });

    const res = successResponse({
      completed: completion.completed,
      total: completion.total,
      percentage: completion.percentage,
      checklistItems: completion.checklistItems,
      topItems: completion.topItems,
      avatar_url: userData.avatar_url ?? null,
    });
    res.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
    return res;
  } catch (error) {
    return handleApiError(error, "Failed to calculate profile completion");
  }
}
