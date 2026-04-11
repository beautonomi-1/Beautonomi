import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const { user: adminUser } = await requireAdminSection(
      ADMIN_SECTION_PROVIDER_OPS,
      request
    );
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    if (!body.email?.trim()) {
      return handleApiError(
        new Error("email is required"),
        "Validation failed"
      );
    }
    if (!body.full_name?.trim()) {
      return handleApiError(
        new Error("full_name is required"),
        "Validation failed"
      );
    }

    const email = body.email.trim().toLowerCase();
    const fullName = body.full_name.trim();

    // Use service_role key for admin operations
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Check if user already exists
    const supabase = getSupabaseAdmin();
    const { data: existingUser } = await supabase
      .from("users")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    if (existingUser) {
      return handleApiError(
        new Error(`User with email ${email} already exists`),
        "Already exists"
      );
    }

    // Generate a secure temporary password
    const tempPassword = crypto.randomBytes(16).toString("hex");

    // Create auth user via admin API (no OTP required)
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

    // Wait briefly for the handle_new_user trigger to create public.users row
    await new Promise((r) => setTimeout(r, 1000));

    // Update the public.users row with the correct role
    await supabase
      .from("users")
      .update({
        role: "provider_owner",
        full_name: fullName,
        phone: body.phone || null,
        tenant_id: tenantId,
      })
      .eq("id", newUserId);

    // Create tracking record
    await supabase.from("provider_onboarding_tracking").insert({
      user_id: newUserId,
      tenant_id: tenantId,
      wizard_status: "signed_up",
      signup_source: "admin_created",
      admin_assisted: true,
    });

    // Link to lead if lead_id provided
    if (body.lead_id) {
      await supabase
        .from("provider_onboarding_tracking")
        .update({ lead_id: body.lead_id })
        .eq("user_id", newUserId);

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

    // Trigger password reset email so provider can set their own password
    await supabaseAuth.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    return successResponse({
      user_id: newUserId,
      email,
      full_name: fullName,
      method: "admin_created",
    });
  } catch (error) {
    return handleApiError(error, "Failed to create account");
  }
}
