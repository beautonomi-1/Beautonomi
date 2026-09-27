import { zipSync } from "fflate";
import PDFDocument from "pdfkit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GRC_EVIDENCE_BUCKET } from "@/lib/grc/evidence";
import { finalizeManifest, sha256Bytes, type AuditPackManifest } from "./manifest";

type Row = Record<string, unknown>;

/** Serverless memory budget for evidence bytes in one pack; anything beyond is listed as omitted. */
const EVIDENCE_BYTE_BUDGET = 150 * 1024 * 1024;

const USER_ID_KEYS = new Set([
  "user_id", "owner_user_id", "assignee_user_id", "reviewer_user_id", "subject_user_id", "lead_user_id", "actor_user_id",
  "author_user_id", "risk_manager_id", "management_approver_id", "last_reviewer_id", "submitted_by", "reviewed_by",
  "approved_by", "created_by", "updated_by", "closed_by", "assigned_by", "revoked_by", "requested_by", "downloaded_by",
]);
const PII_KEY = /email|phone|full_name|subject_name|requester|address|ip_address/i;

export function csv(rows: Row[], columns?: string[]): string {
  const cols = columns ?? Array.from(rows.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set<string>()));
  const esc = (v: unknown) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}

/** Stable per-pack pseudonyms so an auditor can follow one person across files without learning who they are. */
export function makeRedactor(packId: string, enabled: boolean) {
  const pseudo = (id: string) => `person-${sha256Bytes(`${packId}:${id}`).slice(0, 10)}`;
  const redact = (value: unknown, key = ""): unknown => {
    if (!enabled) return value;
    if (value == null) return value;
    if (Array.isArray(value)) return value.map((v) => redact(v, key));
    if (typeof value === "object") return Object.fromEntries(Object.entries(value as Row).map(([k, v]) => [k, redact(v, k)]));
    if (USER_ID_KEYS.has(key) && typeof value === "string") return pseudo(value);
    if (PII_KEY.test(key)) return "[redacted]";
    return value;
  };
  return { redactRow: (r: Row) => redact(r) as Row, pseudo };
}

async function all(admin: SupabaseClient, table: string, build?: (q: any) => any): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    let q = admin.from(table).select("*").range(from, from + 999);
    if (build) q = build(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) return out;
  }
}

async function soaPdf(title: string, subtitle: string, entries: { ref: string; title: string; applicable: boolean; control: string; justification: string }[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(16).text(title);
    doc.fontSize(9).fillColor("#555").text(subtitle).fillColor("#000").moveDown();
    for (const e of entries) {
      doc.fontSize(9).font("Helvetica-Bold").text(`${e.ref}  ${e.title}`, { continued: false });
      doc.font("Helvetica").text(e.applicable ? `Applicable. Implemented by: ${e.control || "not mapped"}` : `Excluded. Justification: ${e.justification || "none recorded"}`);
      doc.moveDown(0.4);
    }
    doc.end();
  });
}

const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80);

export async function buildAuditPack(admin: SupabaseClient, packId: string): Promise<{ manifestHash: string; storagePath: string }> {
  const { data: pack, error: pErr } = await admin.from("grc_audit_packs").select("*").eq("id", packId).single();
  if (pErr || !pack) throw new Error(`pack not found: ${pErr?.message ?? packId}`);
  const start = String(pack.period_start);
  const end = String(pack.period_end);
  const endExclusive = new Date(new Date(`${end}T00:00:00Z`).getTime() + 86_400_000).toISOString();
  const inPeriod = (col: string) => (q: any) => q.gte(col, `${start}T00:00:00Z`).lt(col, endExclusive);
  const { redactRow } = makeRedactor(packId, pack.redact_pii !== false);

  const files: Record<string, Uint8Array> = {};
  const manifest: AuditPackManifest = {
    pack_id: packId,
    label: String(pack.label),
    generated_at: new Date().toISOString(),
    period: { start, end },
    redact_pii: pack.redact_pii !== false,
    soa_version: null,
    activity_chain: null,
    files: {},
    omitted_evidence: [],
  };
  const add = (name: string, content: string | Uint8Array) => {
    const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
    files[name] = bytes;
    manifest.files[name] = { sha256: sha256Bytes(bytes), bytes: bytes.byteLength };
  };
  const addTable = (name: string, rowsIn: Row[], columns?: string[]) => add(name, csv(rowsIn.map(redactRow), columns));

  // Scope: frameworks, requirements, controls, mappings.
  const [frameworks, requirements, controls, mappings] = await Promise.all([
    all(admin, "grc_frameworks"),
    all(admin, "grc_requirements", (q) => q.order("framework_id").order("sort_order")),
    all(admin, "grc_controls", (q) => q.order("id")),
    all(admin, "grc_control_requirements"),
  ]);
  addTable("scope/frameworks.csv", frameworks, ["id", "name", "version", "description"]);
  addTable("scope/requirements.csv", requirements, ["id", "framework_id", "ref_code", "title", "category"]);
  addTable("controls/controls.csv", controls, ["id", "title", "owner_team", "owner_user_id", "status", "frequency", "last_evidence_at", "next_review_at", "collector_key", "description", "implementation_notes"]);
  addTable("controls/control_requirement_map.csv", mappings, ["control_id", "requirement_id"]);

  // Statement of Applicability: the published version only.
  const { data: soa } = await admin.from("grc_soa_versions").select("*").eq("status", "published").maybeSingle();
  if (soa) {
    manifest.soa_version = { id: soa.id, label: soa.version_label, approved_at: soa.approved_at };
    const entries = await all(admin, "grc_soa_entries", (q) => q.eq("soa_version_id", soa.id));
    const reqById = new Map(requirements.map((r) => [r.id as string, r]));
    const ctlById = new Map(controls.map((c) => [c.id as string, c]));
    const rowsOut = entries
      .map((e) => {
        const r = reqById.get(e.requirement_id as string);
        const c = e.control_id ? ctlById.get(e.control_id as string) : null;
        return {
          requirement_id: e.requirement_id, ref_code: r?.ref_code ?? "", requirement: r?.title ?? "", sort: Number(r?.sort_order ?? 0),
          applicable: e.applicable, control_id: e.control_id ?? "", control: c?.title ?? "", control_status: c?.status ?? "", justification: e.justification ?? "",
        };
      })
      .sort((a, b) => a.sort - b.sort || String(a.requirement_id).localeCompare(String(b.requirement_id)));
    add("soa/statement_of_applicability.csv", csv(rowsOut, ["ref_code", "requirement", "applicable", "control_id", "control", "control_status", "justification"]));
    add(
      "soa/statement_of_applicability.pdf",
      await soaPdf(
        `Statement of Applicability — ${soa.version_label}`,
        `Published ${soa.approved_at ?? ""}. ${rowsOut.filter((r) => r.applicable).length} applicable, ${rowsOut.filter((r) => !r.applicable).length} excluded.`,
        rowsOut.map((r) => ({ ref: String(r.ref_code), title: String(r.requirement), applicable: Boolean(r.applicable), control: r.control_id ? `${r.control_id} ${r.control}` : "", justification: String(r.justification) })),
      ),
    );
  }

  // Policies: approved versions with approval metadata.
  const docs = await all(admin, "grc_documents", (q) => q.eq("status", "approved"));
  const versions = docs.length ? await all(admin, "grc_document_versions", (q) => q.in("id", docs.map((d) => d.current_version_id).filter(Boolean))) : [];
  const verById = new Map(versions.map((v) => [v.id as string, v]));
  const docIndex: Row[] = [];
  for (const d of docs) {
    const v = verById.get(d.current_version_id as string);
    if (!v) continue;
    const name = `policies/${safe(String(d.slug))}-v${v.version_number}.md`;
    add(name, String(v.body_markdown));
    docIndex.push({ slug: d.slug, title: d.title, doc_type: d.doc_type, version: v.version_number, author_user_id: v.author_user_id, approved_by: v.approved_by, approved_at: v.approved_at, next_review_at: d.next_review_at, file: name });
  }
  addTable("policies/index.csv", docIndex);

  // Risk.
  const [risks, acceptances, exceptions] = await Promise.all([all(admin, "grc_risks"), all(admin, "grc_risk_acceptances"), all(admin, "grc_exceptions")]);
  addTable("risk/risk_register.csv", risks);
  addTable("risk/risk_acceptances.csv", acceptances);
  addTable("risk/policy_exceptions.csv", exceptions);

  // Supply chain, assets, privacy.
  const [vendors, vendorAssessments, assets, processing, dpias, dsr] = await Promise.all([
    all(admin, "grc_vendors"), all(admin, "grc_vendor_assessments"), all(admin, "grc_assets"),
    all(admin, "grc_processing_activities"), all(admin, "grc_dpias"), all(admin, "grc_data_subject_requests", inPeriod("received_at")),
  ]);
  addTable("suppliers/vendors.csv", vendors);
  addTable("suppliers/vendor_assessments.csv", vendorAssessments);
  addTable("assets/assets.csv", assets);
  addTable("privacy/processing_activities.csv", processing);
  addTable("privacy/dpias.csv", dpias);
  addTable("privacy/data_subject_requests.csv", dsr);

  // Operations within the period.
  const [findings, corrective, incidents, bcdr, accessReviews, training, personnel, audits, mgmt, objectives] = await Promise.all([
    all(admin, "grc_findings", (q) => q.lt("created_at", endExclusive).or(`status.neq.closed,closed_at.gte."${start}T00:00:00Z"`)),
    all(admin, "grc_corrective_actions"),
    all(admin, "grc_incidents", inPeriod("detected_at")),
    all(admin, "grc_bcdr_tests", (q) => q.gte("conducted_at", start).lte("conducted_at", end)),
    all(admin, "grc_access_reviews", (q) => q.lte("period_start", end).gte("period_end", start)),
    all(admin, "grc_training_records", (q) => q.lte("completed_at", end)),
    all(admin, "grc_personnel_events", (q) => q.gte("event_at", start).lte("event_at", end)),
    all(admin, "grc_internal_audits"),
    all(admin, "grc_management_reviews", (q) => q.gte("review_date", start).lte("review_date", end)),
    all(admin, "grc_objectives"),
  ]);
  const reviewItems = accessReviews.length ? await all(admin, "grc_access_review_items", (q) => q.in("review_id", accessReviews.map((r) => r.id))) : [];
  addTable("operations/findings.csv", findings);
  addTable("operations/corrective_actions.csv", corrective);
  addTable("operations/incidents.csv", incidents);
  addTable("operations/bcdr_tests.csv", bcdr);
  addTable("access/access_reviews.csv", accessReviews);
  addTable("access/access_review_items.csv", reviewItems);
  addTable("people/training_records.csv", training);
  addTable("people/personnel_events.csv", personnel);
  addTable("governance/internal_audits.csv", audits);
  addTable("governance/management_reviews.csv", mgmt);
  addTable("governance/objectives.csv", objectives);

  // Evidence created in the period, with review outcome, plus the files themselves.
  const evidence = await all(admin, "grc_evidence_current", (q) => inPeriod("created_at")(q).order("created_at"));
  let budget = EVIDENCE_BYTE_BUDGET;
  const evidenceIndex: Row[] = [];
  const storage = admin.storage.from(GRC_EVIDENCE_BUCKET);
  const packedPaths = new Map<string, string>();
  for (const e of evidence) {
    let file = "";
    const path = e.storage_path as string | null;
    if (path && packedPaths.has(path)) file = packedPaths.get(path)!;
    else if (path) {
      const size = Number(e.size_bytes ?? 0);
      if (size > budget) manifest.omitted_evidence.push({ evidence_id: String(e.id), reason: "pack size limit; available on request" });
      else {
        const { data: blob, error } = await storage.download(path);
        if (error || !blob) manifest.omitted_evidence.push({ evidence_id: String(e.id), reason: `storage: ${error?.message ?? "missing"}` });
        else {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const actual = sha256Bytes(bytes);
          if (actual !== e.content_sha256) {
            manifest.omitted_evidence.push({ evidence_id: String(e.id), reason: `hash mismatch: stored object ${actual} != recorded ${e.content_sha256}` });
          } else {
            file = `evidence/${safe(String(e.control_id ?? "unscoped"))}/${String(e.id).slice(0, 8)}-${safe(String(e.file_name ?? "evidence"))}`;
            add(file, bytes);
            packedPaths.set(path, file);
            budget -= bytes.byteLength;
          }
        }
      }
    }
    evidenceIndex.push({
      evidence_id: e.id, control_id: e.control_id, title: e.title, source: e.source, sha256: e.content_sha256,
      period_start: e.period_start, period_end: e.period_end, submitted_by: e.submitted_by, created_at: e.created_at,
      review_status: e.review_status, last_reviewer_id: e.last_reviewer_id, last_reviewed_at: e.last_reviewed_at, file,
    });
  }
  addTable("evidence/index.csv", evidenceIndex);

  // Activity log for the period, with chain verification of the whole log.
  const activity = await all(admin, "grc_activity_log", (q) => inPeriod("created_at")(q).order("id"));
  addTable("activity/activity_log.csv", activity, ["id", "created_at", "actor_user_id", "actor_label", "action", "entity_type", "entity_id", "metadata", "prev_hash", "row_hash"]);
  const { data: chain } = await admin.rpc("grc_verify_activity_chain").maybeSingle();
  if (chain) {
    const c = chain as { rows_checked: number; first_broken_id: number | null; last_hash: string | null };
    manifest.activity_chain = { rows_checked: Number(c.rows_checked), first_broken_id: c.first_broken_id, last_hash: c.last_hash };
  }

  add(
    "README.md",
    [
      `# ${pack.label}`,
      "",
      `Beautonomi ISMS audit pack for ${start} to ${end}, generated ${manifest.generated_at}.`,
      "",
      "## Verifying integrity",
      "",
      "1. `manifest.json` lists every other file with its SHA-256. Recompute with `sha256sum` (Linux/macOS) or `Get-FileHash -Algorithm SHA256` (Windows) and compare.",
      "2. The SHA-256 of `manifest.json` itself is recorded in Beautonomi's database and returned as the `X-Manifest-Hash` header on download. Ask the ISMS owner to confirm it.",
      "3. Evidence files are content-addressed: `evidence/index.csv` gives the hash recorded when each item was submitted; the file in this pack was re-verified against it at build time.",
      "4. `activity/activity_log.csv` is an excerpt of a hash-chained, append-only log. `manifest.json › activity_chain` shows the result of verifying the full chain at build time.",
      "",
      manifest.redact_pii ? "People are shown as stable pseudonyms (`person-…`) that are consistent within this pack. Contact details are redacted." : "This pack is not redacted.",
      manifest.soa_version ? `\nStatement of Applicability: ${manifest.soa_version.label} (published ${manifest.soa_version.approved_at}).` : "\nNo published Statement of Applicability at build time.",
      manifest.omitted_evidence.length ? `\n${manifest.omitted_evidence.length} evidence items were not included; see manifest.json › omitted_evidence.` : "",
      "",
    ].join("\n"),
  );

  const { manifestJson, manifestHash } = finalizeManifest(manifest);
  files["manifest.json"] = new TextEncoder().encode(manifestJson);

  const zipped = zipSync(files, { level: 6 });
  const path = `audit-packs/${packId}/pack.zip`;
  const { error: upErr } = await admin.storage.from(GRC_EVIDENCE_BUCKET).upload(path, zipped, { contentType: "application/zip", upsert: true });
  if (upErr) throw new Error(`upload: ${upErr.message}`);

  const { error: uErr } = await admin
    .from("grc_audit_packs")
    .update({ status: "ready", manifest_hash: manifestHash, storage_path: path, part_count: 1, ready_at: new Date().toISOString(), error_message: null })
    .eq("id", packId);
  if (uErr) throw new Error(uErr.message);
  return { manifestHash, storagePath: path };
}
