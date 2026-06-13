import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, notFoundResponse  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog } from "@/lib/audit/audit";
import {
  slackNotifyVerificationReviewed,
  slackNotifyVerificationRejected,
} from "@/lib/integrations/slack/ops-triggers";
import {
  resolveProviderIdForUser,
  syncProviderVerificationState,
} from "@/lib/verification/sync-provider-verification";
import { verificationAccessibleToAdminTenant } from "@/lib/admin/verification-tenant-access";
import { notifyIdentityVerificationReviewed } from "@/lib/verification/notify-identity-verification-reviewed";
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
    const admin = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: verification, error } = await admin
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

    if (!(await verificationAccessibleToAdminTenant(admin, tenantId, verification as { id?: string; tenant_id?: string | null; user_id?: string | null }))) {
      return notFoundResponse("Verification not found");
    }

    // Enrich with provider linkage so the SPA can cross-link to the lifecycle page.
    // Mirrors the list endpoint shape: { id, business_name, slug, verification_status, relationship }.
    let provider:
      | {
          id: string;
          business_name: string | null;
          slug: string | null;
          verification_status: string | null;
          relationship: "owner" | "staff";
        }
      | null = null;
    const verifiedUserId = (verification as { user_id?: string } | null)?.user_id;
    if (verifiedUserId) {
      try {
        const admin = getSupabaseAdmin();
        // `providers` has no `verification_status` column — read the marketplace
        // flag here and resolve the canonical KYC status from
        // `provider_verification_status` below.
        const { data: ownerProvider } = await admin
          .from("providers")
          .select("id, business_name, slug, is_verified")
          .eq("user_id", verifiedUserId)
          .limit(1)
          .maybeSingle();
        if (ownerProvider) {
          const p = ownerProvider as {
            id: string;
            business_name?: string | null;
            slug?: string | null;
            is_verified?: boolean | null;
          };
          provider = {
            id: p.id,
            business_name: p.business_name ?? null,
            slug: p.slug ?? null,
            verification_status: p.is_verified ? "approved" : null,
            relationship: "owner",
          };
        } else {
          const { data: staffRow } = await admin
            .from("provider_staff")
            .select(
              "providers:providers!provider_staff_provider_id_fkey(id, business_name, slug, is_verified)"
            )
            .eq("user_id", verifiedUserId)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();
          const raw = (staffRow as { providers?: unknown } | null)?.providers;
          const p = Array.isArray(raw) ? raw[0] : raw;
          if (p && typeof p === "object" && "id" in p) {
            const pp = p as {
              id: string;
              business_name?: string | null;
              slug?: string | null;
              is_verified?: boolean | null;
            };
            provider = {
              id: pp.id,
              business_name: pp.business_name ?? null,
              slug: pp.slug ?? null,
              verification_status: pp.is_verified ? "approved" : null,
              relationship: "staff",
            };
          }
        }

        // Canonical KYC status overrides the marketplace flag when present.
        if (provider?.id) {
          const { data: kycRow } = await admin
            .from("provider_verification_status")
            .select("status")
            .eq("provider_id", provider.id)
            .maybeSingle();
          const kycStatus = (kycRow as { status?: string | null } | null)?.status ?? null;
          if (kycStatus) provider.verification_status = kycStatus;
        }
      } catch (enrichErr) {
        console.error("[verifications/:id] provider enrichment failed:", enrichErr);
      }
    }

    return successResponse({ ...(verification as Record<string, unknown>), provider });
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
    const admin = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const validationResult = reviewSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { status, rejection_reason } = validationResult.data;

    const { data: existingVerification, error: existingError } = await admin
      .from("user_verifications")
      .select("id, tenant_id, user_id")
      .eq("id", id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!(await verificationAccessibleToAdminTenant(admin, tenantId, existingVerification))) {
      return notFoundResponse("Verification not found");
    }

    // Update verification (tenant_id may be null for Sumsub rows scoped via user)
    const { data: verification, error: updateError } = await admin
      .from("user_verifications")
      .update({
        status,
        rejection_reason: status === 'rejected' ? rejection_reason : null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
        ...(existingVerification?.tenant_id == null && tenantId
          ? { tenant_id: tenantId }
          : {}),
      })
      .eq("id", id)
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

    // Slack audit trail — always notify on review so the team can see activity.
    const subjectUser = (verification as { user?: { full_name?: string | null } | null } | null)?.user;
    const subjectName = subjectUser?.full_name ?? null;
    const reviewerName = (user as { full_name?: string | null }).full_name ?? user.email ?? null;

    slackNotifyVerificationReviewed({
      tenantId,
      verificationId: id,
      outcome: status,
      reviewerName,
      subjectName,
      rejectionReason: status === "rejected" ? rejection_reason ?? null : null,
    });

    // Extra alert on rejection so the team can proactively follow up.
    if (status === "rejected") {
      slackNotifyVerificationRejected({
        tenantId,
        verificationId: id,
        source: "manual",
        subject: subjectName,
        detail: rejection_reason ? `Reason: ${rejection_reason}` : "No reason specified — consider notifying the user.",
      });
    }

    // If the verified user is a provider, fan the approve/reject outcome out
    // to all three downstream tables so the public verified badge, setup
    // checklist, and provider KYC screen agree without a follow-up admin
    // action. §provider-verification-sync 2026-05.
    const verifiedUserId = (verification as { user_id?: string } | null)?.user_id;
    let linkedProviderId: string | null = null;
    if (verifiedUserId && (status === "approved" || status === "rejected")) {
      try {
        const adminClient = getSupabaseAdmin();
        linkedProviderId = await resolveProviderIdForUser(adminClient, verifiedUserId);

        if (linkedProviderId) {
          const syncResult = await syncProviderVerificationState(adminClient, {
            providerId: linkedProviderId,
            userId: verifiedUserId,
            status,
            source: "manual_admin",
            metadata: {
              manual_verification_id: id,
              manual_reviewed_by_user_id: user.id,
              manual_rejection_reason: status === "rejected" ? rejection_reason ?? null : null,
            },
          });
          if (!syncResult.ok) {
            console.error(
              "Manual review sync had errors:",
              syncResult.errors,
            );
          }
        } else {
          // No linked provider — still sync the customer-facing identity flag
          // by writing to users directly (mirrors the previous behavior).
          await adminClient
            .from("users")
            .update({
              identity_verified: status === "approved",
              identity_verification_status: status,
              identity_verification_reviewed_at: new Date().toISOString(),
            })
            .eq("id", verifiedUserId);
        }
      } catch (syncErr) {
        console.error("Failed to sync provider_verification_status after manual review:", syncErr);
        // Non-fatal — the user_verifications table was already updated correctly
      }

      // Awaited so serverless doesn't freeze before the send completes;
      // the helper never throws (errors are logged and swallowed).
      await notifyIdentityVerificationReviewed({
        userId: verifiedUserId,
        outcome: status,
        rejectionReason: status === "rejected" ? rejection_reason ?? null : null,
        isProvider: Boolean(linkedProviderId),
        tenantId,
      });
    }

    return successResponse(verification);
  } catch (error) {
    return handleApiError(error, "Failed to review verification");
  }
}
