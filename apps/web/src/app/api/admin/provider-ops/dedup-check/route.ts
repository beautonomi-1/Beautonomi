import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

interface DedupMatch {
  type: "lead" | "provider" | "user";
  id: string;
  matched_on: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  confidence: number;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);

    const email = searchParams.get("email")?.toLowerCase()?.trim();
    const phone = searchParams.get("phone")?.trim();
    const excludeLeadId = searchParams.get("exclude_lead_id");

    if (!email && !phone) {
      return successResponse({ matches: [] });
    }

    const matches: DedupMatch[] = [];

    // Check against existing leads
    if (email) {
      let query = supabase
        .from("provider_leads")
        .select("id, business_name, email, phone_e164")
        .eq("tenant_id", tenantId)
        .eq("email", email);
      if (excludeLeadId) query = query.neq("id", excludeLeadId);
      const { data: emailLeads } = await query;

      for (const lead of emailLeads || []) {
        matches.push({
          type: "lead",
          id: lead.id,
          matched_on: "email",
          name: lead.business_name,
          email: lead.email,
          phone: lead.phone_e164,
          confidence: 1.0,
        });
      }
    }

    if (phone) {
      let query = supabase
        .from("provider_leads")
        .select("id, business_name, email, phone_e164")
        .eq("tenant_id", tenantId)
        .eq("phone_e164", phone);
      if (excludeLeadId) query = query.neq("id", excludeLeadId);
      const { data: phoneLeads } = await query;

      for (const lead of phoneLeads || []) {
        if (!matches.some((m) => m.type === "lead" && m.id === lead.id)) {
          matches.push({
            type: "lead",
            id: lead.id,
            matched_on: "phone",
            name: lead.business_name,
            email: lead.email,
            phone: lead.phone_e164,
            confidence: 1.0,
          });
        }
      }
    }

    // Check against existing providers
    if (email) {
      const { data: emailProviders } = await supabase
        .from("providers")
        .select("id, business_name, billing_email, billing_phone")
        .eq("tenant_id", tenantId)
        .eq("billing_email", email);

      for (const p of emailProviders || []) {
        matches.push({
          type: "provider",
          id: p.id,
          matched_on: "email",
          name: p.business_name,
          email: p.billing_email,
          phone: p.billing_phone,
          confidence: 1.0,
        });
      }
    }

    if (email) {
      const { data: emailUsers } = await supabase
        .from("users")
        .select("id, full_name, email, phone")
        .eq("tenant_id", tenantId)
        .eq("email", email);

      for (const u of emailUsers || []) {
        matches.push({
          type: "user",
          id: u.id,
          matched_on: "email",
          name: u.full_name,
          email: u.email,
          phone: u.phone,
          confidence: 1.0,
        });
      }
    }

    if (phone) {
      const { data: phoneUsers } = await supabase
        .from("users")
        .select("id, full_name, email, phone")
        .eq("tenant_id", tenantId)
        .eq("phone", phone);

      for (const u of phoneUsers || []) {
        if (!matches.some((m) => m.type === "user" && m.id === u.id)) {
          matches.push({
            type: "user",
            id: u.id,
            matched_on: "phone",
            name: u.full_name,
            email: u.email,
            phone: u.phone,
            confidence: 1.0,
          });
        }
      }
    }

    return successResponse({ matches });
  } catch (error) {
    return handleApiError(error, "Failed to check duplicates");
  }
}
