import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { user } = await requireAdminSection(
      ADMIN_SECTION_PROVIDER_OPS,
      request
    );
    const { userId } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    // Fetch draft data
    const { data: draft, error: draftErr } = await supabase
      .from("provider_onboarding_drafts")
      .select("*")
      .eq("user_id", userId)
      .single();
    if (draftErr) throw draftErr;
    if (!draft) {
      return notFoundResponse("No draft found for this user");
    }

    const draftData = draft.draft_data as Record<string, unknown>;

    if (!draftData.business_name) {
      return errorResponse("Draft is missing business_name", "VALIDATION_ERROR", 400);
    }

    const { data: targetUser, error: userErr } = await supabase
      .from("users")
      .select("id, email, full_name, phone, role")
      .eq("id", userId)
      .eq("preferred_home_tenant_id", tenantId)
      .single();
    if (userErr) throw userErr;
    if (!targetUser) {
      return notFoundResponse("User not found");
    }

    // Check if provider already exists
    const { data: existingProvider, error: existProvErr } = await supabase
      .from("providers")
      .select("id")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (existProvErr) throw existProvErr;

    if (existingProvider) {
      return errorResponse("Provider already exists for this user", "CONFLICT", 409);
    }

    // Generate slug
    const businessName = draftData.business_name as string;
    const slug =
      businessName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") + `-${Date.now().toString(36)}`;

    // Create provider record
    const { data: provider, error: providerErr } = await supabase
      .from("providers")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        business_name: businessName,
        slug,
        description: (draftData.description as string) || "",
        business_type: (draftData.business_type as string) || "freelancer",
        team_size: (draftData.team_size as string) || "just_me",
        status: "pending_approval",
        onboarding_state: "ready_for_activation",
        billing_email: targetUser.email,
        billing_phone: targetUser.phone || (draftData.owner_phone as string),
        is_verified: false,
        yoco_machine_id: (draftData.yoco_machine as string) || null,
      })
      .select()
      .single();
    if (providerErr) throw providerErr;

    // Create provider location if address data exists
    const address = draftData.address as Record<string, unknown> | undefined;
    if (address?.address_line1) {
      const { error: locErr } = await supabase.from("provider_locations").insert({
        provider_id: provider.id,
        name: "Main",
        address_line1: address.address_line1,
        address_line2: address.address_line2 || null,
        city: address.city || null,
        state: address.state || null,
        postal_code: address.postal_code || null,
        country: address.country || null,
        latitude: address.latitude || null,
        longitude: address.longitude || null,
        is_primary: true,
      });
      if (locErr) throw locErr;
    }

    const categoryIds = draftData.global_category_ids as string[] | undefined;
    if (categoryIds?.length) {
      const catRows = categoryIds.map((catId: string) => ({
        provider_id: provider.id,
        global_category_id: catId,
      }));
      const { error: catErr } = await supabase
        .from("provider_global_category_associations")
        .insert(catRows);
      if (catErr) throw catErr;
    }

    const services = draftData.services as
      | Array<Record<string, unknown>>
      | undefined;
    if (services?.length) {
      const svcRows = services.map((svc) => ({
        provider_id: provider.id,
        name: svc.name,
        description: svc.description || null,
        price: svc.price || 0,
        duration: svc.duration || 60,
        is_active: true,
        global_category_id: svc.category_id || null,
      }));
      const { error: svcErr } = await supabase.from("offerings").insert(svcRows);
      if (svcErr) throw svcErr;
    }

    const hours = draftData.operating_hours as Record<
      string,
      { open: string; close: string; is_open: boolean }
    > | undefined;
    if (hours) {
      const dayRows = Object.entries(hours).map(([day, h]) => ({
        provider_id: provider.id,
        day_of_week: day,
        open_time: h.open || "09:00",
        close_time: h.close || "17:00",
        is_open: h.is_open !== false,
      }));
      const { error: hoursErr } = await supabase.from("provider_operating_hours").insert(dayRows);
      if (hoursErr) throw hoursErr;
    }

    const { error: trackErr } = await supabase
      .from("provider_onboarding_tracking")
      .upsert(
        {
          user_id: userId,
          tenant_id: tenantId,
          wizard_status: "submitted",
          provider_id: provider.id,
          admin_assisted: true,
          admin_completed_by: user.id,
          admin_completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    if (trackErr) throw trackErr;

    // Run lead matching
    await matchLeadToProvider(supabase, provider, targetUser, tenantId);

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.tracker.submit_onboarding",
      entity_type: "provider",
      entity_id: provider.id,
      module: "provider_ops",
      risk_level: "high",
      retention_tier: "operational",
      metadata: { user_id: userId, business_name: businessName },
      ...extractRequestMeta(request),
    });

    return successResponse({
      provider_id: provider.id,
      status: "pending_approval",
      admin_assisted: true,
      completed_by: user.id,
    });
  } catch (error) {
    return handleApiError(error, "Failed to submit onboarding");
  }
}

async function matchLeadToProvider(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  provider: { id: string },
  targetUser: { id: string; email: string; phone: string },
  tenantId: string
) {
  const conditions: string[] = [];
  if (targetUser.email) {
    conditions.push(`email.eq.${targetUser.email.toLowerCase()}`);
  }
  if (targetUser.phone) {
    conditions.push(`phone_e164.eq.${targetUser.phone}`);
  }
  if (conditions.length === 0) return;

  const { data: matchingLeads } = await supabase
    .from("provider_leads")
    .select("id")
    .eq("tenant_id", tenantId)
    .is("matched_provider_id", null)
    .or(conditions.join(","))
    .limit(1);

  if (matchingLeads?.length) {
    const leadId = matchingLeads[0].id;
    await supabase
      .from("provider_leads")
      .update({
        matched_provider_id: provider.id,
        matched_user_id: targetUser.id,
        match_confidence: 1.0,
        matched_at: new Date().toISOString(),
        commercial_stage: "matched",
      })
      .eq("id", leadId);

    await supabase
      .from("providers")
      .update({ lead_id: leadId })
      .eq("id", provider.id);

    await supabase.from("provider_lead_activities").insert({
      lead_id: leadId,
      activity_type: "match_confirmed",
      description: "Matched to provider via admin-assisted onboarding",
      metadata: { provider_id: provider.id, match_type: "admin_assisted" },
    });
  }
}
