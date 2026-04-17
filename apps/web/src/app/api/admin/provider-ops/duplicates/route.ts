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

function normEmail(e: string | null | undefined): string | null {
  if (!e?.trim()) return null;
  return e.trim().toLowerCase();
}

function normPhone(p: string | null | undefined): string | null {
  if (!p?.trim()) return null;
  return p.replace(/[\s\-().]/g, "").replace(/^00/, "+");
}

type ProviderRow = {
  id: string;
  business_name: string | null;
  billing_email: string | null;
  billing_phone: string | null;
  email: string | null;
  phone: string | null;
};

/** Merge provider match: same id gets combined matched_on + higher confidence */
function upsertProviderMatch(
  matches: PossibleDuplicate["matches"],
  p: ProviderRow,
  on: "email" | "phone",
) {
  const existing = matches.find((m) => m.type === "provider" && m.id === p.id);
  const emailOut = p.billing_email ?? p.email ?? null;
  const phoneOut = p.billing_phone ?? p.phone ?? null;
  if (existing) {
    if (!existing.matched_on.includes(on)) existing.matched_on.push(on);
    const hasE = existing.matched_on.includes("email");
    const hasP = existing.matched_on.includes("phone");
    existing.confidence = hasE && hasP ? 0.95 : hasE ? 0.85 : 0.8;
  } else {
    matches.push({
      type: "provider",
      id: p.id,
      name: p.business_name,
      email: emailOut,
      phone: phoneOut,
      matched_on: [on],
      confidence: on === "email" ? 0.85 : 0.8,
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: leads, error } = await supabase
      .from("provider_leads")
      .select("id, business_name, email, phone_e164, commercial_stage, source")
      .eq("tenant_id", tenantId)
      .is("matched_provider_id", null)
      .not("commercial_stage", "eq", "lost")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    const leadRows = leads || [];
    if (leadRows.length === 0) {
      return successResponse([]);
    }

    const emails = new Set<string>();
    const emailsRaw = new Set<string>();
    const phones = new Set<string>();
    for (const l of leadRows) {
      const raw = (l.email as string | null)?.trim();
      if (raw) emailsRaw.add(raw);
      const ne = normEmail(l.email as string | null);
      const np = normPhone(l.phone_e164 as string | null);
      if (ne) emails.add(ne);
      if (np) phones.add(np);
    }

    const emailQueryList = [...new Set([...emails, ...emailsRaw])];

    const [{ data: providers }, { data: providerOwners }, emailLeadRows, phoneLeadRows] = await Promise.all([
      supabase
        .from("providers")
        .select("id, business_name, email, billing_email, phone, billing_phone")
        .eq("tenant_id", tenantId),
      supabase
        .from("users")
        .select("id, full_name, email, phone")
        .eq("preferred_home_tenant_id", tenantId)
        .eq("role", "provider_owner"),
      emailQueryList.length
        ? supabase
            .from("provider_leads")
            .select("id, business_name, email, phone_e164")
            .eq("tenant_id", tenantId)
            .is("matched_provider_id", null)
            .not("commercial_stage", "eq", "lost")
            .in("email", emailQueryList)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      phones.size
        ? supabase
            .from("provider_leads")
            .select("id, business_name, email, phone_e164")
            .eq("tenant_id", tenantId)
            .is("matched_provider_id", null)
            .not("commercial_stage", "eq", "lost")
            .in("phone_e164", [...phones])
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ]);

    const emailKeyToOwners = new Map<string, (typeof providerOwners)[number][]>();
    for (const u of providerOwners || []) {
      const ne = normEmail(u.email as string | null);
      if (!ne) continue;
      const arr = emailKeyToOwners.get(ne) ?? [];
      arr.push(u);
      emailKeyToOwners.set(ne, arr);
    }

    const otherLeadById = new Map<string, { id: string; business_name: string | null; email: string | null; phone_e164: string | null }>();
    for (const row of [...(emailLeadRows.data || []), ...(phoneLeadRows.data || [])]) {
      const r = row as {
        id: string;
        business_name: string | null;
        email: string | null;
        phone_e164: string | null;
      };
      otherLeadById.set(r.id, r);
    }

    const duplicates: PossibleDuplicate[] = [];

    for (const lead of leadRows) {
      const le = normEmail(lead.email as string | null);
      const lp = normPhone(lead.phone_e164 as string | null);
      if (!le && !lp) continue;

      const matches: PossibleDuplicate["matches"] = [];

      for (const p of (providers || []) as ProviderRow[]) {
        const be = normEmail(p.billing_email);
        const em = normEmail(p.email);
        const pPhone = normPhone(p.phone);
        const pBillingPhone = normPhone(p.billing_phone);

        if (le && be && be === le) upsertProviderMatch(matches, p, "email");
        if (le && em && em === le) upsertProviderMatch(matches, p, "email");
        if (lp && (pPhone === lp || pBillingPhone === lp)) {
          upsertProviderMatch(matches, p, "phone");
        }
      }

      if (le) {
        for (const u of emailKeyToOwners.get(le) || []) {
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

      if (le) {
        for (const [oid, ol] of otherLeadById) {
          if (oid === lead.id) continue;
          const ole = normEmail(ol.email);
          if (ole === le) {
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
      }

      if (lp) {
        for (const [oid, ol] of otherLeadById) {
          if (oid === lead.id) continue;
          const olp = normPhone(ol.phone_e164);
          if (olp && olp === lp) {
            const existing = matches.find((m) => m.type === "lead" && m.id === oid);
            if (existing) {
              if (!existing.matched_on.includes("phone")) existing.matched_on.push("phone");
              existing.confidence = 0.75;
            } else {
              matches.push({
                type: "lead",
                id: ol.id,
                name: ol.business_name,
                email: ol.email,
                phone: ol.phone_e164,
                matched_on: ["phone"],
                confidence: 0.65,
              });
            }
          }
        }
      }

      if (matches.length > 0) {
        duplicates.push({
          lead: {
            id: lead.id as string,
            business_name: lead.business_name as string | null,
            email: lead.email as string | null,
            phone_e164: lead.phone_e164 as string | null,
            commercial_stage: lead.commercial_stage as string,
            source: lead.source as string,
          },
          matches,
        });
      }
    }

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
