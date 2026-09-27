import { grcGetHandler } from "@/lib/grc/http";
import { grcFromDbError } from "@/lib/grc/errors";

/** First-run checklist, derived from real data so it can't drift from reality. */
export const GET = grcGetHandler("grc.settings.manage", async ({ supabase }) => {
  const count = async (table: string, filter?: (q: any) => any) => {
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (filter) q = filter(q);
    const { count: n, error } = await q;
    if (error) throw grcFromDbError(error);
    return n ?? 0;
  };

  const [controls, frameworks, assignments, adminGrc, approvers, owned, docsApproved, soaPublished, vendors, risks] = await Promise.all([
    count("grc_controls"),
    count("grc_frameworks"),
    count("grc_role_assignments", (q) => q.eq("is_active", true)),
    count("grc_role_assignments", (q) => q.eq("is_active", true).eq("grc_role", "grc_admin")),
    count("grc_role_assignments", (q) => q.eq("is_active", true).eq("grc_role", "management_approver")),
    count("grc_controls", (q) => q.not("owner_user_id", "is", null)),
    count("grc_documents", (q) => q.eq("status", "approved")),
    count("grc_soa_versions", (q) => q.eq("status", "published")),
    count("grc_vendors"),
    count("grc_risks"),
  ]);

  const steps = [
    { id: "seed", label: "Load the control catalogue (pnpm grc:seed)", done: controls > 0 && frameworks > 0, detail: `${controls} controls, ${frameworks} frameworks` },
    { id: "admin", label: "Grant GRC admin to someone other than yourself", done: adminGrc > 0 },
    { id: "approver", label: "Name at least one management approver", done: approvers > 0 },
    { id: "roles", label: "Assign owners' GRC roles", done: assignments >= 3, detail: `${assignments} active assignments` },
    { id: "owners", label: "Give every control an owner", done: controls > 0 && owned === controls, detail: `${owned}/${controls} owned` },
    { id: "policies", label: "Approve core policies", done: docsApproved > 0, detail: `${docsApproved} approved` },
    { id: "soa", label: "Publish the Statement of Applicability", done: soaPublished > 0 },
    { id: "vendors", label: "Review the vendor register", done: vendors > 0 },
    { id: "risks", label: "Record your first risks", done: risks > 0 },
  ];
  return { steps, complete: steps.every((s) => s.done) };
});
