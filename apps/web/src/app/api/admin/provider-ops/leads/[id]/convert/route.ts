import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  errorResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@beautonomi/admin-access";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { sendOnboardingInvite } from "@/lib/provider-ops/send-onboarding-invite";
import crypto from "crypto";

function getPublicSiteBaseUrl(request: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}`;
}

/**
 * POST /api/admin/provider-ops/leads/[id]/convert
 *
 * mode: "assisted" — create/link user, seed onboarding draft, mark lead matched
 * mode: "invite"   — set invite token + return onboarding link
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: adminUser } = await requireAdminSection(
      ADMIN_SECTION_PROVIDER_OPS,
      request
    );
    const { id } = await params;
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json().catch(() => ({}));
    const mode = body.mode as string;

    if (!mode || !["assisted", "invite"].includes(mode)) {
      return errorResponse(
        'mode must be "assisted" or "invite"',
        "VALIDATION_ERROR",
        400
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: lead, error: leadErr } = await supabase
      .from("provider_leads")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();

    if (leadErr || !lead) return notFoundResponse("Lead not found");

    if (mode === "assisted") {
      return await handleAssistedConversion(
        request,
        supabase,
        lead as Record<string, unknown>,
        tenantId,
        adminUser
      );
    }

    return await handleInviteConversion(
      request,
      supabase,
      lead as Record<string, unknown>,
      tenantId,
      adminUser
    );
  } catch (error) {
    return handleApiError(error, "Failed to convert lead");
  }
}

async function handleAssistedConversion(
  request: NextRequest,
  supabase: ReturnType<typeof getSupabaseAdmin>,
  lead: Record<string, unknown>,
  tenantId: string,
  adminUser: { id: string; email?: string; full_name?: string | null; role: string }
) {
  const emailRaw = lead.email as string | null | undefined;
  const phoneE164 = lead.phone_e164 as string | null | undefined;
  const emailNorm = emailRaw?.trim() ? emailRaw.trim().toLowerCase() : null;

  if (!emailNorm && !phoneE164?.trim()) {
    return errorResponse(
      "Lead must have an email or phone for assisted conversion",
      "VALIDATION_ERROR",
      400
    );
  }

  if (lead.matched_user_id || lead.matched_provider_id) {
    return errorResponse(
      "This lead is already matched to a user or provider",
      "ALREADY_CONVERTED",
      409
    );
  }

  const fullName =
    (lead.contact_person_name as string) ||
    (lead.business_name as string) ||
    "Provider";

  const fromStage = String(lead.commercial_stage ?? "new");

  let existingUser: { id: string } | null = null;

  if (emailNorm) {
    const { data } = await supabase
      .from("users")
      .select("id")
      .eq("email", emailNorm)
      .maybeSingle();
    if (data) existingUser = data;
  }

  if (!existingUser && phoneE164?.trim()) {
    const { data } = await supabase
      .from("users")
      .select("id")
      .eq("phone", phoneE164.trim())
      .maybeSingle();
    if (data) existingUser = data;
  }

  let userId: string;

  if (existingUser) {
    userId = existingUser.id;
    await supabase
      .from("users")
      .update({
        role: "provider_owner",
        full_name: fullName,
        ...(emailNorm ? { email: emailNorm } : {}),
        ...(phoneE164?.trim() ? { phone: phoneE164.trim() } : {}),
        preferred_home_tenant_id: tenantId,
      })
      .eq("id", userId);
  } else {
    const password = crypto.randomBytes(24).toString("base64url");
    const meta = {
      role: "provider_owner",
      full_name: fullName,
      ...(phoneE164?.trim() ? { phone: phoneE164.trim() } : {}),
    };

    const createPayload = emailNorm
      ? {
          email: emailNorm,
          password,
          email_confirm: true,
          user_metadata: meta,
        }
      : {
          phone: phoneE164!.trim(),
          password,
          phone_confirm: true,
          user_metadata: meta,
        };

    const { data: authData, error: authErr } =
      await supabase.auth.admin.createUser(createPayload);

    if (authErr) throw authErr;
    if (!authData.user) throw new Error("Failed to create auth user");
    userId = authData.user.id;

    let publicUserExists = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise((r) => setTimeout(r, 400));
      const { data: checkUser } = await supabase
        .from("users")
        .select("id")
        .eq("id", userId)
        .maybeSingle();
      if (checkUser) {
        publicUserExists = true;
        break;
      }
    }

    const placeholderEmail = emailNorm ?? `${userId}@phone.local`;

    if (!publicUserExists) {
      const { error: insErr } = await supabase.from("users").insert({
        id: userId,
        email: placeholderEmail,
        full_name: fullName,
        phone: phoneE164?.trim() ?? null,
        role: "provider_owner",
        preferred_home_tenant_id: tenantId,
      });
      if (insErr) throw insErr;
    } else {
      await supabase
        .from("users")
        .update({
          role: "provider_owner",
          full_name: fullName,
          email: emailNorm ?? placeholderEmail,
          phone: phoneE164?.trim() ?? null,
          preferred_home_tenant_id: tenantId,
        })
        .eq("id", userId);
    }
  }

  const onboardingData =
    (lead.onboarding_data as Record<string, unknown> | null) ?? {};

  const { data: existingDraft } = await supabase
    .from("provider_onboarding_drafts")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!existingDraft) {
    const { error: draftErr } = await supabase
      .from("provider_onboarding_drafts")
      .insert({
        user_id: userId,
        current_step: 1,
        draft_data: onboardingData,
      });
    if (draftErr) throw draftErr;
  }

  const { error: leadUpErr } = await supabase
    .from("provider_leads")
    .update({
      matched_user_id: userId,
      matched_at: new Date().toISOString(),
      commercial_stage: "matched",
    })
    .eq("id", lead.id as string)
    .eq("tenant_id", tenantId);
  if (leadUpErr) throw leadUpErr;

  const { error: actErr } = await supabase.from("provider_lead_activities").insert({
    lead_id: lead.id as string,
    activity_type: "stage_change",
    description: "Converted to provider via assisted onboarding",
    metadata: {
      from_stage: fromStage,
      to_stage: "matched",
      note: "Converted to provider via assisted onboarding",
    },
    performed_by: adminUser.id,
  });
  if (actErr) throw actErr;

  void writeAuditLog({
    actor_user_id: adminUser.id,
    actor_role: adminUser.role,
    action: "admin.lead.convert_assisted",
    entity_type: "provider_lead",
    entity_id: lead.id as string,
    module: "provider_ops",
    risk_level: "high",
    retention_tier: "access",
    metadata: { user_id: userId, method: "assisted" },
    ...extractRequestMeta(request),
  });

  return successResponse({
    data: {
      user_id: userId,
      redirect_url: `/admin/provider-ops/tracker/${userId}`,
    },
  });
}

async function handleInviteConversion(
  request: NextRequest,
  supabase: ReturnType<typeof getSupabaseAdmin>,
  lead: Record<string, unknown>,
  tenantId: string,
  adminUser: { id: string; email?: string; full_name?: string | null; role: string }
) {
  const email = lead.email as string | null | undefined;
  const phone = lead.phone_e164 as string | null | undefined;

  if (!email?.trim() && !phone?.trim()) {
    return errorResponse(
      "Lead must have an email or phone to send an invite",
      "VALIDATION_ERROR",
      400
    );
  }

  const inviteToken = crypto.randomUUID();
  // Prefer email for self-service onboarding; fall back to SMS when phone-only.
  const channel: "email" | "sms" = email?.trim() ? "email" : "sms";

  const { error: upErr } = await supabase
    .from("provider_leads")
    .update({
      invite_token: inviteToken,
      invite_sent_at: new Date().toISOString(),
    })
    .eq("id", lead.id as string)
    .eq("tenant_id", tenantId);
  if (upErr) throw upErr;

  const baseUrl = getPublicSiteBaseUrl(request);
  const inviteLink = `${baseUrl}/provider/onboarding?invite=${inviteToken}`;

  const delivery = await sendOnboardingInvite({
    supabase,
    tenantId,
    lead: {
      id: lead.id as string,
      email: lead.email as string | null,
      phone_e164: lead.phone_e164 as string | null,
      contact_person_name: lead.contact_person_name as string | null,
      business_name: lead.business_name as string | null,
    },
    inviteLink,
    channel,
    performedBy: adminUser.id,
  });

  void writeAuditLog({
    actor_user_id: adminUser.id,
    actor_role: adminUser.role,
    action: "admin.lead.convert_invite",
    entity_type: "provider_lead",
    entity_id: lead.id as string,
    module: "provider_ops",
    risk_level: "medium",
    retention_tier: "operational",
    metadata: { method: "invite", channel, delivered: delivery.delivered },
    ...extractRequestMeta(request),
  });

  return successResponse({
    data: {
      invite_link: inviteLink,
      sent_to: delivery.sent_to,
      channel: delivery.channel,
      delivered: delivery.delivered,
      delivery_error: delivery.delivery_error,
      app_links: delivery.app_links,
    },
  });
}
