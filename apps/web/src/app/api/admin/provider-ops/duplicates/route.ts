import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

interface PossibleDuplicate {
  lead: {
    id: string;
    business_name: string | null;
    email: string | null;
    phone_e164: string | null;
    commercial_stage: string;
    source: string;
  };
  matches: Array<{
    type: "provider" | "user" | "lead";
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    matched_on: string[];
    confidence: number;
  }>;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    // Get unmatched leads that have phone or email
    const { data: leads, error } = await supabase
      .from("provider_leads")
      .select("id, business_name, email, phone_e164, commercial_stage, source")
      .eq("tenant_id", tenantId)
      .is("matched_provider_id", null)
      .not("commercial_stage", "eq", "lost")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    const duplicates: PossibleDuplicate[] = [];

    for (const lead of leads || []) {
      if (!lead.email && !lead.phone_e164) continue;

      const matches: PossibleDuplicate["matches"] = [];

      // Check providers by email
      if (lead.email) {
        const { data: provsByEmail } = await supabase
          .from("providers")
          .select("id, business_name, billing_email, billing_phone")
          .eq("tenant_id", tenantId)
          .eq("billing_email", lead.email);

        for (const p of provsByEmail || []) {
          matches.push({
            type: "provider",
            id: p.id,
            name: p.business_name,
            email: p.billing_email,
            phone: p.billing_phone,
            matched_on: ["email"],
            confidence: 0.7,
          });
        }
      }

      // Check providers by phone
      if (lead.phone_e164) {
        const { data: provsByPhone } = await supabase
          .from("providers")
          .select("id, business_name, billing_email, billing_phone")
          .eq("tenant_id", tenantId)
          .eq("phone", lead.phone_e164);

        for (const p of provsByPhone || []) {
          const existing = matches.find(
            (m) => m.type === "provider" && m.id === p.id
          );
          if (existing) {
            existing.matched_on.push("phone");
            existing.confidence = 0.95;
          } else {
            matches.push({
              type: "provider",
              id: p.id,
              name: p.business_name,
              email: p.billing_email,
              phone: p.billing_phone,
              matched_on: ["phone"],
              confidence: 0.8,
            });
          }
        }
      }

      if (lead.email) {
        const { data: usersByEmail } = await supabase
          .from("users")
          .select("id, full_name, email, phone, role")
          .eq("preferred_home_tenant_id", tenantId)
          .eq("email", lead.email)
          .eq("role", "provider_owner");

        for (const u of usersByEmail || []) {
          matches.push({
            type: "user",
            id: u.id,
            name: u.full_name,
            email: u.email,
            phone: u.phone,
            matched_on: ["email"],
            confidence: 0.7,
          });
        }
      }

      // Check other leads (same email or phone)
      if (lead.email) {
        const { data: otherLeadsByEmail } = await supabase
          .from("provider_leads")
          .select("id, business_name, email, phone_e164")
          .eq("tenant_id", tenantId)
          .eq("email", lead.email)
          .neq("id", lead.id);

        for (const ol of otherLeadsByEmail || []) {
          matches.push({
            type: "lead",
            id: ol.id,
            name: ol.business_name,
            email: ol.email,
            phone: ol.phone_e164,
            matched_on: ["email"],
            confidence: 0.6,
          });
        }
      }

      if (matches.length > 0) {
        duplicates.push({
          lead: {
            id: lead.id,
            business_name: lead.business_name,
            email: lead.email,
            phone_e164: lead.phone_e164,
            commercial_stage: lead.commercial_stage,
            source: lead.source,
          },
          matches,
        });
      }
    }

    // Sort by highest confidence first
    duplicates.sort((a, b) => {
      const maxA = Math.max(...a.matches.map((m) => m.confidence));
      const maxB = Math.max(...b.matches.map((m) => m.confidence));
      return maxB - maxA;
    });

    return successResponse(duplicates);
  } catch (error) {
    return handleApiError(error, "Failed to fetch duplicates");
  }
}
