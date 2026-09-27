import { grcEffectivePermissions } from "@beautonomi/admin-access";
import { grcGetHandler } from "@/lib/grc/http";
import { grcFromDbError } from "@/lib/grc/errors";
import { evidenceDueAt, evidenceIsCurrent } from "@/lib/grc/cadence";

type Row = Record<string, unknown>;

async function all<T = Row>(p: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>): Promise<T[]> {
  const { data, error } = await p;
  if (error) throw grcFromDbError(error);
  return (data ?? []) as T[];
}

const none = Promise.resolve([] as Row[]);

/** Everything waiting on the signed-in person, limited to what their GRC roles let them act on. */
export const GET = grcGetHandler("grc.overview.view", async ({ supabase, user, grcRoles }) => {
  const uid = user.id;
  const perms = new Set(grcEffectivePermissions(grcRoles, user.role === "superadmin"));
  const isApprover = grcRoles.includes("management_approver");
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  const [requests, ownedControls, findings, evidenceToReview, reviewItems, docsToApprove, acceptances, mgmtReviews, ackDocs, myAcks, ownedDocs] =
    await Promise.all([
      all(supabase.from("grc_evidence_requests").select("id, title, due_at, control_id, status").eq("assignee_user_id", uid).eq("status", "open").order("due_at").limit(100)),
      all<{ id: string; title: string; frequency: string | null; last_evidence_at: string | null; status: string }>(
        supabase.from("grc_controls").select("id, title, frequency, last_evidence_at, status").eq("owner_user_id", uid).neq("status", "not_applicable"),
      ),
      all(supabase.from("grc_findings").select("id, title, severity, due_at, status").eq("owner_user_id", uid).neq("status", "closed").order("due_at", { ascending: true, nullsFirst: false }).limit(100)),
      perms.has("grc.evidence.review")
        ? all(supabase.from("grc_evidence_current").select("id, title, control_id, submitted_by, created_at").eq("review_status", "pending").neq("submitted_by", uid).order("created_at").limit(100))
        : none,
      perms.has("grc.access_reviews.decide")
        ? all(supabase.from("grc_access_review_items").select("id, review_id, subject_email, platform_role, grc_roles, grc_access_reviews!inner(title, status)").is("decision", null).neq("subject_user_id", uid).eq("grc_access_reviews.status", "open").limit(200))
        : none,
      perms.has("grc.documents.approve")
        ? all(supabase.from("grc_document_versions").select("id, document_id, version_number, author_user_id, created_at, grc_documents!document_id(title)").eq("status", "in_review").neq("author_user_id", uid).limit(100))
        : none,
      isApprover
        ? all(supabase.from("grc_risk_acceptances").select("id, risk_id, risk_manager_id, proposed_at, expires_at, grc_risks(title, residual_score, inherent_score)").eq("status", "pending").neq("risk_manager_id", uid).limit(100))
        : none,
      isApprover
        ? all(supabase.from("grc_management_reviews").select("id, review_date, created_by, status").neq("status", "approved").neq("created_by", uid).limit(20))
        : none,
      all<{ id: string; title: string; current_version_id: string | null }>(
        supabase.from("grc_documents").select("id, title, current_version_id").eq("status", "approved").eq("requires_acknowledgement", true),
      ),
      all<{ document_version_id: string }>(supabase.from("grc_document_acknowledgements").select("document_version_id").eq("user_id", uid)),
      all(supabase.from("grc_documents").select("id, title, next_review_at, status").eq("owner_user_id", uid).lt("next_review_at", today)),
    ]);

  const acked = new Set(myAcks.map((a) => a.document_version_id));
  const staleControls = ownedControls
    .filter((c) => !evidenceIsCurrent(c.frequency, c.last_evidence_at))
    .map((c) => ({ ...c, evidence_due_at: evidenceDueAt(c.frequency, c.last_evidence_at).toISOString() }));

  const sections = {
    evidence_requests: requests,
    controls_needing_evidence: staleControls,
    findings,
    evidence_to_review: evidenceToReview,
    access_review_items: reviewItems,
    documents_to_approve: docsToApprove,
    risk_acceptances_to_decide: acceptances,
    management_reviews_to_sign: mgmtReviews,
    documents_to_acknowledge: ackDocs.filter((d) => d.current_version_id && !acked.has(d.current_version_id)),
    documents_due_for_review: ownedDocs,
  };
  const total = Object.values(sections).reduce((n, s) => n + s.length, 0);
  return { total, overdue_findings: findings.filter((f) => typeof f.due_at === "string" && f.due_at < nowIso).length, ...sections };
});
