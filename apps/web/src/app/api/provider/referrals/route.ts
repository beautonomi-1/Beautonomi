import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { normalizePhone } from "@/lib/provider-ops/leads-csv-import";
import { z } from "zod";

const createReferralSchema = z.object({
  business_name: z.string().trim().min(1, "Business name is required"),
  contact_person_name: z.string().trim().optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().optional(),
  suggested_location_text: z.string().trim().optional(),
  description: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

interface DedupMatch {
  type: "lead" | "provider";
  id: string;
  name: string | null;
}

async function findReferralDuplicates(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  tenantId: string,
  email: string | null,
  phoneE164: string | null,
): Promise<DedupMatch[]> {
  const matches: DedupMatch[] = [];

  if (email) {
    const { data: emailLeads } = await supabase
      .from("provider_leads")
      .select("id, business_name")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .eq("email", email);
    for (const lead of emailLeads || []) {
      matches.push({ type: "lead", id: lead.id, name: lead.business_name });
    }

    const { data: emailProviders } = await supabase
      .from("providers")
      .select("id, business_name")
      .eq("tenant_id", tenantId)
      .or(`billing_email.eq.${email},email.eq.${email}`);
    for (const provider of emailProviders || []) {
      matches.push({ type: "provider", id: provider.id, name: provider.business_name });
    }
  }

  if (phoneE164) {
    const { data: phoneLeads } = await supabase
      .from("provider_leads")
      .select("id, business_name")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .eq("phone_e164", phoneE164);
    for (const lead of phoneLeads || []) {
      if (!matches.some((m) => m.type === "lead" && m.id === lead.id)) {
        matches.push({ type: "lead", id: lead.id, name: lead.business_name });
      }
    }

    const { data: phoneProviders } = await supabase
      .from("providers")
      .select("id, business_name")
      .eq("tenant_id", tenantId)
      .or(`billing_phone.eq.${phoneE164},phone.eq.${phoneE164}`);
    for (const provider of phoneProviders || []) {
      if (!matches.some((m) => m.type === "provider" && m.id === provider.id)) {
        matches.push({ type: "provider", id: provider.id, name: provider.business_name });
      }
    }
  }

  return matches;
}

/**
 * GET /api/provider/referrals
 * List coarse status for leads this provider referred.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: providerRow, error: providerErr } = await admin
      .from("providers")
      .select("id, tenant_id")
      .eq("id", providerId)
      .single();
    if (providerErr || !providerRow?.tenant_id) {
      return notFoundResponse("Provider not found");
    }

    const { data: leads, error } = await admin
      .from("provider_leads")
      .select(
        "id, business_name, commercial_stage, invite_sent_at, invite_accepted_at, matched_provider_id, matched_user_id, created_at",
      )
      .eq("tenant_id", providerRow.tenant_id)
      .eq("referrer_provider_id", providerId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    const referrals = (leads ?? []).map((lead) => {
      let status: "submitted" | "invited" | "joined" = "submitted";
      if (lead.matched_provider_id || lead.matched_user_id || lead.commercial_stage === "matched") {
        status = "joined";
      } else if (lead.invite_sent_at || lead.invite_accepted_at) {
        status = "invited";
      }
      return {
        id: lead.id,
        business_name: lead.business_name,
        status,
        created_at: lead.created_at,
      };
    });

    return successResponse({ referrals });
  } catch (error) {
    return handleApiError(error, "Failed to load referrals");
  }
}

/**
 * POST /api/provider/referrals
 * Provider submits a business referral as a provider_ops lead.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: providerRow, error: providerErr } = await admin
      .from("providers")
      .select("id, tenant_id, business_name, user_id")
      .eq("id", providerId)
      .single();
    if (providerErr || !providerRow?.tenant_id) {
      return notFoundResponse("Provider not found");
    }

    const body = createReferralSchema.parse(await request.json());
    const email = body.email?.toLowerCase()?.trim() || null;
    const phoneResult = normalizePhone(body.phone || "");
    const phoneE164 = phoneResult.phone_e164;

    if (!email && !phoneE164) {
      return errorResponse(
        "Provide at least an email or phone number for the referred business",
        "VALIDATION_ERROR",
        400,
      );
    }

    const duplicates = await findReferralDuplicates(
      admin,
      providerRow.tenant_id,
      email,
      phoneE164,
    );
    if (duplicates.length > 0) {
      const first = duplicates[0];
      return errorResponse(
        `This business may already exist (${first.type}: ${first.name || first.id}). Our team will follow up if needed.`,
        "DUPLICATE_REFERRAL",
        409,
        { duplicates },
      );
    }

    const leadName =
      body.business_name.trim() ||
      body.contact_person_name?.trim() ||
      email ||
      phoneE164 ||
      "Referred business";

    const { data: lead, error: insertErr } = await admin
      .from("provider_leads")
      .insert({
        tenant_id: providerRow.tenant_id,
        lead_name: leadName,
        business_name: body.business_name.trim(),
        contact_person_name: body.contact_person_name?.trim() || null,
        email,
        phone_country_code: phoneResult.phone_country_code,
        phone_national: phoneResult.phone_national,
        phone_e164: phoneE164,
        suggested_location_text: body.suggested_location_text?.trim() || null,
        description: body.description?.trim() || null,
        notes: body.notes?.trim() || null,
        source: "referral",
        source_detail: providerRow.business_name?.trim() || null,
        referrer_provider_id: providerId,
        referrer_user_id: providerRow.user_id ?? user.id,
        commercial_stage: "new",
        created_by: user.id,
      })
      .select("id, business_name, commercial_stage, created_at")
      .single();
    if (insertErr) throw insertErr;

    await admin.from("provider_lead_activities").insert({
      lead_id: lead.id,
      activity_type: "referral_submitted",
      description: `Referred by ${providerRow.business_name || "provider"}`,
      metadata: {
        referrer_provider_id: providerId,
        submitted_by: user.id,
      },
      performed_by: user.id,
    });

    return successResponse({ lead });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.issues[0]?.message || "Invalid request", "VALIDATION_ERROR", 400);
    }
    return handleApiError(error, "Failed to submit referral");
  }
}
