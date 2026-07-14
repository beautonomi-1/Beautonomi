import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAuthInApi,
  successResponse,
  errorResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/provider/onboarding/invite/redeem
 *
 * Redeems a provider-lead onboarding invite token. Stamps
 * `invite_accepted_at` (first open only), logs an `invite_accepted`
 * activity so admins see the click in the lead timeline, and returns the
 * lead's `onboarding_data` + contact fields so the wizard can prefill.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const body = await request.json().catch(() => ({}));
    const token = typeof body.invite_token === "string" ? body.invite_token.trim() : "";

    if (!token || !UUID_RE.test(token)) {
      return errorResponse("A valid invite_token is required", "VALIDATION_ERROR", 400);
    }

    const supabase = getSupabaseAdmin();
    const { data: lead, error: leadErr } = await supabase
      .from("provider_leads")
      .select(
        "id, tenant_id, business_name, contact_person_name, email, phone_e164, suggested_location_text, country, description, onboarding_data, invite_accepted_at, matched_provider_id, matched_user_id, deleted_at"
      )
      .eq("invite_token", token)
      .is("deleted_at", null)
      .maybeSingle();
    if (leadErr) throw leadErr;
    if (!lead) return notFoundResponse("Invite not found or no longer valid");

    if (!lead.invite_accepted_at) {
      const { error: upErr } = await supabase
        .from("provider_leads")
        .update({ invite_accepted_at: new Date().toISOString() })
        .eq("id", lead.id);
      if (upErr) throw upErr;

      const { error: actErr } = await supabase.from("provider_lead_activities").insert({
        lead_id: lead.id,
        activity_type: "invite_accepted",
        description: "Onboarding invite link opened",
        metadata: { redeemed_by_user_id: user.id },
        performed_by: user.id,
      });
      if (actErr) {
        console.error("[onboarding/invite/redeem] activity insert error:", actErr);
      }
    }

    return successResponse({
      lead_id: lead.id,
      already_matched: Boolean(lead.matched_provider_id || lead.matched_user_id),
      prefill: {
        business_name: lead.business_name,
        contact_person_name: lead.contact_person_name,
        email: lead.email,
        phone_e164: lead.phone_e164,
        location_text: lead.suggested_location_text,
        country: lead.country,
        description: lead.description,
        onboarding_data: lead.onboarding_data ?? {},
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to redeem invite");
  }
}
