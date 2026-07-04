import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError, getProviderIdForUser, errorResponse } from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { slackNotifyVerificationNeedsReview } from "@/lib/integrations/slack/ops-triggers";
import { resolveVerificationPolicy } from "@/lib/verification/verification-policy";
import {
  buildManualVerificationUpsertRow,
  getManualVerificationSubmitBlock,
  mapVerificationUploadError,
} from "@/lib/verification/manual-verification-submit";
import { resolveVerificationCountry } from "@/lib/verification/resolve-verification-country";

/**
 * GET /api/me/verification
 * Get current user's verification status, plus whether Didit is available
 * so the front-end can decide to show the automated or manual flow.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);

    // User verification fields
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("identity_verified, identity_verification_status, identity_verification_submitted_at, identity_verification_reviewed_at")
      .eq("id", user.id)
      .single();

    if (userError) throw userError;

    // All verification records (most recent first)
    const { data: verifications, error: verificationsError } = await supabase
      .from("user_verifications")
      .select("*")
      .eq("user_id", user.id)
      .order("submitted_at", { ascending: false });

    if (verificationsError) throw verificationsError;

    // Check verification policy for this environment and tenant.
    const { searchParams } = new URL(request.url);
    const env = searchParams.get("environment") ?? "production";
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const policy = await resolveVerificationPolicy(tenantId, env);

    const diditAvailable = policy.diditEnabled;
    const sumsubAvailable = false; // Sumsub removed; kept for API backward compat

    // Derive a combined status
    const userStatus = userData.identity_verification_status ?? "none";
    const list = verifications ?? [];
    const mostRecentManual = list.find((v) => v.document_type !== "sumsub");

    /** Blocks new uploads while automated or manual review is still in flight */
    const blockingStatuses = new Set([
      "pending",
      "in_progress",
      "submitted",
      "under_review",
    ]);
    // Only honour the user-level status when actual verification records back it up.
    // A stale users.identity_verification_status = 'pending' with no records
    // (e.g. from a failed submission that set the column before inserting the row)
    // must not permanently prevent the user from submitting their ID.
    const userBlocking = list.length > 0 && blockingStatuses.has(userStatus);
    const recordBlocking = list.some((v) => blockingStatuses.has(v.status));
    const can_submit_verification =
      !(userData.identity_verified ?? false) && !userBlocking && !recordBlocking;

    /** Safe list for clients — use GET /api/me/verification/[id]/view for file access */
    const submissions = list.map((v) => ({
      id: v.id,
      document_type: v.document_type,
      country: v.country,
      status: v.status,
      submitted_at: v.submitted_at,
      reviewed_at: v.reviewed_at,
      rejection_reason: v.rejection_reason ?? null,
      has_document_file: Boolean(v.document_url && String(v.document_url).trim()),
    }));

    return successResponse({
      verified: userData.identity_verified || false,
      status: userStatus,
      submitted_at: userData.identity_verification_submitted_at,
      reviewed_at: userData.identity_verification_reviewed_at,
      /** Full rows for admin/debug; prefer `submissions` in new clients */
      verifications: list,
      submissions,
      can_submit_verification,
      // Whether Didit automated verification is available
      didit_available: diditAvailable,
      // @deprecated Always false (Sumsub removed). Kept for legacy client compat.
      sumsub_available: sumsubAvailable,
      // Whether manual document upload is available
      manual_available: policy.manualEnabled,
      // Combined mode: "off" | "manual" | "didit" | "both"
      verification_mode: policy.mode,
      // Most recent manual document submission
      manual_verification: mostRecentManual
        ? {
            id: mostRecentManual.id,
            status: mostRecentManual.status,
            document_type: mostRecentManual.document_type,
            submitted_at: mostRecentManual.submitted_at,
          }
        : null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch verification status");
  }
}

/**
 * POST /api/me/verification
 * Upload verification document
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);

    // Gate: manual upload must be enabled by the verification.manual.enabled flag.
    const { searchParams: postParams } = new URL(request.url);
    const postEnv = postParams.get("environment") ?? "production";
    const postTenantId = await resolveTenantIdWithZaFallback(request);
    const postPolicy = await resolveVerificationPolicy(postTenantId, postEnv);
    if (!postPolicy.manualEnabled) {
      return errorResponse(
        "Manual document upload is currently disabled. Please use automated verification or contact support.",
        "MANUAL_VERIFICATION_DISABLED",
        403,
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const documentType = formData.get('document_type') as string;
    const country = formData.get('country') as string;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    if (!documentType) {
      return NextResponse.json(
        { error: "Document type is required" },
        { status: 400 }
      );
    }

    const countryResult = await resolveVerificationCountry(getSupabaseAdmin(), country);
    const resolvedCountry = countryResult.country;
    if (!resolvedCountry) {
      return NextResponse.json(
        { error: countryResult.message ?? "Select a valid country of issue from the list." },
        { status: 400 },
      );
    }

    // Validate document type
    const validTypes = ['license', 'passport', 'identity'];
    if (!validTypes.includes(documentType)) {
      return NextResponse.json(
        { error: "Invalid document type" },
        { status: 400 }
      );
    }

    const { data: userData, error: userGuardError } = await supabase
      .from("users")
      .select("identity_verified, identity_verification_status")
      .eq("id", user.id)
      .single();

    if (userGuardError) throw userGuardError;

    const { data: existingVerifications, error: existingVerificationsError } = await supabase
      .from("user_verifications")
      .select("status, document_type")
      .eq("user_id", user.id);

    if (existingVerificationsError) throw existingVerificationsError;

    const submitBlock = getManualVerificationSubmitBlock({
      identityVerified: userData.identity_verified ?? false,
      userStatus: userData.identity_verification_status ?? "none",
      verificationRecords: existingVerifications ?? [],
    });

    if (submitBlock) {
      return NextResponse.json(
        { error: submitBlock.reason },
        { status: submitBlock.status },
      );
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, WebP, and PDF are allowed." },
        { status: 400 }
      );
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File size exceeds 10MB limit." },
        { status: 400 }
      );
    }

    // Generate file path (don't include bucket name in path)
    const fileExt = file.name.split('.').pop() || 'jpg';
    const fileName = `${user.id}/${documentType}-${Date.now()}.${fileExt}`;
    const filePath = fileName;

    // Convert File to ArrayBuffer for Supabase
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { data: _uploadData, error: uploadError } = await supabase.storage
      .from('verification-documents')
      .upload(filePath, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Failed to upload document: ${uploadError.message}`);
    }

    // Get public URL (though documents should be private)
    const { data: { publicUrl } } = supabase.storage
      .from('verification-documents')
      .getPublicUrl(filePath);

    const tenantId = await resolveTenantIdWithZaFallback(request);
    const submittedAt = new Date().toISOString();

    // Upsert so rejected users can resubmit the same document type (unique on user_id + document_type).
    const { data: verification, error: verificationError } = await getSupabaseAdmin()
      .from("user_verifications")
      .upsert(
        buildManualVerificationUpsertRow({
          userId: user.id,
          documentType,
          country: resolvedCountry.code,
          documentUrl: publicUrl,
          tenantId,
          submittedAt,
        }),
        { onConflict: "user_id,document_type" },
      )
      .select()
      .single();

    if (verificationError) {
      const mapped = mapVerificationUploadError(verificationError);
      if (mapped) {
        return NextResponse.json({ error: mapped.message }, { status: mapped.status });
      }
      throw verificationError;
    }

    // Update user's verification status
    const { error: updateError } = await supabase
      .from("users")
      .update({
        identity_verification_status: 'pending',
        identity_verification_submitted_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) throw updateError;

    if (user.role === "provider_owner" || user.role === "provider_staff") {
      try {
        const providerId = await getProviderIdForUser(user.id, supabase, { request });
        if (providerId) {
          await getSupabaseAdmin()
            .from("provider_verification_status")
            .upsert(
              {
                provider_id: providerId,
                status: "in_progress",
                metadata: {
                  manual_verification_id: verification.id,
                  manual_document_type: documentType,
                  manual_country: resolvedCountry.code,
                  manual_submitted_by_user_id: user.id,
                  manual_submitted_at: verification.submitted_at,
                },
                updated_at: new Date().toISOString(),
              },
              { onConflict: "provider_id" }
            );
        }
      } catch (providerSyncError) {
        console.error("Failed to sync provider manual verification status:", providerSyncError);
      }
    }

    slackNotifyVerificationNeedsReview({
      tenantId,
      verificationId: verification.id,
      documentType,
      source: "manual",
    });

    return successResponse({
      verification_id: verification.id,
      document_url: publicUrl,
      status: 'pending',
    });
  } catch (error) {
    const mapped = mapVerificationUploadError(error);
    if (mapped) {
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }
    return handleApiError(error, "Failed to upload verification document");
  }
}
