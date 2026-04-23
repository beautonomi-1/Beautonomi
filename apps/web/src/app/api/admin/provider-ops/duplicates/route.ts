import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/**
 * Admin provider-ops duplicate detection.
 *
 * §Release-audit 2026-04: Rewritten from a per-lead "possible match list" into
 * a *key-grouped* view so the admin can triage duplicates in bulk.
 *
 * A group is keyed by a normalized contact identifier (email or phone) and
 * contains:
 *   - every unmatched, non-lost lead in the tenant that shares that key, AND
 *   - the single existing provider (if any) that shares that key, AND
 *   - the single existing provider-owner user (if any) that shares that key.
 *
 * The UI uses this shape to bulk-delete spam duplicates with one action.
 *
 * Previous versions capped the scan at 200 leads; that silently hid most
 * duplicates once a tenant grew past that. We now scan up to MAX_LEADS_SCAN
 * rows in a single query (PostgREST/postgres can do this comfortably because
 * we only select 6 small columns).
 */

const MAX_LEADS_SCAN = 5000;

type Reason =
  | "already_provider"
  | "already_user"
  | "internal_duplicate"
  | "matched_provider_and_duplicate";

type KeyType = "email" | "phone";

interface DupLead {
  id: string;
  business_name: string | null;
  contact_person_name: string | null;
  email: string | null;
  phone_e164: string | null;
  commercial_stage: string;
  source: string;
  created_at: string;
  matched_provider_id: string | null;
}

interface ExistingProvider {
  id: string;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
}

interface ExistingUser {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

interface DuplicateGroup {
  key: string;
  key_type: KeyType;
  key_display: string;
  reason: Reason;
  lead_count: number;
  leads: DupLead[];
  existing_provider: ExistingProvider | null;
  existing_user: ExistingUser | null;
  /**
   * Recommended "safe" bulk deletion — the leads the admin can remove without
   * losing attribution. For provider matches that's every lead in the group;
   * for internal duplicates it's every lead EXCEPT the newest.
   */
  recommended_delete_ids: string[];
}

interface DuplicatesResponse {
  total_groups: number;
  total_duplicate_leads: number;
  scanned_leads: number;
  scan_capped: boolean;
  groups: DuplicateGroup[];
}

function normEmail(e: string | null | undefined): string | null {
  if (!e?.trim()) return null;
  return e.trim().toLowerCase();
}

/**
 * Permissive phone normalizer so `0612345678` and `+27612345678` group
 * together when the tenant is South African. Not a full libphonenumber —
 * we just strip separators, coerce `00` to `+`, and fall back to the last 9
 * digits when a national-format number slips in without a country code.
 */
function normPhone(p: string | null | undefined): string | null {
  if (!p?.trim()) return null;
  const cleaned = p.trim().replace(/[\s\-().]/g, "").replace(/^00/, "+");
  if (!cleaned) return null;
  return cleaned;
}

/**
 * Two phone numbers "match" if either:
 * - they are identical after normalization, OR
 * - the trailing 9 digits match (covers national vs E.164 for the same line).
 *
 * The 9-digit tail is a conservative heuristic — mobile numbers in ZA/NG/KE
 * are 9 digits long after the country code, so this matches the common case
 * without collapsing unrelated numbers together.
 */
function phoneBucketKey(p: string): string {
  const digits = p.replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : digits;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: leadsData, error: leadsErr } = await supabase
      .from("provider_leads")
      .select(
        "id, business_name, contact_person_name, email, phone_e164, commercial_stage, source, created_at, matched_provider_id",
      )
      .eq("tenant_id", tenantId)
      .is("matched_provider_id", null)
      .not("commercial_stage", "eq", "lost")
      .order("created_at", { ascending: false })
      .limit(MAX_LEADS_SCAN);
    if (leadsErr) throw leadsErr;
    const leads = (leadsData ?? []) as DupLead[];

    const [{ data: providers, error: provErr }, { data: owners, error: ownErr }] =
      await Promise.all([
        supabase
          .from("providers")
          .select("id, business_name, email, billing_email, phone, billing_phone, status")
          .eq("tenant_id", tenantId),
        supabase
          .from("users")
          .select("id, full_name, email, phone")
          .eq("preferred_home_tenant_id", tenantId)
          .eq("role", "provider_owner"),
      ]);
    if (provErr) throw provErr;
    if (ownErr) throw ownErr;

    const emailGroups = new Map<string, { leads: DupLead[]; display: string }>();
    const phoneGroups = new Map<string, { leads: DupLead[]; display: string }>();

    for (const lead of leads) {
      const e = normEmail(lead.email);
      if (e) {
        const bucket = emailGroups.get(e) ?? { leads: [], display: lead.email || e };
        bucket.leads.push(lead);
        emailGroups.set(e, bucket);
      }
      const p = normPhone(lead.phone_e164);
      if (p) {
        const key = phoneBucketKey(p);
        if (key) {
          const bucket = phoneGroups.get(key) ?? { leads: [], display: lead.phone_e164 || p };
          bucket.leads.push(lead);
          phoneGroups.set(key, bucket);
        }
      }
    }

    type ProviderIndex = { byEmail: Map<string, ExistingProvider>; byPhone: Map<string, ExistingProvider> };
    const providerIdx: ProviderIndex = { byEmail: new Map(), byPhone: new Map() };
    for (const raw of providers ?? []) {
      const p = raw as {
        id: string;
        business_name: string | null;
        email: string | null;
        billing_email: string | null;
        phone: string | null;
        billing_phone: string | null;
        status: string | null;
      };
      const rec: ExistingProvider = {
        id: p.id,
        business_name: p.business_name,
        email: p.billing_email ?? p.email,
        phone: p.billing_phone ?? p.phone,
        status: p.status,
      };
      for (const e of [normEmail(p.email), normEmail(p.billing_email)]) {
        if (e && !providerIdx.byEmail.has(e)) providerIdx.byEmail.set(e, rec);
      }
      for (const ph of [normPhone(p.phone), normPhone(p.billing_phone)]) {
        if (!ph) continue;
        const k = phoneBucketKey(ph);
        if (k && !providerIdx.byPhone.has(k)) providerIdx.byPhone.set(k, rec);
      }
    }

    const userIdx = { byEmail: new Map<string, ExistingUser>(), byPhone: new Map<string, ExistingUser>() };
    for (const raw of owners ?? []) {
      const u = raw as { id: string; full_name: string | null; email: string | null; phone: string | null };
      const rec: ExistingUser = { id: u.id, full_name: u.full_name, email: u.email, phone: u.phone };
      const e = normEmail(u.email);
      if (e && !userIdx.byEmail.has(e)) userIdx.byEmail.set(e, rec);
      const ph = normPhone(u.phone);
      if (ph) {
        const k = phoneBucketKey(ph);
        if (k && !userIdx.byPhone.has(k)) userIdx.byPhone.set(k, rec);
      }
    }

    const groups: DuplicateGroup[] = [];
    const seenLeadIds = new Set<string>();

    function pushGroup(
      keyType: KeyType,
      key: string,
      display: string,
      bucketLeads: DupLead[],
      existingProvider: ExistingProvider | null,
      existingUser: ExistingUser | null,
    ) {
      const duplicate = bucketLeads.length >= 2;
      const hasExternalMatch = Boolean(existingProvider || existingUser);
      if (!duplicate && !hasExternalMatch) return;

      const sortedLeads = [...bucketLeads].sort((a, b) => {
        const ta = new Date(a.created_at).getTime() || 0;
        const tb = new Date(b.created_at).getTime() || 0;
        return tb - ta;
      });

      let reason: Reason;
      let recommended: string[];
      if (existingProvider && duplicate) {
        reason = "matched_provider_and_duplicate";
        recommended = sortedLeads.map((l) => l.id);
      } else if (existingProvider) {
        reason = "already_provider";
        recommended = sortedLeads.map((l) => l.id);
      } else if (existingUser) {
        reason = "already_user";
        recommended = sortedLeads.map((l) => l.id);
      } else {
        reason = "internal_duplicate";
        recommended = sortedLeads.slice(1).map((l) => l.id);
      }

      groups.push({
        key: `${keyType}:${key}`,
        key_type: keyType,
        key_display: display,
        reason,
        lead_count: sortedLeads.length,
        leads: sortedLeads,
        existing_provider: existingProvider,
        existing_user: existingUser,
        recommended_delete_ids: recommended,
      });

      for (const l of sortedLeads) seenLeadIds.add(l.id);
    }

    for (const [key, bucket] of emailGroups) {
      const ep = providerIdx.byEmail.get(key) ?? null;
      const eu = !ep ? userIdx.byEmail.get(key) ?? null : null;
      pushGroup("email", key, bucket.display, bucket.leads, ep, eu);
    }

    for (const [key, bucket] of phoneGroups) {
      const ep = providerIdx.byPhone.get(key) ?? null;
      const eu = !ep ? userIdx.byPhone.get(key) ?? null : null;
      const newLeads = bucket.leads.filter((l) => {
        if (!seenLeadIds.has(l.id)) return true;
        const le = normEmail(l.email);
        if (!le) return false;
        return !emailGroups.has(le);
      });
      if (newLeads.length === 0 && !ep && !eu) continue;
      pushGroup("phone", key, bucket.display, bucket.leads, ep, eu);
    }

    groups.sort((a, b) => {
      const score = (g: DuplicateGroup) => {
        let s = 0;
        if (g.reason === "matched_provider_and_duplicate") s += 1000;
        else if (g.reason === "already_provider") s += 800;
        else if (g.reason === "already_user") s += 600;
        else if (g.reason === "internal_duplicate") s += 400;
        s += g.lead_count * 10;
        return s;
      };
      return score(b) - score(a);
    });

    let totalDuplicateLeads = 0;
    const totalLeadIds = new Set<string>();
    for (const g of groups) {
      for (const id of g.recommended_delete_ids) totalLeadIds.add(id);
    }
    totalDuplicateLeads = totalLeadIds.size;

    const body: DuplicatesResponse = {
      total_groups: groups.length,
      total_duplicate_leads: totalDuplicateLeads,
      scanned_leads: leads.length,
      scan_capped: leads.length >= MAX_LEADS_SCAN,
      groups,
    };

    return successResponse(body);
  } catch (error) {
    return handleApiError(error, "Failed to fetch duplicates");
  }
}
