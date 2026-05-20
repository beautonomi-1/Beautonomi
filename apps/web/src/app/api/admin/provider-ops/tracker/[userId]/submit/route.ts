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
import { getUserRowIfAccessibleToAdminTenant } from "@/lib/tenant/admin-user-tenant-access";
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

    const targetUser = await getUserRowIfAccessibleToAdminTenant(supabase, tenantId, userId);
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
        billing_email: typeof targetUser.email === "string" ? targetUser.email : "",
        billing_phone:
          (typeof targetUser.phone === "string" ? targetUser.phone : null) ||
          (draftData.owner_phone as string),
        is_verified: false,
        yoco_machine_id: (draftData.yoco_machine as string) || null,
      })
      .select()
      .single();
    if (providerErr) throw providerErr;

    // Create provider location if address data exists.
    // The draft stores address keys as `line1`/`line2` (matching the self-serve
    // onboarding schema).  `working_hours` is stored directly on the location
    // row as JSONB — there is no separate `provider_operating_hours` table.
    const address = draftData.address as Record<string, unknown> | undefined;
    // Normalise Format-B operating hours ({day:{open,close,closed}}) into the
    // canonical Format-A shape ({day:{is_open,open_time,close_time}}) so the
    // mobile and web readers both display it correctly.
    const rawHours = draftData.operating_hours as
      | Record<string, { open?: string; close?: string; closed?: boolean; is_open?: boolean; open_time?: string; close_time?: string }>
      | undefined;
    const workingHours: Record<string, unknown> | undefined = rawHours
      ? Object.fromEntries(
          Object.entries(rawHours).map(([day, h]) => [
            day,
            {
              is_open: h.is_open !== undefined ? h.is_open : h.closed !== true,
              open_time: h.open_time ?? h.open ?? "09:00",
              close_time: h.close_time ?? h.close ?? "17:00",
              breaks: [],
            },
          ])
        )
      : undefined;

    const addressLine1 = (address?.line1 ?? address?.address_line1) as string | undefined;
    if (addressLine1) {
      const { error: locErr } = await supabase.from("provider_locations").insert({
        provider_id: provider.id,
        name: "Main",
        address_line1: addressLine1,
        address_line2: (address?.line2 ?? address?.address_line2) as string | null || null,
        city: address?.city as string | null || null,
        state: address?.state as string | null || null,
        postal_code: address?.postal_code as string | null || null,
        country: address?.country as string | null || null,
        latitude: address?.latitude as number | null || null,
        longitude: address?.longitude as number | null || null,
        working_hours: workingHours ?? null,
        is_active: true,
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

    // Ensure the owner has a provider_staff row so the mobile staff-schedule
    // screen and shift calendar have a bookable member.  Prefer the generic RPC
    // (migration 618); fall back to an inline upsert if not yet deployed.
    try {
      const { error: ownerStaffErr } = await supabase.rpc(
        "ensure_provider_owner_staff",
        { p_provider_id: provider.id }
      );
      if (ownerStaffErr &&
        !ownerStaffErr.message?.includes("function") &&
        !ownerStaffErr.message?.includes("does not exist")) {
        console.error("ensure_provider_owner_staff RPC error (admin submit):", ownerStaffErr);
      }
      if (ownerStaffErr) {
        // Inline fallback
        const { data: existingOwnerStaff } = await supabase
          .from("provider_staff")
          .select("id")
          .eq("provider_id", provider.id)
          .eq("user_id", userId)
          .maybeSingle();
        if (!existingOwnerStaff) {
          await supabase.from("provider_staff").insert({
            provider_id: provider.id,
            user_id: userId,
            name: businessName,
            email: typeof targetUser.email === "string" ? targetUser.email : null,
            phone: typeof targetUser.phone === "string" ? targetUser.phone : null,
            role: "owner",
            is_active: true,
            mobile_ready: (draftData.business_type as string) === "mobile",
          });
        }
      }
    } catch (staffErr) {
      console.error("Error creating owner staff (admin submit):", staffErr);
      // Non-fatal — staff can be created through team management UI
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
    await matchLeadToProvider(supabase, provider, {
      id: String(targetUser.id),
      email: typeof targetUser.email === "string" ? targetUser.email : "",
      phone: typeof targetUser.phone === "string" ? targetUser.phone : "",
    }, tenantId);

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
