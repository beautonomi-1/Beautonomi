import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGrcModule, type GrcModuleKey } from "@beautonomi/admin-access";
import { handleApiError, requireGrcPermission, successResponse } from "@/lib/supabase/api-helpers";
import { writeGrcActivity } from "@/lib/grc/activity";
import { grcForbidden, grcFromDbError, grcNotFound } from "@/lib/grc/errors";
import { parseGrcRecord } from "@/lib/grc/records";

type Ctx = { params: Promise<{ module: string; id: string }> };

async function rows(p: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>) {
  const { data, error } = await p;
  if (error) throw grcFromDbError(error);
  return (data ?? []) as Record<string, unknown>[];
}

/** Related records shown on a record's detail page. All reads go through the caller's RLS. */
async function loadRelated(key: GrcModuleKey, id: string, db: SupabaseClient): Promise<Record<string, unknown>> {
  switch (key) {
    case "controls": {
      const [requirements, evidence, requests, risks] = await Promise.all([
        rows(db.from("grc_control_requirements").select("requirement_id, grc_requirements(framework_id, ref_code, title)").eq("control_id", id)),
        rows(db.from("grc_evidence_current").select("id, title, source, status, review_status, content_sha256, file_name, submitted_by, created_at, period_start, period_end, last_reviewer_id, last_reviewed_at, last_review_notes").eq("control_id", id).order("created_at", { ascending: false }).limit(50)),
        rows(db.from("grc_evidence_requests").select("id, title, status, due_at, assignee_user_id").eq("control_id", id).order("due_at", { ascending: false }).limit(20)),
        rows(db.from("grc_risk_controls").select("risk_id, grc_risks(title, residual_score, inherent_score, status)").eq("control_id", id)),
      ]);
      return { requirements, evidence, requests, risks };
    }
    case "documents": {
      const versions = await rows(
        db.from("grc_document_versions")
          .select("id, version_number, status, author_user_id, approved_by, approved_at, change_summary, body_markdown, created_at")
          .eq("document_id", id)
          .order("version_number", { ascending: false }),
      );
      const versionIds = versions.map((v) => v.id as string);
      const acks = versionIds.length
        ? await rows(db.from("grc_document_acknowledgements").select("document_version_id, user_id, acknowledged_at").in("document_version_id", versionIds))
        : [];
      return { versions, acknowledgements: acks };
    }
    case "risks": {
      const [acceptances, controls] = await Promise.all([
        rows(db.from("grc_risk_acceptances").select("*").eq("risk_id", id).order("proposed_at", { ascending: false })),
        rows(db.from("grc_risk_controls").select("control_id, grc_controls(title, status)").eq("risk_id", id)),
      ]);
      return { acceptances, controls };
    }
    case "access_reviews":
      return {
        items: await rows(
          db.from("grc_access_review_items")
            .select("id, subject_user_id, subject_email, platform_role, grc_roles, subject_last_login_at, reviewer_user_id, decision, decided_at, notes, follow_up_finding_id")
            .eq("review_id", id)
            .order("subject_email", { ascending: true }),
        ),
      };
    case "findings":
      return { corrective_actions: await rows(db.from("grc_corrective_actions").select("*").eq("finding_id", id)) };
    default:
      return {};
  }
}

function loadModule(key: string) {
  const mod = getGrcModule(key);
  if (!mod) throw grcNotFound(`Unknown GRC module "${key}"`);
  return mod;
}

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const { module, id } = await ctx.params;
    const mod = loadModule(module);
    const { supabase } = await requireGrcPermission(mod.viewPermission, request);
    const { data, error } = await supabase.from(mod.table).select("*").eq(mod.idColumn, id).maybeSingle();
    if (error) throw grcFromDbError(error);
    if (!data) throw grcNotFound(`${mod.singular} not found`);
    return successResponse({ item: data, related: await loadRelated(mod.key, id, supabase) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const { module, id } = await ctx.params;
    const mod = loadModule(module);
    if (!mod.editPermission) throw grcForbidden(`${mod.title} are changed through their workflow, not edited directly`);
    const { user, supabase } = await requireGrcPermission(mod.editPermission, request);
    const values = parseGrcRecord(mod, "update", await request.json().catch(() => null));

    const { data, error } = await supabase.from(mod.table).update(values).eq(mod.idColumn, id).select("*").maybeSingle();
    if (error) throw grcFromDbError(error);
    if (!data) throw grcNotFound(`${mod.singular} not found, or it is locked for editing`);

    await writeGrcActivity({
      actor_user_id: user.id,
      action: `grc.${mod.key}.updated`,
      entity_type: mod.table,
      entity_id: id,
      metadata: { fields: Object.keys(values) },
    });
    return successResponse({ item: data });
  } catch (error) {
    return handleApiError(error);
  }
}
