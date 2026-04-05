import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, notFoundResponse  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog } from "@/lib/audit/audit";
import { z } from "zod";

// Schema for verification review
const reviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  rejection_reason: z.string().max(500).nullable().optional(),
});

/**
 * GET /api/admin/verifications/[id]
 * Get a specific verification
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    const { id } = await params;
    const supabase = await getSupabaseServer(request);

    const { data: verification, error } = await supabase
      .from("user_verifications")
      .select(`
        *,
        user:users!user_verifications_user_id_fkey (
          id,
          full_name,
          email,
          phone,
          avatar_url
        ),
        reviewer:users!user_verifications_reviewed_by_fkey (
          id,
          full_name,
          email
        )
      `)
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return notFoundResponse("Verification not found");
      }
      throw error;
    }

    return successResponse(verification);
  } catch (error) {
    return handleApiError(error, "Failed to fetch verification");
  }
}

/**
 * PATCH /api/admin/verifications/[id]
 * Review a verification (approve or reject)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    const { id } = await params;
    const body = await request.json();
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);

    const validationResult = reviewSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { status, rejection_reason } = validationResult.data;

    // Update verification
    const { data: verification, error: updateError } = await supabase
      .from("user_verifications")
      .update({
        status,
        rejection_reason: status === 'rejected' ? rejection_reason : null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select(`
        *,
        user:users!user_verifications_user_id_fkey (
          id,
          full_name,
          email
        )
      `)
      .single();

    if (updateError) {
      if (updateError.code === 'PGRST116') {
        return notFoundResponse("Verification not found");
      }
      throw updateError;
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.verification.review",
      entity_type: "user_verification",
      entity_id: id,
      metadata: { status, user_id: (verification as { user_id?: string } | null)?.user_id, rejection_reason: status === "rejected" ? rejection_reason : null },
    });

    // If the verified user is a provider, sync the approval into provider_verification_status
    // so the provider's KYC screen reflects the manual review result.
    const verifiedUserId = (verification as { user_id?: string } | null)?.user_id;
    if (verifiedUserId && (status === "approved" || status === "rejected")) {
      try {
        const adminClient = getSupabaseAdmin();
        const { data: provider } = await adminClient
          .from("providers")
          .select("id")
          .eq("user_id", verifiedUserId)
          .limit(1)
          .maybeSingle();
        if (provider?.id) {
          const kycStatus = status === "approved" ? "approved" : "rejected";
          await adminClient
            .from("provider_verification_status")
            .upsert(
              {
                provider_id: provider.id,
                status: kycStatus,
                last_reviewed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              { onConflict: "provider_id" }
            );
        }
      } catch (syncErr) {
        console.error("Failed to sync provider_verification_status after manual review:", syncErr);
        // Non-fatal — the user_verifications table was already updated correctly
      }
    }

    return successResponse(verification);
  } catch (error) {
    return handleApiError(error, "Failed to review verification");
  }
}
