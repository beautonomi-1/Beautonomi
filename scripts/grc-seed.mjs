#!/usr/bin/env node
/**
 * Idempotent GRC catalogue seed (service role). Safe to re-run.
 *
 *   pnpm grc:seed            (builds @beautonomi/grc-catalog, then runs this script)
 *
 * Env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY,
 *      optional GRC_SEED_AUTHOR_EMAIL (admin user recorded as author of imported policy drafts).
 *
 * Catalogue-owned fields are refreshed; anything edited in the hub (controls with updated_by set,
 * vendors, assets, documents) is never overwritten. Control status and owners are never changed.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogDir = join(root, "packages/grc-catalog");
const { getCatalog, LEGACY_REQUIREMENT_ID_PREFIXES, LEGACY_CONTROL_ID_PATTERN } = await import(
  pathToFileURL(join(catalogDir, "dist/index.js")).href
);

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const catalog = getCatalog();
const report = [];

function check(error, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

async function chunked(rows, size, fn) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

async function seedFrameworks() {
  const { error } = await admin.from("grc_frameworks").upsert(catalog.frameworks, { onConflict: "id" });
  check(error, "grc_frameworks");
  await chunked(catalog.requirements, 200, async (rows) => {
    const { error: e } = await admin.from("grc_requirements").upsert(rows, { onConflict: "id" });
    check(e, "grc_requirements");
  });
  report.push(`frameworks: ${catalog.frameworks.length}, requirements: ${catalog.requirements.length}`);
}

async function removeLegacyPlaceholders() {
  const { data: reqs, error } = await admin.from("grc_requirements").select("id");
  check(error, "list requirements");
  const legacyReqs = (reqs ?? []).map((r) => r.id).filter((id) => LEGACY_REQUIREMENT_ID_PREFIXES.some((p) => id.startsWith(p)));
  let removedReqs = 0;
  for (const id of legacyReqs) {
    await admin.from("grc_control_requirements").delete().eq("requirement_id", id);
    const { error: e } = await admin.from("grc_requirements").delete().eq("id", id);
    if (!e) removedReqs++;
  }

  const { data: controls, error: ce } = await admin.from("grc_controls").select("id, updated_by");
  check(ce, "list controls");
  let removedControls = 0;
  const kept = [];
  for (const c of controls ?? []) {
    if (!LEGACY_CONTROL_ID_PATTERN.test(c.id) || c.updated_by) continue;
    const { count } = await admin.from("grc_evidence").select("id", { count: "exact", head: true }).eq("control_id", c.id);
    if ((count ?? 0) > 0) {
      kept.push(c.id);
      continue;
    }
    await admin.from("grc_control_requirements").delete().eq("control_id", c.id);
    await admin.from("grc_risk_controls").delete().eq("control_id", c.id);
    await admin.from("grc_evidence_requests").update({ status: "cancelled" }).eq("control_id", c.id).eq("status", "open");
    const { error: e } = await admin.from("grc_controls").delete().eq("id", c.id);
    if (e) kept.push(c.id);
    else removedControls++;
  }
  if (removedReqs || removedControls || kept.length) {
    report.push(`legacy placeholders removed: ${removedReqs} requirements, ${removedControls} controls` +
      (kept.length ? `; kept (have evidence or references): ${kept.join(", ")}` : ""));
  }
}

async function seedControls() {
  const { data: existing, error } = await admin.from("grc_controls").select("id, updated_by");
  check(error, "list controls");
  const byId = new Map((existing ?? []).map((c) => [c.id, c]));
  let inserted = 0;
  let refreshed = 0;
  let skipped = 0;

  for (const c of catalog.controls) {
    const catalogFields = {
      title: c.title,
      description: c.description,
      auditor_note: c.auditor_note,
      example_evidence: c.example_evidence,
      collector_key: c.collector_key,
      frequency: c.frequency,
      implementation_notes: c.implementation_notes || null,
    };
    const current = byId.get(c.id);
    if (!current) {
      const { error: e } = await admin.from("grc_controls").insert({ id: c.id, owner_team: c.owner_team, status: c.status, ...catalogFields });
      check(e, `insert control ${c.id}`);
      inserted++;
    } else if (!current.updated_by) {
      const { error: e } = await admin.from("grc_controls").update(catalogFields).eq("id", c.id);
      check(e, `refresh control ${c.id}`);
      refreshed++;
    } else {
      skipped++;
    }
    const links = c.requirement_ids.map((requirement_id) => ({ control_id: c.id, requirement_id }));
    const { error: le } = await admin
      .from("grc_control_requirements")
      .upsert(links, { onConflict: "control_id,requirement_id", ignoreDuplicates: true });
    check(le, `control mappings ${c.id}`);
  }
  report.push(`controls: ${inserted} inserted, ${refreshed} refreshed, ${skipped} left as edited in the hub`);
}

async function insertMissing(table, rows, label) {
  const { error } = await admin.from(table).upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  check(error, table);
  report.push(`${label}: ${rows.length} ensured (existing rows untouched)`);
}

async function seedProcessingActivities() {
  const { count, error } = await admin.from("grc_processing_activities").select("id", { count: "exact", head: true });
  check(error, "count processing activities");
  if ((count ?? 0) > 0) {
    report.push("processing activities: register already populated, skipped");
    return;
  }
  const { error: e } = await admin.from("grc_processing_activities").insert(catalog.processingActivities);
  check(e, "grc_processing_activities");
  report.push(`processing activities: ${catalog.processingActivities.length} starter entries`);
}

async function resolveAuthor() {
  const email = process.env.GRC_SEED_AUTHOR_EMAIL;
  if (email) {
    const { data } = await admin.from("users").select("id, email").eq("email", email).maybeSingle();
    if (!data) throw new Error(`GRC_SEED_AUTHOR_EMAIL ${email} not found in public.users`);
    return data;
  }
  const { data: grcAdmin } = await admin
    .from("grc_role_assignments")
    .select("user_id")
    .eq("grc_role", "grc_admin")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (grcAdmin?.user_id) {
    const { data } = await admin.from("users").select("id, email").eq("id", grcAdmin.user_id).maybeSingle();
    if (data) return data;
  }
  const { data: superadmin } = await admin.from("users").select("id, email").eq("role", "superadmin").limit(1).maybeSingle();
  return superadmin ?? null;
}

async function seedDocuments() {
  const author = await resolveAuthor();
  if (!author) {
    report.push("documents: skipped (no admin user to record as author; set GRC_SEED_AUTHOR_EMAIL)");
    return;
  }
  let created = 0;
  for (const d of catalog.documents) {
    const { data: doc } = await admin.from("grc_documents").select("id").eq("slug", d.slug).maybeSingle();
    if (doc) continue;
    const body = readFileSync(join(catalogDir, "policies", d.file), "utf8");
    const { data: inserted, error } = await admin
      .from("grc_documents")
      .insert({
        slug: d.slug,
        title: d.title,
        doc_type: d.doc_type,
        status: "draft",
        owner_user_id: author.id,
        created_by: author.id,
        requires_acknowledgement: d.requires_acknowledgement,
      })
      .select("id")
      .single();
    check(error, `document ${d.slug}`);
    const { error: ve } = await admin.from("grc_document_versions").insert({
      document_id: inserted.id,
      version_number: 1,
      body_markdown: body,
      author_user_id: author.id,
      status: "draft",
      change_summary: "Template imported from the GRC catalogue — tailor before approval",
    });
    check(ve, `document version ${d.slug}`);
    created++;
  }
  report.push(`documents: ${created} draft templates created (author ${author.email}; someone else must approve)`);
}

async function main() {
  await seedFrameworks();
  await removeLegacyPlaceholders();
  await seedControls();
  await insertMissing("grc_vendors", catalog.vendors, "vendors");
  await insertMissing("grc_assets", catalog.assets, "assets");
  await seedProcessingActivities();
  await seedDocuments();
  console.log("GRC catalogue seed complete:\n  " + report.join("\n  "));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
