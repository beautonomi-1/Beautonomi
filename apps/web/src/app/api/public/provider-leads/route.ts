import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePublicTenant } from "@/lib/tenant/require-public-tenant";
import { checkPublicMutationRateLimit } from "@/lib/rate-limit/public-mutation";
import { findLeadDuplicates } from "@/lib/provider-ops/lead-dedup";
import {
  ensureProviderOpsCase,
  syncLeadOwnerFromSalesCase,
} from "@/lib/provider-ops/ops-case";
import { slackNotifyLeadCreatedForTenant } from "@/lib/integrations/slack/lead-triggers";

const createLeadSchema = z
  .object({
    business_name: z.string().min(1).optional(),
    contact_person_name: z.string().min(1).optional(),
    email: z.string().email().optional().or(z.literal("")),
    phone_e164: z.string().min(8).optional(),
    suggested_location_text: z.string().optional(),
    country: z.string().optional(),
    description: z.string().optional(),
    notes: z.string().optional(),
    deal_value: z.number().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.business_name?.trim() && !data.contact_person_name?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "business_name or contact_person_name is required",
        path: ["business_name"],
      });
    }
    const email = data.email?.trim() ?? "";
    const phone = data.phone_e164?.trim() ?? "";
    if (!email && !phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "email or phone_e164 is required",
        path: ["email"],
      });
    }
  });

/**
 * POST /api/public/provider-leads
 * Public provider lead capture (native contact form). Host tenant required.
 */
export async function POST(request: NextRequest) {
  const rateLimit = await checkPublicMutationRateLimit(request);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 60) } },
    );
  }

  try {
    const tenantRes = await requirePublicTenant(request);
    if (tenantRes instanceof NextResponse) return tenantRes;
    const { tenantId } = tenantRes;

    const parsed = createLeadSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues.map((i) => i.message).join(", "),
        "VALIDATION_ERROR",
        400,
      );
    }

    const data = parsed.data;
    const email = data.email?.trim().toLowerCase() || null;
    const phone = data.phone_e164?.trim() || null;

    const supabase = getSupabaseAdmin();

    const duplicates = await findLeadDuplicates(supabase, tenantId, { email, phone });
    const existingLead = duplicates.find((m) => m.type === "lead");
    if (existingLead) {
      const { data: leadRow } = await supabase
        .from("provider_leads")
        .select("*")
        .eq("id", existingLead.id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (leadRow) {
        return successResponse({ lead: leadRow, duplicate: true });
      }
    }

    const leadName =
      data.business_name?.trim() ||
      data.contact_person_name?.trim() ||
      email ||
      phone ||
      "Inbound lead";

    const { data: lead, error: insertErr } = await supabase
      .from("provider_leads")
      .insert({
        tenant_id: tenantId,
        lead_name: leadName,
        business_name: data.business_name?.trim() || null,
        contact_person_name: data.contact_person_name?.trim() || null,
        email,
        phone_e164: phone,
        suggested_location_text: data.suggested_location_text?.trim() || null,
        country: data.country?.trim() || null,
        description: data.description?.trim() || null,
        notes: data.notes?.trim() || null,
        deal_value: data.deal_value ?? null,
        commercial_stage: "new",
        source: "form",
        source_detail: "become-a-partner",
      })
      .select("*")
      .single();

    if (insertErr) throw insertErr;

    await ensureProviderOpsCase(supabase, {
      tenantId,
      leadId: lead.id as string,
      currentDesk: "sales",
      dealValue: data.deal_value ?? null,
      tryAutoAssign: true,
    });

    const assignedTo = await syncLeadOwnerFromSalesCase(supabase, tenantId, lead.id as string);

    await supabase.from("provider_lead_activities").insert({
      lead_id: lead.id,
      activity_type: "lead_created",
      description: "Lead created via public form",
      metadata: { source: "form" },
      performed_by: null,
    });

    void slackNotifyLeadCreatedForTenant(tenantId, {
      id: lead.id as string,
      business_name: lead.business_name as string | null,
      assigned_to: assignedTo,
    });

    return successResponse({
      lead: { ...lead, assigned_to: assignedTo ?? lead.assigned_to },
      duplicate: false,
    });
  } catch (error) {
    return handleApiError(error, "Failed to submit provider lead");
  }
}
