import { requireProviderOpsSales } from "@/lib/provider-ops/ops-route-auth";
import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { leadIsDoNotContact } from "@/lib/provider-ops/do-not-contact";

const MAX_IDS = 500;

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(MAX_IDS),
});

/**
 * POST /api/admin/provider-ops/leads/contact-preview
 * Minimal contact fields for bulk WhatsApp review (hydrates select-all ids not on the current page).
 */
export async function POST(request: NextRequest) {
  try {
    await requireProviderOpsSales(request);
    const raw = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.flatten().formErrors.join("; ") || "Validation failed",
        "VALIDATION_ERROR",
        400,
      );
    }

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const uniqueIds = [...new Set(parsed.data.ids)];

    const { data, error } = await supabase
      .from("provider_leads")
      .select(
        "id, contact_person_name, lead_name, business_name, phone_e164, email, whatsapp_status, do_not_contact, do_not_contact_at",
      )
      .eq("tenant_id", tenantId)
      .in("id", uniqueIds);
    if (error) throw error;

    const byId = new Map(
      (data ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        const id = String(r.id);
        return [
          id,
          {
            id,
            contact_person_name: (r.contact_person_name as string | null) ?? null,
            lead_name: (r.lead_name as string | null) ?? null,
            business_name: (r.business_name as string | null) ?? null,
            phone_e164: (r.phone_e164 as string | null) ?? null,
            email: (r.email as string | null) ?? null,
            whatsapp_status: (r.whatsapp_status as string | null) ?? null,
            do_not_contact: leadIsDoNotContact(r),
          },
        ];
      }),
    );

    const leads = uniqueIds.map((id) => byId.get(id) ?? { id });

    return successResponse({ leads });
  } catch (error) {
    return handleApiError(error, "Failed to load lead contact preview");
  }
}
