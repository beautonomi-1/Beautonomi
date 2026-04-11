import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import crypto from "crypto";

/**
 * POST /api/admin/provider-ops/assist/create-account
 *
 * Admin-assisted account creation for a provider lead.
 * Creates a Supabase Auth user, public.users record, onboarding tracking,
 * an initial onboarding draft, and sends a password reset email.
 */
export async function POST(request: NextRequest) {
  try {
    const { user: adminUser } = await requireAdminSection(
      ADMIN_SECTION_PROVIDER_OPS,
      request
    );
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    if (!body.email?.trim()) {
      return errorResponse("email is required", "VALIDATION_ERROR", 400);
    }
    if (!body.full_name?.trim()) {
      return errorResponse("full_name is required", "VALIDATION_ERROR", 400);
    }

    const email = body.email.trim().toLowerCase();
    const fullName = body.full_name.trim();
    const phone = body.phone?.trim() || null;

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const supabase = getSupabaseAdmin();

    // Check if user already exists in public.users or auth.users
    const { data: existingUser } = await supabase
      .from("users")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    if (existingUser) {
      return errorResponse(
        `User with email ${email} already exists`,
        "ALREADY_EXISTS",
        409
      );
    }

    const tempPassword = crypto.randomBytes(16).toString("hex");

    const { data: authData, error: authErr } =
      await supabaseAuth.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          role: "provider_owner",
          full_name: fullName,
          tenant_id: tenantId,
        },
      });

    if (authErr) throw authErr;
    if (!authData.user) {
      throw new Error("Failed to create auth user");
    }

    const newUserId = authData.user.id;

    // Wait for handle_new_user trigger with retry
    let publicUserExists = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise((r) => setTimeout(r, 500));
      const { data: checkUser } = await supabase
        .from("users")
        .select("id")
        .eq("id", newUserId)
        .maybeSingle();
      if (checkUser) {
        publicUserExists = true;
        break;
      }
    }

    if (!publicUserExists) {
      // Trigger didn't fire — insert manually
      await supabase.from("users").insert({
        id: newUserId,
        email,
        full_name: fullName,
        phone,
        role: "provider_owner",
        tenant_id: tenantId,
      });
    } else {
      await supabase
        .from("users")
        .update({
          role: "provider_owner",
          full_name: fullName,
          phone,
          tenant_id: tenantId,
        })
        .eq("id", newUserId);
    }

    // Create tracking record
    await supabase.from("provider_onboarding_tracking").upsert(
      {
        user_id: newUserId,
        tenant_id: tenantId,
        wizard_status: "signed_up",
        signup_source: "admin_created",
        admin_assisted: true,
        lead_id: body.lead_id || null,
      },
      { onConflict: "user_id" }
    );

    // Create an initial onboarding draft so assisted onboarding can proceed
    const initialDraftData: Record<string, unknown> = {
      business_name: body.business_name || fullName,
      contact_name: fullName,
      email,
      phone: phone || undefined,
    };

    await supabase.from("provider_onboarding_drafts").upsert(
      {
        user_id: newUserId,
        current_step: 1,
        draft_data: initialDraftData,
      },
      { onConflict: "user_id" }
    );

    // Link to lead if lead_id provided
    if (body.lead_id) {
      await supabase
        .from("provider_leads")
        .update({
          matched_user_id: newUserId,
          matched_at: new Date().toISOString(),
          commercial_stage: "won",
        })
        .eq("id", body.lead_id)
        .eq("tenant_id", tenantId);

      await supabase.from("provider_lead_activities").insert({
        lead_id: body.lead_id,
        activity_type: "account_created",
        description: `Account created by admin ${adminUser.full_name || adminUser.email}`,
        metadata: {
          admin_id: adminUser.id,
          user_id: newUserId,
          method: "admin_create_user",
        },
        performed_by: adminUser.id,
      });
    }

    // Send password reset email using Supabase's built-in email flow.
    // resetPasswordForEmail triggers Supabase's email template (unlike
    // generateLink which only returns a URL without sending).
    let passwordResetSent = false;
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const redirectTo = `${siteUrl}/auth/callback?type=recovery`;

      const { error: resetError } = await supabaseAuth.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      passwordResetSent = !resetError;
      if (resetError) {
        console.warn("Password reset email failed, user can use forgot-password later:", resetError.message);
      }
    } catch {
      console.warn("Password reset email failed, non-fatal");
    }

    return successResponse({
      user_id: newUserId,
      email,
      full_name: fullName,
      method: "admin_created",
      password_reset_sent: passwordResetSent,
      draft_created: true,
    });
  } catch (error) {
    return handleApiError(error, "Failed to create account");
  }
}
