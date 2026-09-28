import { grcGetHandler } from "@/lib/grc/http";
import { grcFromDbError } from "@/lib/grc/errors";
import { evidenceIsCurrent } from "@/lib/grc/cadence";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Row = Record<string, unknown>;
const IMPLEMENTED = new Set(["implemented", "operating"]);

async function all<T = Row>(p: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>): Promise<T[]> {
  const { data, error } = await p;
  if (error) throw grcFromDbError(error);
  return (data ?? []) as T[];
}

export const GET = grcGetHandler("grc.overview.view", async ({ supabase }) => {
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  const [controls, frameworks, requirements, mappings, risks, findings, pendingEvidence, overdueRequests, documents, soa, pendingAcceptances] =
    await Promise.all([
      all<{ id: string; status: string; frequency: string | null; last_evidence_at: string | null; owner_user_id: string | null }>(
        supabase.from("grc_controls").select("id, status, frequency, last_evidence_at, owner_user_id"),
      ),
      all<{ id: string; name: string }>(supabase.from("grc_frameworks").select("id, name").order("id")),
      all<{ id: string; framework_id: string }>(supabase.from("grc_requirements").select("id, framework_id")),
      all<{ control_id: string; requirement_id: string }>(supabase.from("grc_control_requirements").select("control_id, requirement_id")),
      all<{ status: string; above_appetite: boolean; residual_score: number | null; review_due_at: string | null }>(
        supabase.from("grc_risks").select("status, above_appetite, residual_score, review_due_at"),
      ),
      all<{ severity: string; status: string; due_at: string | null }>(supabase.from("grc_findings").select("severity, status, due_at").neq("status", "closed")),
      supabase.from("grc_evidence_current").select("id", { count: "exact", head: true }).eq("review_status", "pending"),
      supabase.from("grc_evidence_requests").select("id", { count: "exact", head: true }).eq("status", "open").lt("due_at", nowIso),
      all<{ status: string; next_review_at: string | null }>(supabase.from("grc_documents").select("status, next_review_at")),
      supabase.from("grc_soa_versions").select("id, version_label, status, approved_at").eq("status", "published").maybeSingle(),
      supabase.from("grc_risk_acceptances").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);

  const controlById = new Map(controls.map((c) => [c.id, c]));
  const byStatus: Record<string, number> = {};
  let current = 0;
  for (const c of controls) {
    byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
    if (c.status !== "not_applicable" && evidenceIsCurrent(c.frequency, c.last_evidence_at)) current++;
  }
  const applicable = controls.filter((c) => c.status !== "not_applicable").length;

  const reqControls = new Map<string, string[]>();
  for (const m of mappings) reqControls.set(m.requirement_id, [...(reqControls.get(m.requirement_id) ?? []), m.control_id]);
  const coverage = frameworks.map((f) => {
    const reqs = requirements.filter((r) => r.framework_id === f.id);
    let mapped = 0;
    let implemented = 0;
    let evidenced = 0;
    for (const r of reqs) {
      const cs = (reqControls.get(r.id) ?? []).map((id) => controlById.get(id)).filter((c): c is NonNullable<typeof c> => !!c);
      if (cs.length) mapped++;
      if (cs.some((c) => IMPLEMENTED.has(c.status))) implemented++;
      if (cs.some((c) => IMPLEMENTED.has(c.status) && evidenceIsCurrent(c.frequency, c.last_evidence_at))) evidenced++;
    }
    return { framework_id: f.id, name: f.name, requirements: reqs.length, mapped, implemented, evidenced };
  });

  const openRisks = risks.filter((r) => r.status !== "closed");
  const findingsBySeverity: Record<string, number> = {};
  for (const f of findings) findingsBySeverity[f.severity] = (findingsBySeverity[f.severity] ?? 0) + 1;

  let chain: { ok: boolean; rows_checked: number; first_broken_id: number | null } | null = null;
  const { data: chainRow } = await getSupabaseAdmin().rpc("grc_verify_activity_chain").maybeSingle();
  if (chainRow) {
    const c = chainRow as { rows_checked: number; first_broken_id: number | null };
    chain = { ok: c.first_broken_id === null, rows_checked: Number(c.rows_checked), first_broken_id: c.first_broken_id };
  }

  return {
    controls: {
      total: controls.length,
      applicable,
      by_status: byStatus,
      implemented: controls.filter((c) => IMPLEMENTED.has(c.status)).length,
      evidence_current: current,
      without_owner: controls.filter((c) => c.status !== "not_applicable" && !c.owner_user_id).length,
    },
    coverage,
    risks: {
      open: openRisks.length,
      above_appetite: openRisks.filter((r) => r.above_appetite).length,
      review_overdue: openRisks.filter((r) => r.review_due_at && r.review_due_at < today).length,
      acceptances_pending: pendingAcceptances.count ?? 0,
    },
    findings: {
      open: findings.length,
      by_severity: findingsBySeverity,
      overdue: findings.filter((f) => f.due_at && f.due_at < nowIso).length,
    },
    evidence: { pending_review: pendingEvidence.count ?? 0, overdue_requests: overdueRequests.count ?? 0 },
    documents: {
      total: documents.length,
      approved: documents.filter((d) => d.status === "approved").length,
      review_overdue: documents.filter((d) => d.next_review_at && d.next_review_at < today).length,
    },
    soa: soa.data ?? null,
    activity_chain: chain,
  };
});
