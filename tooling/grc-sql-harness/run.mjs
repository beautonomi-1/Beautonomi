/**
 * GRC database harness: applies migrations 949+ on PGlite (Postgres compiled to WASM) with stubbed
 * Supabase auth/storage schemas, then exercises RBAC, MFA gating, segregation of duties, workflow RPCs,
 * immutability and activity-log tamper detection as real Postgres roles under RLS.
 *
 *   pnpm --filter @beautonomi/grc-sql-harness test
 */
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getCatalog } from "@beautonomi/grc-catalog";
import { GRC_MODULES } from "@beautonomi/admin-access";

const MIG = join(dirname(fileURLToPath(import.meta.url)), "../../supabase/migrations");
const db = new PGlite({ extensions: { pgcrypto } });

const STUB = `
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA public, auth, storage, extensions TO anon, authenticated, service_role;
CREATE TABLE auth.users (id uuid primary key);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'sub','')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'role' $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
CREATE TYPE user_role AS ENUM ('customer','provider_owner','superadmin','support_agent','admin_support','admin_finance','admin_trust','admin_content','admin_ecommerce','admin_marketing','admin_integrations','admin_operations','admin_platform_config','admin_sales','admin_onboarding','admin_retention');
CREATE TYPE notification_type AS ENUM ('system');
CREATE TABLE public.users (id uuid primary key, email text not null unique, full_name text, role user_role not null default 'customer', last_login_at timestamptz);
CREATE TABLE public.feature_flags (id uuid primary key default gen_random_uuid(), feature_key text not null, feature_name text not null, description text, enabled boolean not null default false, category text, metadata jsonb default '{}', tenant_id uuid, created_at timestamptz default now(), updated_at timestamptz default now());
CREATE UNIQUE INDEX ff_key_global ON public.feature_flags (feature_key) WHERE tenant_id IS NULL;
`;

let pass = 0, fail = 0;
const ok = (name) => { pass++; console.log("  PASS", name); };
const bad = (name, e) => { fail++; console.log("  FAIL", name, e?.message ?? e ?? ""); };

async function as(uid, aal, fn) {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claims', '${JSON.stringify({ sub: uid ?? "", aal, role: uid ? "authenticated" : "service_role" })}', false);`);
  await db.exec(uid ? "SET ROLE authenticated" : "SET ROLE service_role");
  try { return await fn(); } finally { await db.exec("RESET ROLE"); }
}
async function expectOk(name, fn) { try { const r = await fn(); ok(name); return r; } catch (e) { bad(name, e); } }
async function expectErr(name, pattern, fn) {
  try { await fn(); bad(name, "expected error " + pattern); }
  catch (e) { if (new RegExp(pattern, "i").test(e.message)) ok(name + "  [" + e.message.slice(0, 90) + "]"); else bad(name, e); }
}
const q = (sql, p) => db.query(sql, p);
const one = async (sql, p) => (await db.query(sql, p)).rows[0];

await db.exec(STUB);
const files = readdirSync(MIG).filter((f) => /^9(49|5\d)_/.test(f)).sort();
for (const f of files) {
  try { await db.exec(readFileSync(join(MIG, f), "utf8")); console.log("applied", f); }
  catch (e) { console.log("MIGRATION FAILED", f, e.message); process.exit(1); }
}
// Re-apply 959 to prove idempotency
try { await db.exec(readFileSync(join(MIG, "959_grc_hardening_workflows.sql"), "utf8")); ok("959 re-applies cleanly (idempotent)"); } catch (e) { bad("959 idempotent", e); }

const U = {
  S: "00000000-0000-0000-0000-00000000000a", A: "00000000-0000-0000-0000-00000000000b",
  B: "00000000-0000-0000-0000-00000000000c", C: "00000000-0000-0000-0000-00000000000d",
  D: "00000000-0000-0000-0000-00000000000e", X: "00000000-0000-0000-0000-00000000000f",
};
await q(`INSERT INTO public.users (id,email,role) VALUES
 ('${U.S}','s@x','superadmin'),('${U.A}','a@x','admin_grc'),('${U.B}','b@x','admin_trust'),
 ('${U.C}','c@x','admin_operations'),('${U.D}','d@x','admin_platform_config'),('${U.X}','x@x','customer')`);

console.log("\n== RBAC / assignments");
await expectErr("superadmin cannot self-grant", "yourself", () => as(U.S, "aal2", () => q(`INSERT INTO grc_role_assignments (user_id,grc_role,reason) VALUES ($1,'grc_admin','bootstrap self')`, [U.S])));
await expectOk("superadmin grants grc_admin to A", () => as(U.S, "aal2", () => q(`INSERT INTO grc_role_assignments (user_id,grc_role,reason,assigned_by) VALUES ($1,'grc_admin','ISMS manager appointment',$2)`, [U.A, U.X])));
const asg = await one(`SELECT assigned_by FROM grc_role_assignments WHERE user_id=$1`, [U.A]);
asg.assigned_by === U.S ? ok("assigned_by forced to caller (spoof ignored)") : bad("assigned_by spoof", asg);
await expectErr("superadmin on aal1 cannot grant", "row-level security|violates", () => as(U.S, "aal1", () => q(`INSERT INTO grc_role_assignments (user_id,grc_role,reason) VALUES ($1,'viewer','read access pls')`, [U.B])));
await expectErr("cannot grant to non-admin customer", "admin portal role", () => as(U.A, "aal2", () => q(`INSERT INTO grc_role_assignments (user_id,grc_role,reason) VALUES ($1,'viewer','customer read')`, [U.X])));
for (const [u, r] of [[U.B, "risk_manager"], [U.C, "management_approver"], [U.D, "security_lead"], [U.D, "contributor"]]) {
  await expectOk(`A grants ${r}`, () => as(U.A, "aal2", () => q(`INSERT INTO grc_role_assignments (user_id,grc_role,reason) VALUES ($1,$2,'role appointment')`, [u, r])));
}
await expectErr("assignments cannot be deleted", "cannot be deleted|row-level|0 rows", async () => {
  const r = await as(U.A, "aal2", () => q(`DELETE FROM grc_role_assignments WHERE user_id=$1 RETURNING id`, [U.B]));
  if (r.rows.length === 0) throw new Error("0 rows (no delete policy)");
});
const perm = async (u, aal, k) => (await as(u, aal, () => one(`SELECT grc_has_permission($1,$2) AS p`, [u, k]))).p;
(await perm(U.A, "aal1", "grc.overview.view")) === false ? ok("aal1 session has no GRC permission") : bad("aal1 bypass");
(await perm(U.S, "aal2", "grc.documents.approve")) === false ? ok("superadmin cannot approve") : bad("superadmin approve");
(await perm(U.S, "aal2", "grc.risks.view")) === true ? ok("superadmin can view") : bad("superadmin view");
(await perm(U.X, "aal2", "grc.overview.view")) === false ? ok("customer has nothing") : bad("customer");

console.log("\n== Documents");
const doc = await expectOk("A creates document", () => as(U.A, "aal2", () => one(`SELECT grc_create_document('info-sec-policy','Information Security Policy','policy','# Policy body', NULL, true) AS id`)));
const ver = await one(`SELECT id FROM grc_document_versions WHERE document_id=$1`, [doc.id]);
await expectErr("author cannot approve own version", "author", () => as(U.A, "aal2", () => q(`SELECT grc_approve_document_version($1)`, [ver.id])));
await expectErr("superadmin cannot approve", "FORBIDDEN", () => as(U.S, "aal2", () => q(`SELECT grc_approve_document_version($1)`, [ver.id])));
const upd = await as(U.A, "aal2", () => q(`UPDATE grc_document_versions SET status='approved', approved_by=$2 WHERE id=$1 RETURNING id`, [ver.id, U.C])).catch((e) => ({ rows: [], err: e }));
upd.rows.length === 0 ? ok("direct approve via UPDATE blocked") : bad("direct approve worked");
await expectErr("direct document status approve blocked", "approval workflow|row-level", () => as(U.A, "aal2", () => q(`UPDATE grc_documents SET status='approved' WHERE id=$1`, [doc.id])));
await expectOk("C (management approver) approves", () => as(U.C, "aal2", () => q(`SELECT grc_approve_document_version($1)`, [ver.id])));
const d2 = await one(`SELECT status, current_version_id, next_review_at FROM grc_documents WHERE id=$1`, [doc.id]);
d2.status === "approved" && d2.current_version_id === ver.id && d2.next_review_at ? ok("document approved, current version + review date set") : bad("doc state", d2);
await expectErr("approved version body immutable", "immutable|0 rows", async () => {
  const r = await as(U.A, "aal2", () => q(`UPDATE grc_document_versions SET body_markdown='x' WHERE id=$1 RETURNING id`, [ver.id]));
  if (!r.rows.length) throw new Error("0 rows");
});
await expectOk("new version draft", () => as(U.A, "aal2", () => q(`SELECT grc_create_document_version($1,'# v2','Annual review')`, [doc.id])));
await expectErr("only one open draft", "open draft", () => as(U.A, "aal2", () => q(`SELECT grc_create_document_version($1,'# v3','again')`, [doc.id])));
await expectOk("acknowledge approved version", () => as(U.D, "aal2", () => q(`SELECT grc_acknowledge_document($1)`, [ver.id])));

console.log("\n== Controls + evidence");
await q(`INSERT INTO grc_frameworks (id,name) VALUES ('iso27001','ISO/IEC 27001:2022')`);
await q(`INSERT INTO grc_requirements (id,framework_id,ref_code,title,category) VALUES ('iso27001:A.5.15','iso27001','A.5.15','Access control','annex_a'),('iso27001:A.7.4','iso27001','A.7.4','Physical security monitoring','annex_a')`);
await q(`INSERT INTO grc_controls (id,title,status) VALUES ('AC-01','Admin MFA','operating')`);
await q(`INSERT INTO grc_control_requirements VALUES ('AC-01','iso27001:A.5.15')`);
await q(`INSERT INTO grc_evidence_requests (control_id,title,due_at,status) VALUES ('AC-01','Q3 MFA report', now()+interval '7 days','open')`);
const sha = "a".repeat(64);
await expectErr("evidence spoofed submitter rejected", "row-level", () => as(U.D, "aal2", () => q(`INSERT INTO grc_evidence (control_id,content_sha256,submitted_by,storage_path) VALUES ('AC-01',$1,$2,'evidence/AC-01/x')`, [sha, U.A])));
const ev = await expectOk("D submits evidence", () => as(U.D, "aal2", () => one(`INSERT INTO grc_evidence (control_id,content_sha256,submitted_by,storage_path) VALUES ('AC-01',$1,$2,$3) RETURNING id`, [sha, U.D, `evidence/AC-01/${sha}`])));
(await one(`SELECT status FROM grc_evidence_requests WHERE control_id='AC-01'`)).status === "submitted" ? ok("open request auto-closed") : bad("request not closed");
await expectErr("submitter cannot review own", "submitted", () => as(U.D, "aal2", () => q(`SELECT grc_review_evidence($1,'accepted',NULL)`, [ev.id])));
await expectErr("rejection needs notes", "explain", () => as(U.A, "aal2", () => q(`SELECT grc_review_evidence($1,'rejected','')`, [ev.id])));
await expectOk("A rejects with notes", () => as(U.A, "aal2", () => q(`SELECT grc_review_evidence($1,'rejected','Report is missing the date range')`, [ev.id])));
(await one(`SELECT count(*)::int n FROM grc_evidence_requests WHERE control_id='AC-01' AND status='open' AND assignee_user_id=$1`, [U.D])).n === 1 ? ok("resubmission request raised for submitter") : bad("no resubmit request");
const cur = await as(U.A, "aal2", () => one(`SELECT review_status FROM grc_evidence_current WHERE id=$1`, [ev.id]));
cur.review_status === "rejected" ? ok("grc_evidence_current shows latest review") : bad("view", cur);
await expectErr("evidence rows immutable", "insert-only|append", () => q(`UPDATE grc_evidence SET status='x' WHERE id=$1`, [ev.id]));

console.log("\n== Risks");
const risk = await expectOk("A creates 5x5 risk", () => as(U.A, "aal2", () => one(`INSERT INTO grc_risks (title,likelihood,impact) VALUES ('Admin account takeover',5,5) RETURNING id, above_appetite`)));
risk.above_appetite === true ? ok("above_appetite computed from score vs appetite") : bad("appetite", risk);
await expectErr("cannot set accepted directly", "acceptance workflow", () => as(U.A, "aal2", () => q(`UPDATE grc_risks SET status='accepted' WHERE id=$1`, [risk.id])));
await expectErr("grc_admin (not risk_manager) cannot propose", "risk manager", () => as(U.A, "aal2", () => q(`SELECT grc_propose_risk_acceptance($1,'Accepting because compensating controls exist',(current_date+60))`, [risk.id])));
const acc = await expectOk("B proposes acceptance", () => as(U.B, "aal2", () => one(`SELECT grc_propose_risk_acceptance($1,'Accepting because compensating controls exist',(current_date+60)) AS id`, [risk.id])));
await expectErr("B cannot decide (not mgmt approver)", "management approver", () => as(U.B, "aal2", () => q(`SELECT grc_decide_risk_acceptance($1,true,'ok')`, [acc.id])));
await expectOk("C approves acceptance", () => as(U.C, "aal2", () => q(`SELECT grc_decide_risk_acceptance($1,true,'Approved for 60 days')`, [acc.id])));
(await one(`SELECT status FROM grc_risks WHERE id=$1`, [risk.id])).status === "accepted" ? ok("risk accepted after dual approval") : bad("risk status");
await expectErr("risks cannot be deleted", "cannot be deleted|0 rows", async () => { const r = await as(U.A, "aal2", () => q(`DELETE FROM grc_risks WHERE id=$1 RETURNING id`, [risk.id])); if (!r.rows.length) throw new Error("0 rows"); });

console.log("\n== Findings");
const f = await expectOk("A raises high finding", () => as(U.A, "aal2", () => one(`INSERT INTO grc_findings (title,severity,source) VALUES ('Pentest: IDOR on bookings','high','pentest') RETURNING id, due_at`)));
f.due_at ? ok("SLA due date defaulted") : bad("due_at");
await expectErr("cannot close via UPDATE", "close workflow", () => as(U.A, "aal2", () => q(`UPDATE grc_findings SET status='closed' WHERE id=$1`, [f.id])));
await expectErr("high needs retest evidence", "retest", () => as(U.A, "aal2", () => q(`SELECT grc_close_finding($1,'Fixed authz check in route',NULL)`, [f.id])));
await expectOk("close with retest evidence", () => as(U.A, "aal2", () => q(`SELECT grc_close_finding($1,'Fixed authz check in route',$2)`, [f.id, ev.id])));
await expectErr("closed finding locked", "locked", () => as(U.A, "aal2", () => q(`UPDATE grc_findings SET title='x' WHERE id=$1`, [f.id])));

console.log("\n== Access review");
const ar = await expectOk("A starts review", () => as(U.A, "aal2", () => one(`SELECT grc_start_access_review('Q3 2026 admin access', '2026-07-01', '2026-09-30') AS id`)));
const items = (await q(`SELECT id, subject_user_id FROM grc_access_review_items WHERE review_id=$1`, [ar.id])).rows;
items.length === 5 ? ok("5 admin users populated (customer excluded)") : bad("item count", items.length);
const mine = items.find((i) => i.subject_user_id === U.A), bItem = items.find((i) => i.subject_user_id === U.B);
await expectErr("cannot decide own access", "own access", () => as(U.A, "aal2", () => q(`SELECT grc_decide_access_review_item($1,'keep',NULL)`, [mine.id])));
await expectOk("revoke with notes creates finding", () => as(U.A, "aal2", () => q(`SELECT grc_decide_access_review_item($1,'revoke','No longer in trust team')`, [bItem.id])));
(await one(`SELECT follow_up_finding_id FROM grc_access_review_items WHERE id=$1`, [bItem.id])).follow_up_finding_id ? ok("follow-up finding linked") : bad("no finding");

console.log("\n== Management review + SoA");
const mr = await expectOk("A records minutes", () => as(U.A, "aal2", () => one(`INSERT INTO grc_management_reviews (review_date, minutes_markdown) VALUES (current_date, repeat('Inputs covered: audits, risks, objectives. ', 3)) RETURNING id`)));
await expectErr("A cannot sign off", "management approver", () => as(U.A, "aal2", () => q(`SELECT grc_approve_management_review($1)`, [mr.id])));
await expectOk("C signs off", () => as(U.C, "aal2", () => q(`SELECT grc_approve_management_review($1)`, [mr.id])));
const soa = await expectOk("A creates SoA draft", () => as(U.A, "aal2", () => one(`SELECT grc_create_soa_draft('SoA v1') AS id`)));
await expectErr("publish blocked while entries incomplete", "need a control", () => as(U.C, "aal2", () => q(`SELECT grc_publish_soa($1)`, [soa.id])));
await expectOk("A excludes A.7.4 with justification", () => as(U.A, "aal2", () => q(`UPDATE grc_soa_entries SET applicable=false, justification='No company-operated premises; cloud-hosted only' WHERE soa_version_id=$1 AND requirement_id='iso27001:A.7.4'`, [soa.id])));
await expectErr("preparer cannot publish", "prepared", () => as(U.A, "aal2", () => q(`SELECT grc_publish_soa($1)`, [soa.id])));
await expectOk("C publishes", () => as(U.C, "aal2", () => q(`SELECT grc_publish_soa($1)`, [soa.id])));

console.log("\n== Real catalogue + full Statement of Applicability");
const cat = getCatalog();
await expectOk("load catalogue (frameworks, requirements, controls, mappings)", async () => {
  for (const f of cat.frameworks) {
    await q(`INSERT INTO grc_frameworks (id,name,version,description) VALUES ($1,$2,$3,$4)
             ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, version=EXCLUDED.version, description=EXCLUDED.description`,
      [f.id, f.name, f.version, f.description]);
  }
  for (const r of cat.requirements) {
    await q(`INSERT INTO grc_requirements (id,framework_id,ref_code,title,description,category,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description, category=EXCLUDED.category, sort_order=EXCLUDED.sort_order`,
      [r.id, r.framework_id, r.ref_code, r.title, r.description, r.category, r.sort_order]);
  }
  for (const c of cat.controls) {
    await q(`INSERT INTO grc_controls (id,title,description,owner_team,status,collector_key,auditor_note,example_evidence,frequency,implementation_notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
      [c.id, c.title, c.description, c.owner_team, c.status, c.collector_key, c.auditor_note, c.example_evidence, c.frequency, c.implementation_notes || null]);
    for (const r of c.requirement_ids) {
      await q(`INSERT INTO grc_control_requirements VALUES ($1,$2) ON CONFLICT DO NOTHING`, [c.id, r]);
    }
  }
  for (const v of cat.vendors) {
    await q(`INSERT INTO grc_vendors (id,name,service_type,data_processed,criticality,website) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [v.id, v.name, v.service_type, v.data_processed, v.criticality, v.website]);
  }
  for (const a of cat.assets) {
    await q(`INSERT INTO grc_assets (id,name,asset_type,description,owner_team,criticality,data_classification) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [a.id, a.name, a.asset_type, a.description, a.owner_team, a.criticality, a.data_classification]);
  }
});
const soa2 = await expectOk("A drafts SoA v2 from catalogue", () => as(U.A, "aal2", () => one(`SELECT grc_create_soa_draft('SoA v2') AS id`)));
const soaStats = await one(`SELECT count(*)::int n, count(*) FILTER (WHERE applicable AND control_id IS NULL)::int unmapped,
  count(*) FILTER (WHERE NOT applicable)::int excluded FROM grc_soa_entries WHERE soa_version_id=$1`, [soa2.id]);
soaStats.n === 93 ? ok("SoA v2 has all 93 Annex A entries") : bad("SoA entry count", soaStats);
soaStats.unmapped === 0 ? ok("every applicable Annex A entry pre-filled with a mapped control") : bad("unmapped entries", soaStats);
soaStats.excluded === 1 ? ok("exclusion + justification carried over from the published SoA") : bad("carry-over", soaStats);
await expectOk("C publishes SoA v2", () => as(U.C, "aal2", () => q(`SELECT grc_publish_soa($1)`, [soa2.id])));
(await one(`SELECT count(*)::int n FROM grc_soa_versions WHERE status='published'`)).n === 1 ? ok("previous SoA superseded") : bad("multiple published SoAs");

console.log("\n== Activity log");
const chain = await one(`SELECT * FROM grc_verify_activity_chain()`);
chain.first_broken_id === null && Number(chain.rows_checked) > 10 ? ok(`chain verifies (${chain.rows_checked} rows)`) : bad("chain", chain);
await expectErr("activity log append-only (even service role)", "append-only", () => as(null, null, () => q(`UPDATE grc_activity_log SET action='x' WHERE id=1`)));
await expectErr("authenticated cannot insert activity", "row-level", () => as(U.A, "aal2", () => q(`INSERT INTO grc_activity_log (action) VALUES ('forged')`)));
await expectErr("authenticated cannot call chain verifier", "permission denied", () => as(U.A, "aal2", () => q(`SELECT * FROM grc_verify_activity_chain()`)));
await db.exec(`ALTER TABLE grc_activity_log DISABLE TRIGGER grc_activity_log_no_update; UPDATE grc_activity_log SET metadata='{"tampered":true}' WHERE id=3; ALTER TABLE grc_activity_log ENABLE TRIGGER grc_activity_log_no_update;`);
const tampered = await one(`SELECT * FROM grc_verify_activity_chain()`);
Number(tampered.first_broken_id) === 3 ? ok("tampering with metadata detected at row 3") : bad("tamper not detected", tampered);

console.log("\n== Automation (service role)");
const csha = "c".repeat(64);
await expectOk("collector evidence insert (no submitter)", () => as(null, null, () => q(`INSERT INTO grc_evidence (control_id,content_sha256,status,source,storage_path,title) VALUES ('AC-01',$1,'submitted','collector',$2,'MFA coverage')`, [csha, `evidence/collector_admin-mfa-coverage/${csha}`])));
const lastEv = await one(`SELECT last_evidence_at FROM grc_controls WHERE id='AC-01'`);
lastEv.last_evidence_at ? ok("collector evidence stamps control last_evidence_at") : bad("last_evidence_at not set");
await expectErr("users cannot forge collector evidence", "row-level", () => as(U.D, "aal2", () => q(`INSERT INTO grc_evidence (control_id,content_sha256,status,source,submitted_by,storage_path) VALUES ('AC-01',$1,'submitted','collector',$2,$3)`, [csha, U.D, `evidence/AC-01/${csha}`])));
const dep = await expectOk("service role upserts dependabot finding", () => as(null, null, () => one(`INSERT INTO grc_findings (title,severity,source,external_ref) VALUES ('lodash: prototype pollution','high','dependabot','dependabot:42') RETURNING id`)));
await expectOk("service role closes fixed dependabot finding", () => as(null, null, () => q(`UPDATE grc_findings SET status='closed', closed_at=now(), closure_notes='GitHub reports fixed' WHERE id=$1`, [dep.id])));
await expectErr("dependabot ref is unique per source", "duplicate|unique", () => as(null, null, () => q(`INSERT INTO grc_findings (title,severity,source,external_ref) VALUES ('dup','low','dependabot','dependabot:42')`)));
await q(`INSERT INTO storage.objects (bucket_id,name) VALUES ('grc-evidence','evidence/AC-01/x'),('grc-evidence','audit-packs/p1/pack.zip')`);
const visible = await as(U.D, "aal2", () => q(`SELECT name FROM storage.objects WHERE bucket_id='grc-evidence' ORDER BY name`));
visible.rows.length === 1 && visible.rows[0].name.startsWith("evidence/") ? ok("audit-pack zips not readable directly from storage") : bad("storage select scope", visible.rows);
const exp = await one(`SELECT id FROM grc_role_assignments WHERE user_id=$1 AND grc_role='contributor' AND is_active`, [U.D]);
await expectOk("scheduler expires assignment", () => as(null, null, () => q(`UPDATE grc_role_assignments SET is_active=false, revoke_reason='Expired automatically' WHERE id=$1`, [exp.id])));
(await one(`SELECT count(*)::int n FROM grc_activity_log WHERE action='grc.assignment.revoked' AND entity_id=$1`, [exp.id])).n === 1 ? ok("automatic expiry is audit-logged") : bad("expiry not logged");
await expectOk("audit pack claim queued->building", async () => {
  const p = await as(U.A, "aal2", () => one(`INSERT INTO grc_audit_packs (label,period_start,period_end,status,requested_by) VALUES ('Q3',current_date-90,current_date,'queued',$1) RETURNING id`, [U.A]));
  const r = await as(null, null, () => q(`UPDATE grc_audit_packs SET status='building', updated_at=now() WHERE id=$1 AND status='queued' RETURNING id`, [p.id]));
  if (r.rows.length !== 1) throw new Error("claim failed");
});
await expectErr("users cannot mark packs ready", "row-level|0 rows", async () => {
  const r = await as(U.A, "aal2", () => q(`UPDATE grc_audit_packs SET status='ready' RETURNING id`));
  if (r.rows.length === 0) throw new Error("0 rows (no update policy)");
});

console.log("\n== Module config matches schema");
for (const mod of Object.values(GRC_MODULES)) {
  const cols = new Set([mod.idColumn, mod.labelColumn, mod.orderBy.column, ...(mod.statusColumn ? [mod.statusColumn] : []),
    ...(mod.searchColumns ?? []), ...mod.columns.map((c) => c.key), ...mod.fields.map((f) => f.key)]);
  await expectOk(`${mod.key}: ${cols.size} columns exist on ${mod.table}`, () => as(U.A, "aal2", () => q(`SELECT ${[...cols].join(",")} FROM ${mod.table} LIMIT 0`)));
  for (const f of mod.fields.filter((x) => x.type === "select" && !x.readOnly)) {
    const bad2 = [];
    for (const o of f.options ?? []) {
      const probe = await one(`SELECT pg_get_constraintdef(c.oid) def FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
        WHERE t.relname=$1 AND c.contype='c' AND pg_get_constraintdef(c.oid) ILIKE '%' || $2 || '%'`, [mod.table, f.key]);
      if (probe && !probe.def.includes(`'${o.value}'`)) bad2.push(o.value);
    }
    bad2.length ? bad(`${mod.key}.${f.key} options rejected by CHECK`, bad2.join(",")) : null;
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
