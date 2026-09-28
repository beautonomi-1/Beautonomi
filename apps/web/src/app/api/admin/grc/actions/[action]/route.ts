import { NextRequest } from "next/server";
import { z } from "zod";
import type { GrcPermissionKey } from "@beautonomi/admin-access";
import { handleApiError, requireGrcPermission, successResponse } from "@/lib/supabase/api-helpers";
import { writeGrcActivity } from "@/lib/grc/activity";
import { grcBadRequest, grcFromDbError, grcNotFound } from "@/lib/grc/errors";
import type { GrcContext } from "@/lib/grc/http";

/**
 * Workflow transitions. Each maps to a SECURITY DEFINER RPC (which re-checks the permission,
 * enforces segregation of duties and writes the activity log in the same transaction) or to an
 * RLS-guarded write on a draft-only row. The permission listed here is the API gate; the database
 * is the authority.
 */
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const notes = (min: number) => z.string().trim().min(min, `Please write at least ${min} characters`).max(10_000);

type Action<S extends z.ZodType> = {
  permission: GrcPermissionKey;
  schema: S;
  run: (ctx: GrcContext, input: z.infer<S>) => Promise<unknown>;
};
const action = <S extends z.ZodType>(a: Action<S>) => a;

async function rpc(ctx: GrcContext, fn: string, args: Record<string, unknown>) {
  const { data, error } = await ctx.supabase.rpc(fn, args);
  if (error) throw grcFromDbError(error);
  return data;
}

const ACTIONS = {
  "document.create": action({
    permission: "grc.documents.edit",
    schema: z.strictObject({
      slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,80}$/, "Lowercase letters, digits and hyphens only"),
      title: z.string().trim().min(3).max(200),
      doc_type: z.enum(["policy", "standard", "procedure", "plan", "register", "record"]),
      body_markdown: z.string().trim().min(1).max(200_000),
      owner_user_id: z.uuid().nullish(),
      requires_acknowledgement: z.boolean().default(false),
    }),
    run: async (ctx, i) => ({
      id: await rpc(ctx, "grc_create_document", {
        p_slug: i.slug, p_title: i.title, p_doc_type: i.doc_type, p_body: i.body_markdown,
        p_owner_user_id: i.owner_user_id ?? null, p_requires_ack: i.requires_acknowledgement,
      }),
    }),
  }),
  "document.new_version": action({
    permission: "grc.documents.edit",
    schema: z.strictObject({ document_id: z.uuid(), body_markdown: z.string().trim().min(1).max(200_000), change_summary: notes(5) }),
    run: async (ctx, i) => ({
      id: await rpc(ctx, "grc_create_document_version", { p_document_id: i.document_id, p_body: i.body_markdown, p_change_summary: i.change_summary }),
    }),
  }),
  "document.update_draft": action({
    permission: "grc.documents.edit",
    schema: z.strictObject({ version_id: z.uuid(), body_markdown: z.string().trim().min(1).max(200_000), change_summary: z.string().trim().max(2000).optional() }),
    run: async (ctx, i) => {
      const patch: Record<string, unknown> = { body_markdown: i.body_markdown };
      if (i.change_summary !== undefined) patch.change_summary = i.change_summary;
      const { data, error } = await ctx.supabase.from("grc_document_versions").update(patch).eq("id", i.version_id).eq("status", "draft").select("id, document_id").maybeSingle();
      if (error) throw grcFromDbError(error);
      if (!data) throw grcNotFound("Draft not found. Only draft versions can be edited.");
      await writeGrcActivity({ actor_user_id: ctx.user.id, action: "grc.document.draft_edited", entity_type: "grc_document", entity_id: data.document_id, metadata: { version_id: i.version_id } });
      return { id: data.id };
    },
  }),
  "document.submit": action({
    permission: "grc.documents.edit",
    schema: z.strictObject({ version_id: z.uuid() }),
    run: async (ctx, i) => rpc(ctx, "grc_submit_document_version", { p_version_id: i.version_id }),
  }),
  "document.approve": action({
    permission: "grc.documents.approve",
    schema: z.strictObject({ version_id: z.uuid(), next_review_at: date.nullish() }),
    run: async (ctx, i) => rpc(ctx, "grc_approve_document_version", { p_version_id: i.version_id, p_next_review_at: i.next_review_at ?? null }),
  }),
  "document.acknowledge": action({
    permission: "grc.documents.view",
    schema: z.strictObject({ version_id: z.uuid() }),
    run: async (ctx, i) => rpc(ctx, "grc_acknowledge_document", { p_version_id: i.version_id }),
  }),
  "evidence.review": action({
    permission: "grc.evidence.review",
    schema: z.strictObject({ evidence_id: z.uuid(), decision: z.enum(["accepted", "rejected"]), notes: z.string().trim().max(5000).default("") }),
    run: async (ctx, i) => {
      if (i.decision === "rejected" && i.notes.length < 10) throw grcBadRequest("Explain what is wrong so the submitter can fix it (at least 10 characters)");
      return rpc(ctx, "grc_review_evidence", { p_evidence_id: i.evidence_id, p_decision: i.decision, p_notes: i.notes });
    },
  }),
  "risk.propose_acceptance": action({
    permission: "grc.risks.accept",
    schema: z.strictObject({ risk_id: z.uuid(), rationale: notes(20), expires_at: date }),
    run: async (ctx, i) => ({ id: await rpc(ctx, "grc_propose_risk_acceptance", { p_risk_id: i.risk_id, p_rationale: i.rationale, p_expires_at: i.expires_at }) }),
  }),
  "risk.decide_acceptance": action({
    permission: "grc.risks.accept",
    schema: z.strictObject({ acceptance_id: z.uuid(), approve: z.boolean(), notes: notes(10) }),
    run: async (ctx, i) => rpc(ctx, "grc_decide_risk_acceptance", { p_acceptance_id: i.acceptance_id, p_approve: i.approve, p_notes: i.notes }),
  }),
  "risk.link_control": action({
    permission: "grc.risks.edit",
    schema: z.strictObject({ risk_id: z.uuid(), control_id: z.string().min(1).max(40) }),
    run: async (ctx, i) => {
      const { error } = await ctx.supabase.from("grc_risk_controls").insert({ risk_id: i.risk_id, control_id: i.control_id });
      if (error && error.code !== "23505") throw grcFromDbError(error);
      await writeGrcActivity({ actor_user_id: ctx.user.id, action: "grc.risk.control_linked", entity_type: "grc_risk", entity_id: i.risk_id, metadata: { control_id: i.control_id } });
      return { ok: true };
    },
  }),
  "risk.unlink_control": action({
    permission: "grc.risks.edit",
    schema: z.strictObject({ risk_id: z.uuid(), control_id: z.string().min(1).max(40) }),
    run: async (ctx, i) => {
      const { error } = await ctx.supabase.from("grc_risk_controls").delete().eq("risk_id", i.risk_id).eq("control_id", i.control_id);
      if (error) throw grcFromDbError(error);
      await writeGrcActivity({ actor_user_id: ctx.user.id, action: "grc.risk.control_unlinked", entity_type: "grc_risk", entity_id: i.risk_id, metadata: { control_id: i.control_id } });
      return { ok: true };
    },
  }),
  "finding.close": action({
    permission: "grc.findings.close",
    schema: z.strictObject({ finding_id: z.uuid(), closure_notes: notes(10), retest_evidence_id: z.uuid().nullish() }),
    run: async (ctx, i) => rpc(ctx, "grc_close_finding", { p_finding_id: i.finding_id, p_notes: i.closure_notes, p_retest_evidence_id: i.retest_evidence_id ?? null }),
  }),
  "access_review.start": action({
    permission: "grc.access_reviews.decide",
    schema: z.strictObject({ title: z.string().trim().min(3).max(200), period_start: date, period_end: date }),
    run: async (ctx, i) => {
      if (i.period_end < i.period_start) throw grcBadRequest("Period end must be on or after period start");
      return { id: await rpc(ctx, "grc_start_access_review", { p_title: i.title, p_period_start: i.period_start, p_period_end: i.period_end }) };
    },
  }),
  "access_review.decide": action({
    permission: "grc.access_reviews.decide",
    schema: z.strictObject({ item_id: z.uuid(), decision: z.enum(["keep", "modify", "revoke"]), notes: z.string().trim().max(5000).default("") }),
    run: async (ctx, i) => {
      if (i.decision !== "keep" && i.notes.length < 10) throw grcBadRequest("Say what needs to change (at least 10 characters); a follow-up finding is raised from this");
      return rpc(ctx, "grc_decide_access_review_item", { p_item_id: i.item_id, p_decision: i.decision, p_notes: i.notes });
    },
  }),
  "management_review.approve": action({
    permission: "grc.audits.edit",
    schema: z.strictObject({ review_id: z.uuid() }),
    run: async (ctx, i) => rpc(ctx, "grc_approve_management_review", { p_review_id: i.review_id }),
  }),
  "soa.create_draft": action({
    permission: "grc.controls.edit",
    schema: z.strictObject({ label: z.string().trim().min(2).max(100) }),
    run: async (ctx, i) => ({ id: await rpc(ctx, "grc_create_soa_draft", { p_label: i.label }) }),
  }),
  "soa.update_entry": action({
    permission: "grc.controls.edit",
    schema: z.strictObject({
      entry_id: z.uuid(),
      applicable: z.boolean(),
      justification: z.string().trim().max(5000).nullish(),
      control_id: z.string().min(1).max(40).nullish(),
    }),
    run: async (ctx, i) => {
      if (!i.applicable && (i.justification ?? "").length < 10) throw grcBadRequest("Excluded controls need a justification (at least 10 characters)");
      const { data, error } = await ctx.supabase
        .from("grc_soa_entries")
        .update({ applicable: i.applicable, justification: i.justification ?? null, control_id: i.control_id ?? null })
        .eq("id", i.entry_id)
        .select("id, soa_version_id, requirement_id")
        .maybeSingle();
      if (error) throw grcFromDbError(error);
      if (!data) throw grcNotFound("Entry not found, or the SoA version is no longer a draft");
      await writeGrcActivity({
        actor_user_id: ctx.user.id, action: "grc.soa.entry_updated", entity_type: "grc_soa_version", entity_id: data.soa_version_id,
        metadata: { requirement_id: data.requirement_id, applicable: i.applicable, control_id: i.control_id ?? null },
      });
      return { id: data.id };
    },
  }),
  "soa.publish": action({
    permission: "grc.documents.approve",
    schema: z.strictObject({ version_id: z.uuid() }),
    run: async (ctx, i) => rpc(ctx, "grc_publish_soa", { p_version_id: i.version_id }),
  }),
} satisfies Record<string, Action<z.ZodType>>;

export type GrcActionName = keyof typeof ACTIONS;

export async function POST(request: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  try {
    const name = (await ctx.params).action;
    const def = (ACTIONS as Record<string, Action<z.ZodType>>)[name];
    if (!def) throw grcNotFound(`Unknown GRC action "${name}"`);
    const auth = await requireGrcPermission(def.permission, request);
    const parsed = def.schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw grcBadRequest(`${issue?.path?.join(".") || "input"}: ${issue?.message ?? "invalid"}`);
    }
    const result = await def.run(auth, parsed.data);
    return successResponse({ result: result ?? null });
  } catch (error) {
    return handleApiError(error);
  }
}
