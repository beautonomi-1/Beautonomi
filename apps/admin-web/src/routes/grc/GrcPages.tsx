import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { GRC_ROLE_LABELS, getGrcModule, type GrcModuleKey, type GrcRole } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import {
  Badge, Empty, ErrorText, Field, Tabs, UserSelect, btnDanger, btnPrimary, btnSecondary, fmtDate, grcAction, inputCls,
  useDirectory, useGrcGate, useGrcMutation, useGrcPermissions, userLabel, type Row,
} from "./grcShared";
import { GrcModuleTable, RecordDialog } from "./GrcModulePage";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

/** Standard page shell: section gate, title, header. */
function GrcPage({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  useAdminDocumentTitle(title);
  const { allowed, denied } = useGrcGate();
  if (!allowed) return denied;
  return (
    <div className="space-y-6">
      <AdminPageHeader title={title} description={description} actions={actions} />
      {children}
    </div>
  );
}

function TabbedModules({ title, description, tabs }: { title: string; description?: string; tabs: { id: GrcModuleKey; label: string; toolbar?: ReactNode }[] }) {
  const [tab, setTab] = useState<GrcModuleKey>(tabs[0].id);
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];
  return (
    <GrcPage title={title} description={description}>
      <Tabs tabs={tabs.map((t) => ({ id: t.id, label: t.label }))} value={tab} onChange={setTab} />
      <GrcModuleTable key={current.id} moduleKey={current.id} toolbar={current.toolbar} />
    </GrcPage>
  );
}

function Metric({ label, value, tone, to }: { label: string; value: ReactNode; tone?: "good" | "warn" | "bad"; to?: string }) {
  const cls = tone === "bad" ? "text-red-700" : tone === "warn" ? "text-amber-700" : tone === "good" ? "text-emerald-700" : "text-gray-900";
  const body = (
    <div className="rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-300">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${cls}`}>{value}</div>
    </div>
  );
  return to ? <Link to={adminSpaTo(to)}>{body}</Link> : body;
}

function Bar({ value, total, label }: { value: number; total: number; label: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-600"><span>{label}</span><span>{value}/{total} ({pct}%)</span></div>
      <div className="mt-1 h-2 rounded bg-gray-100"><div className="h-2 rounded bg-gray-900" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────

type Overview = {
  controls: { total: number; applicable: number; implemented: number; evidence_current: number; without_owner: number; by_status: Record<string, number> };
  coverage: { framework_id: string; name: string; requirements: number; mapped: number; implemented: number; evidenced: number }[];
  risks: { open: number; above_appetite: number; review_overdue: number; acceptances_pending: number };
  findings: { open: number; overdue: number; by_severity: Record<string, number> };
  evidence: { pending_review: number; overdue_requests: number };
  documents: { total: number; approved: number; review_overdue: number };
  soa: { version_label: string; approved_at: string | null } | null;
  activity_chain: { ok: boolean; rows_checked: number } | null;
};

export function GrcOverviewPage() {
  const { allowed } = useGrcGate();
  const q = useQuery({ queryKey: ["grc", "overview"], queryFn: () => adminApi.getJson<Overview>("/api/admin/grc/overview"), enabled: allowed });
  const d = q.data;
  return (
    <GrcPage title="Security & Compliance" description="ISMS readiness across ISO 27001, NIST CSF, POPIA and GDPR" actions={<Link className={btnSecondary} to={adminSpaTo("/admin/grc/my-work")}>My work</Link>}>
      {q.isLoading ? <AdminPageSkeleton /> : null}
      {q.isError ? <AdminRetryBlock message={errMsg(q.error)} onRetry={() => q.refetch()} /> : null}
      {d ? (
        <>
          {d.controls.total === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              The control catalogue is empty. Follow the <Link className="underline" to={adminSpaTo("/admin/grc/setup")}>setup checklist</Link> to get started.
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Controls implemented" value={`${d.controls.implemented}/${d.controls.applicable}`} to="/admin/grc/controls" />
            <Metric label="Evidence current" value={`${d.controls.evidence_current}/${d.controls.applicable}`} tone={d.controls.evidence_current < d.controls.applicable ? "warn" : "good"} to="/admin/grc/controls" />
            <Metric label="Controls without owner" value={d.controls.without_owner} tone={d.controls.without_owner ? "warn" : "good"} to="/admin/grc/controls" />
            <Metric label="Evidence awaiting review" value={d.evidence.pending_review} tone={d.evidence.pending_review ? "warn" : undefined} to="/admin/grc/evidence" />
            <Metric label="Open risks (above appetite)" value={`${d.risks.open} (${d.risks.above_appetite})`} tone={d.risks.above_appetite ? "bad" : undefined} to="/admin/grc/risks" />
            <Metric label="Open findings (overdue)" value={`${d.findings.open} (${d.findings.overdue})`} tone={d.findings.overdue ? "bad" : undefined} to="/admin/grc/findings" />
            <Metric label="Policies approved" value={`${d.documents.approved}/${d.documents.total}`} tone={d.documents.review_overdue ? "warn" : undefined} to="/admin/grc/documents" />
            <Metric label="Statement of Applicability" value={d.soa ? d.soa.version_label : "Not published"} tone={d.soa ? "good" : "warn"} to="/admin/grc/soa" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <AdminPanel title="Framework coverage">
              <div className="space-y-5">
                {d.coverage.map((c) => (
                  <div key={c.framework_id} className="space-y-2">
                    <div className="text-sm font-medium text-gray-900">{c.name}</div>
                    <Bar label="Mapped to a control" value={c.mapped} total={c.requirements} />
                    <Bar label="Control implemented" value={c.implemented} total={c.requirements} />
                    <Bar label="Implemented with current evidence" value={c.evidenced} total={c.requirements} />
                  </div>
                ))}
                {d.coverage.length === 0 ? <Empty>No frameworks loaded.</Empty> : null}
              </div>
            </AdminPanel>
            <AdminPanel title="Health">
              <ul className="space-y-2 text-sm">
                <li>Overdue evidence requests: <strong>{d.evidence.overdue_requests}</strong></li>
                <li>Risks past review date: <strong>{d.risks.review_overdue}</strong></li>
                <li>Risk acceptances awaiting decision: <strong>{d.risks.acceptances_pending}</strong></li>
                <li>Policies past review date: <strong>{d.documents.review_overdue}</strong></li>
                <li>
                  Findings by severity:{" "}
                  {Object.entries(d.findings.by_severity).length
                    ? Object.entries(d.findings.by_severity).map(([k, v]) => <span key={k} className="mr-2"><Badge value={k} /> {v}</span>)
                    : "none open"}
                </li>
                <li>
                  Activity log integrity:{" "}
                  {d.activity_chain ? (
                    d.activity_chain.ok ? <span className="text-emerald-700">intact ({d.activity_chain.rows_checked} entries verified)</span> : <span className="font-semibold text-red-700">BROKEN: investigate immediately</span>
                  ) : "not checked"}
                </li>
              </ul>
            </AdminPanel>
          </div>
        </>
      ) : null}
    </GrcPage>
  );
}

// ─── My work ──────────────────────────────────────────────────────────────────

type MyWork = Record<string, Row[]> & { total: number; overdue_findings: number };

function WorkSection({ title, rows, render }: { title: string; rows: Row[] | undefined; render: (r: Row) => ReactNode }) {
  if (!rows?.length) return null;
  return (
    <AdminPanel title={`${title} (${rows.length})`}>
      <ul className="divide-y divide-gray-100">{rows.map((r, i) => <li key={String(r.id ?? i)} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">{render(r)}</li>)}</ul>
    </AdminPanel>
  );
}

function Due({ at }: { at: unknown }) {
  if (!at) return null;
  const overdue = new Date(String(at)).getTime() < Date.now();
  return <span className={overdue ? "font-medium text-red-700" : "text-gray-500"}>{overdue ? "overdue " : "due "}{fmtDate(at)}</span>;
}

export function GrcMyWorkPage() {
  const { allowed } = useGrcGate();
  const { byId } = useDirectory(allowed);
  const q = useQuery({ queryKey: ["grc", "my-work"], queryFn: () => adminApi.getJson<MyWork>("/api/admin/grc/my-work"), enabled: allowed });
  const [open, setOpen] = useState<{ module: GrcModuleKey; id: string } | null>(null);
  const openBtn = (module: GrcModuleKey, id: unknown, label = "Open") => (
    <button type="button" className={btnSecondary} onClick={() => setOpen({ module, id: String(id) })}>{label}</button>
  );
  const d = q.data;
  return (
    <GrcPage title="My work" description="Everything waiting on you, limited to what your GRC roles allow you to act on">
      {q.isLoading ? <AdminPageSkeleton /> : null}
      {q.isError ? <AdminRetryBlock message={errMsg(q.error)} onRetry={() => q.refetch()} /> : null}
      {d && d.total === 0 ? <AdminPanel title="All clear"><Empty>Nothing is waiting on you.</Empty></AdminPanel> : null}
      {d ? (
        <div className="space-y-4">
          <WorkSection title="Evidence requested from you" rows={d.evidence_requests} render={(r) => <><span>{String(r.control_id)} · {String(r.title)} <Due at={r.due_at} /></span>{openBtn("controls", r.control_id, "Upload evidence")}</>} />
          <WorkSection title="Your controls needing fresh evidence" rows={d.controls_needing_evidence} render={(r) => <><span>{String(r.id)} · {String(r.title)} <Due at={r.evidence_due_at} /></span>{openBtn("controls", r.id, "Upload evidence")}</>} />
          <WorkSection title="Findings you own" rows={d.findings} render={(r) => <><span><Badge value={r.severity} /> {String(r.title)} <Due at={r.due_at} /></span>{openBtn("findings", r.id)}</>} />
          <WorkSection title="Evidence to review" rows={d.evidence_to_review} render={(r) => <><span>{String(r.control_id)} · {String(r.title ?? "Evidence")} · from {userLabel(byId.get(String(r.submitted_by)), r.submitted_by)}</span>{openBtn("evidence", r.id, "Review")}</>} />
          <WorkSection title="Access review decisions" rows={d.access_review_items} render={(r) => <><span>{String(r.subject_email)} · {String(r.platform_role ?? "")} · {String((r.grc_access_reviews as Row | null)?.title ?? "")}</span>{openBtn("access_reviews", r.review_id, "Decide")}</>} />
          <WorkSection title="Policies awaiting your approval" rows={d.documents_to_approve} render={(r) => <><span>{String((r.grc_documents as Row | null)?.title ?? "")} v{String(r.version_number)} · by {userLabel(byId.get(String(r.author_user_id)), r.author_user_id)}</span>{openBtn("documents", r.document_id, "Review")}</>} />
          <WorkSection title="Risk acceptances to decide" rows={d.risk_acceptances_to_decide} render={(r) => <><span>{String((r.grc_risks as Row | null)?.title ?? "")} · proposed {fmtDate(r.proposed_at)}</span>{openBtn("risks", r.risk_id, "Decide")}</>} />
          <WorkSection title="Management reviews to sign off" rows={d.management_reviews_to_sign} render={(r) => <><span>Review of {fmtDate(r.review_date)} <Badge value={r.status} /></span>{openBtn("management_reviews", r.id, "Sign off")}</>} />
          <WorkSection title="Policies to acknowledge" rows={d.documents_to_acknowledge} render={(r) => <><span>{String(r.title)}</span>{openBtn("documents", r.id, "Read & acknowledge")}</>} />
          <WorkSection title="Your policies due for review" rows={d.documents_due_for_review} render={(r) => <><span>{String(r.title)} <Due at={r.next_review_at} /></span>{openBtn("documents", r.id)}</>} />
        </div>
      ) : null}
      {open ? <RecordDialog mod={getGrcModule(open.module)!} id={open.id} onClose={() => setOpen(null)} /> : null}
    </GrcPage>
  );
}

// ─── Module pages ─────────────────────────────────────────────────────────────

export function GrcControlsPage() {
  return (
    <GrcPage title="Controls" description="Each control maps to ISO 27001, NIST CSF and POPIA/GDPR requirements. Open one to upload evidence.">
      <GrcModuleTable moduleKey="controls" />
    </GrcPage>
  );
}

function NewDocumentButton() {
  const { has } = useGrcPermissions();
  const { users } = useDirectory();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ title: "", slug: "", doc_type: "policy", owner_user_id: "", requires_acknowledgement: false, body_markdown: "" });
  const create = useGrcMutation(
    () => grcAction("document.create", { ...v, owner_user_id: v.owner_user_id || null }),
    () => { setOpen(false); setV({ title: "", slug: "", doc_type: "policy", owner_user_id: "", requires_acknowledgement: false, body_markdown: "" }); },
  );
  if (!has("grc.documents.edit")) return null;
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return (
    <>
      <button type="button" className={btnPrimary} onClick={() => setOpen(true)}>New document</button>
      <AdminModal open={open} onClose={() => setOpen(false)} title="New policy or document" description="Starts as draft v1. Submit it for approval when ready; the approver must be someone else." size="xl" footer={null}>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" required><input className={inputCls} value={v.title} onChange={(e) => setV((s) => ({ ...s, title: e.target.value, slug: s.slug && s.slug !== slugify(s.title) ? s.slug : slugify(e.target.value) }))} /></Field>
            <Field label="Short name" required help="Lowercase letters, digits and hyphens. Used in the audit pack."><input className={inputCls} value={v.slug} onChange={(e) => setV((s) => ({ ...s, slug: e.target.value }))} /></Field>
            <Field label="Type">
              <select className={inputCls} value={v.doc_type} onChange={(e) => setV((s) => ({ ...s, doc_type: e.target.value }))}>
                {["policy", "standard", "procedure", "plan", "register", "record"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Owner"><UserSelect users={users} value={v.owner_user_id} onChange={(x) => setV((s) => ({ ...s, owner_user_id: x }))} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.requires_acknowledgement} onChange={(e) => setV((s) => ({ ...s, requires_acknowledgement: e.target.checked }))} /> Staff must acknowledge each approved version</label>
          <Field label="Content (Markdown)" required><textarea className={`${inputCls} min-h-[240px] font-mono`} value={v.body_markdown} onChange={(e) => setV((s) => ({ ...s, body_markdown: e.target.value }))} /></Field>
          <ErrorText error={create.error} />
          <div className="flex justify-end gap-2">
            <button type="button" className={btnSecondary} onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className={btnPrimary} disabled={create.isPending || v.title.trim().length < 3 || !v.slug || !v.body_markdown.trim()} onClick={() => create.mutate(undefined)}>Create draft</button>
          </div>
        </div>
      </AdminModal>
    </>
  );
}

export function GrcDocumentsPage() {
  return (
    <GrcPage title="Policies & documents" description="Versioned, approved by someone other than the author, and acknowledged by staff where required.">
      <GrcModuleTable moduleKey="documents" toolbar={<NewDocumentButton />} />
    </GrcPage>
  );
}

export function GrcRisksPage() {
  return <TabbedModules title="Risk register" description="Score likelihood × impact. Risks above appetite need treatment or a management-approved acceptance." tabs={[
    { id: "risks", label: "Risks" }, { id: "risk_acceptances", label: "Acceptances" }, { id: "exceptions", label: "Exceptions" },
  ]} />;
}

export function GrcVendorsPage() {
  return <TabbedModules title="Vendors & assets" tabs={[
    { id: "vendors", label: "Vendors" }, { id: "vendor_assessments", label: "Assessments" }, { id: "assets", label: "Assets" },
  ]} />;
}

export function GrcPrivacyPage() {
  return <TabbedModules title="Privacy" description="POPIA / GDPR records of processing, DPIAs and data-subject requests." tabs={[
    { id: "processing", label: "Processing activities" }, { id: "dpias", label: "DPIAs" }, { id: "dsr", label: "Data-subject requests" },
  ]} />;
}

export function GrcEvidencePage() {
  return <TabbedModules title="Evidence locker" description="Every item is SHA-256 fingerprinted and append-only. Upload from a control; review here." tabs={[
    { id: "evidence", label: "Evidence" }, { id: "evidence_requests", label: "Requests" },
  ]} />;
}

function StartAccessReview() {
  const { has } = useGrcPermissions();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const q0 = new Date();
  q0.setMonth(q0.getMonth() - 3);
  const [v, setV] = useState({ title: `Access review ${today.slice(0, 7)}`, period_start: q0.toISOString().slice(0, 10), period_end: today });
  const start = useGrcMutation(() => grcAction("access_review.start", v), () => setOpen(false));
  if (!has("grc.access_reviews.decide")) return null;
  return (
    <>
      <button type="button" className={btnPrimary} onClick={() => setOpen(true)}>Start review</button>
      <AdminModal open={open} onClose={() => setOpen(false)} title="Start an access review" description="Snapshots every admin user, their platform role and GRC roles. Each person is then decided by someone other than themselves." footer={null}>
        <div className="space-y-3">
          <Field label="Title" required><input className={inputCls} value={v.title} onChange={(e) => setV((s) => ({ ...s, title: e.target.value }))} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Period from"><input type="date" className={inputCls} value={v.period_start} onChange={(e) => setV((s) => ({ ...s, period_start: e.target.value }))} /></Field>
            <Field label="Period to"><input type="date" className={inputCls} value={v.period_end} onChange={(e) => setV((s) => ({ ...s, period_end: e.target.value }))} /></Field>
          </div>
          <ErrorText error={start.error} />
          <div className="flex justify-end"><button type="button" className={btnPrimary} disabled={start.isPending} onClick={() => start.mutate(undefined)}>Start review</button></div>
        </div>
      </AdminModal>
    </>
  );
}

export function GrcAccessReviewsPage() {
  return (
    <GrcPage title="Access reviews" description="Quarterly review of every admin user and GRC role.">
      <GrcModuleTable moduleKey="access_reviews" toolbar={<StartAccessReview />} />
    </GrcPage>
  );
}

const FINDING_SOURCES = [
  ["pentest", "Penetration test"], ["vulnerability_scan", "Vulnerability scan"], ["external_audit", "External audit"],
  ["internal_audit", "Internal audit"], ["bug_bounty", "Bug bounty"], ["self_identified", "Self-identified"],
] as const;

type ImportResult = { dry_run: boolean; to_create?: number; created?: number; already_imported: number; errors: { row: number; message: string }[]; preview?: Row[] };

function ImportFindings() {
  const { has } = useGrcPermissions();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("pentest");
  const [file, setFile] = useState<{ name: string; content: string; format: "csv" | "json" } | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const run = useGrcMutation(
    (dry: boolean) => adminApi.postJson<ImportResult>("/api/admin/grc/findings/import", { source, format: file!.format, content: file!.content, dry_run: dry }),
    (r) => setPreview(r),
  );
  if (!has("grc.findings.edit")) return null;
  const close = () => { setOpen(false); setFile(null); setPreview(null); run.reset(); };
  return (
    <>
      <button type="button" className={btnSecondary} onClick={() => setOpen(true)}>Import report</button>
      <AdminModal open={open} onClose={close} title="Import findings" description="CSV or JSON from a pentest or scanner. Re-importing the same report is safe: existing findings are never overwritten." size="xl" footer={null}>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Source">
              <select className={inputCls} value={source} onChange={(e) => { setSource(e.target.value); setPreview(null); }}>
                {FINDING_SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="File" help="Columns: title, severity, description, reference/id, due date (flexible names).">
              <input type="file" accept=".csv,.json,text/csv,application/json" className="text-sm" onChange={async (e) => {
                const f = e.target.files?.[0];
                setPreview(null);
                if (!f) return setFile(null);
                setFile({ name: f.name, content: await f.text(), format: f.name.toLowerCase().endsWith(".json") ? "json" : "csv" });
              }} />
            </Field>
          </div>
          <ErrorText error={run.error} />
          {preview ? (
            <div className="rounded-lg border border-gray-200 p-3 text-sm">
              {preview.dry_run ? (
                <p><strong>{preview.to_create}</strong> new findings will be created; {preview.already_imported} already imported and skipped.</p>
              ) : (
                <p className="text-emerald-700"><strong>{preview.created ?? 0}</strong> findings created; {preview.already_imported} already existed.</p>
              )}
              {preview.errors.length ? (
                <details className="mt-2"><summary className="cursor-pointer text-amber-800">{preview.errors.length} rows skipped</summary>
                  <ul className="mt-1 max-h-40 overflow-auto text-xs">{preview.errors.map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}</ul>
                </details>
              ) : null}
              {preview.preview?.length ? (
                <ul className="mt-2 max-h-48 overflow-auto text-xs">{preview.preview.map((p) => <li key={String(p.external_ref)}><Badge value={p.severity} /> {String(p.title)}</li>)}</ul>
              ) : null}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <button type="button" className={btnSecondary} onClick={close}>{preview && !preview.dry_run ? "Done" : "Cancel"}</button>
            {!preview || preview.dry_run === false ? (
              <button type="button" className={btnSecondary} disabled={!file || run.isPending} onClick={() => run.mutate(true)}>Preview</button>
            ) : (
              <button type="button" className={btnPrimary} disabled={run.isPending || !preview.to_create} onClick={() => run.mutate(false)}>Import {preview.to_create} findings</button>
            )}
          </div>
        </div>
      </AdminModal>
    </>
  );
}

export function GrcFindingsPage() {
  return <TabbedModules title="Findings" description="From pentests, scans, audits and collectors. Critical and high findings need retest evidence to close." tabs={[
    { id: "findings", label: "Findings", toolbar: <ImportFindings /> }, { id: "corrective_actions", label: "Corrective actions" },
  ]} />;
}

export function GrcIncidentsPage() {
  return <TabbedModules title="Incidents & BC/DR" tabs={[{ id: "incidents", label: "Incidents" }, { id: "bcdr_tests", label: "BC/DR tests" }]} />;
}

export function GrcPeoplePage() {
  return (
    <TabbedModules
      title="People & training"
      description={
        "Compliance register for training completion and personnel changes. For step-by-step GRC workflows, open the Security & Compliance runbook in the Knowledge Base (/admin/knowledge-base/security-compliance-runbook)."
      }
      tabs={[{ id: "training", label: "Training" }, { id: "personnel", label: "Joiners, movers & leavers" }]}
    />
  );
}

export function GrcAuditsPage() {
  return <TabbedModules title="Audits & management review" tabs={[
    { id: "internal_audits", label: "Internal audits" }, { id: "management_reviews", label: "Management reviews" },
    { id: "corrective_actions", label: "Corrective actions" }, { id: "objectives", label: "Objectives" },
  ]} />;
}

// ─── Statement of Applicability ──────────────────────────────────────────────

type SoaResponse = { versions: Row[]; version: Row | null; entries: Row[] };

function SoaEntryRow({ entry, editable, controls }: { entry: Row; editable: boolean; controls: { value: string; label: string }[] }) {
  const req = entry.grc_requirements as Row | null;
  const [applicable, setApplicable] = useState(entry.applicable === true);
  const [justification, setJustification] = useState(String(entry.justification ?? ""));
  const [controlId, setControlId] = useState(String(entry.control_id ?? ""));
  const dirty = applicable !== (entry.applicable === true) || justification !== String(entry.justification ?? "") || controlId !== String(entry.control_id ?? "");
  const save = useGrcMutation(() => grcAction("soa.update_entry", { entry_id: entry.id, applicable, justification: justification || null, control_id: controlId || null }));
  return (
    <tr className="border-t border-gray-100 align-top">
      <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs">{String(req?.ref_code ?? entry.requirement_id)}</td>
      <td className="py-2 pr-3 text-sm">{String(req?.title ?? "")}</td>
      <td className="py-2 pr-3">
        {editable ? <input type="checkbox" checked={applicable} onChange={(e) => setApplicable(e.target.checked)} /> : applicable ? "Yes" : <span className="text-red-700">Excluded</span>}
      </td>
      <td className="py-2 pr-3 text-sm">
        {editable ? (
          <select className={inputCls} value={controlId} onChange={(e) => setControlId(e.target.value)}>
            <option value="">—</option>
            {controls.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        ) : entry.control_id ? `${String(entry.control_id)} · ${String((entry.grc_controls as Row | null)?.title ?? "")}` : "—"}
      </td>
      <td className="py-2 pr-3 text-sm">
        {editable ? <textarea className={inputCls} rows={2} placeholder={applicable ? "How it is met (optional)" : "Why excluded (required)"} value={justification} onChange={(e) => setJustification(e.target.value)} /> : String(entry.justification ?? "")}
        {save.error ? <ErrorText error={save.error} /> : null}
      </td>
      <td className="py-2">{editable && dirty ? <button type="button" className={btnSecondary} disabled={save.isPending} onClick={() => save.mutate(undefined)}>Save</button> : null}</td>
    </tr>
  );
}

export function GrcSoaPage() {
  const { allowed } = useGrcGate();
  const { has, userId } = useGrcPermissions();
  const [versionId, setVersionId] = useState("");
  const [label, setLabel] = useState("");
  const q = useQuery({
    queryKey: ["grc", "soa", versionId],
    queryFn: () => adminApi.getJson<SoaResponse>(`/api/admin/grc/soa${versionId ? `?version=${versionId}` : ""}`),
    enabled: allowed,
  });
  const controls = useQuery({
    queryKey: ["grc", "records", "controls", "picker"],
    queryFn: () => adminApi.getJson<{ items: Row[] }>("/api/admin/grc/records/controls"),
    enabled: allowed && has("grc.controls.edit"),
  });
  const controlOptions = useMemo(() => (controls.data?.items ?? []).map((c) => ({ value: String(c.id), label: `${String(c.id)} · ${String(c.title)}` })), [controls.data]);
  const createDraft = useGrcMutation(() => grcAction<string>("soa.create_draft", { label }), () => { setLabel(""); setVersionId(""); });
  const publish = useGrcMutation((id: string) => grcAction("soa.publish", { version_id: id }));

  const d = q.data;
  const v = d?.version ?? null;
  const editable = v?.status === "draft" && has("grc.controls.edit");
  const hasDraft = d?.versions.some((x) => x.status === "draft");
  const excluded = d?.entries.filter((e) => e.applicable !== true).length ?? 0;
  return (
    <GrcPage title="Statement of Applicability" description="ISO 27001 Annex A: which controls apply, how each is met, and why any are excluded. Published versions are locked.">
      {q.isLoading ? <AdminPageSkeleton /> : null}
      {q.isError ? <AdminRetryBlock message={errMsg(q.error)} onRetry={() => q.refetch()} /> : null}
      {d ? (
        <>
          <AdminPanel title="Versions">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Viewing">
                <select className={inputCls} value={versionId || String(v?.id ?? "")} onChange={(e) => setVersionId(e.target.value)}>
                  {d.versions.map((x) => <option key={String(x.id)} value={String(x.id)}>{String(x.version_label)} ({String(x.status)}){x.approved_at ? ` · ${fmtDate(x.approved_at)}` : ""}</option>)}
                </select>
              </Field>
              {has("grc.controls.edit") && !hasDraft ? (
                <>
                  <Field label="New draft label"><input className={inputCls} placeholder="e.g. 2026 v2" value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
                  <button type="button" className={btnPrimary} disabled={createDraft.isPending || label.trim().length < 2} onClick={() => createDraft.mutate(undefined)}>Create draft</button>
                </>
              ) : null}
              {v?.status === "draft" && has("grc.documents.approve") ? (
                v.created_by && v.created_by === userId ? <span className="text-xs text-gray-500">You created this draft, so someone else must publish it.</span> : (
                  <button type="button" className={btnPrimary} disabled={publish.isPending} onClick={() => publish.mutate(String(v.id))}>Publish this version</button>
                )
              ) : null}
            </div>
            <ErrorText error={createDraft.error ?? publish.error} />
            {d.versions.length === 0 ? <Empty>No SoA yet. Create the first draft; it is pre-filled with every Annex A control.</Empty> : null}
          </AdminPanel>
          {v ? (
            <AdminPanel title={`${String(v.version_label)}: ${d.entries.length} requirements, ${excluded} excluded`} actions={<Badge value={v.status} />}>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead><tr className="text-xs uppercase text-gray-500"><th className="py-2 pr-3">Ref</th><th className="pr-3">Requirement</th><th className="pr-3">Applies</th><th className="pr-3">Implemented by</th><th className="pr-3">Justification</th><th /></tr></thead>
                  <tbody>{d.entries.map((e) => <SoaEntryRow key={String(e.id)} entry={e} editable={editable} controls={controlOptions} />)}</tbody>
                </table>
              </div>
            </AdminPanel>
          ) : null}
        </>
      ) : null}
    </GrcPage>
  );
}

// ─── Audit packs ──────────────────────────────────────────────────────────────

export function GrcAuditPacksPage() {
  const { allowed } = useGrcGate();
  const { byId } = useDirectory(allowed);
  const q = useQuery({
    queryKey: ["grc", "audit-packs"],
    queryFn: () => adminApi.getJson<{ items: Row[] }>("/api/admin/grc/audit-packs"),
    enabled: allowed,
    refetchInterval: (query) => ((query.state.data?.items ?? []).some((p) => p.status === "queued" || p.status === "building") ? 15_000 : false),
  });
  const today = new Date().toISOString().slice(0, 10);
  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const [v, setV] = useState({ label: `Audit pack ${today}`, period_start: yearAgo.toISOString().slice(0, 10), period_end: today, redact_pii: true });
  const request = useGrcMutation(() => adminApi.postJson("/api/admin/grc/audit-packs", v));
  const [dlErr, setDlErr] = useState<unknown>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  async function download(p: Row) {
    setDlErr(null);
    setDownloading(String(p.id));
    try {
      const blob = await adminApi.downloadBlob(`/api/admin/grc/audit-packs/${String(p.id)}/download`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `beautonomi-audit-pack-${String(p.period_end ?? p.id)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      setDlErr(e);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <GrcPage title="Audit packs" description="A zip for your auditor: scope, SoA, policies, registers, verified evidence and a tamper-evident activity log, with a manifest of SHA-256 hashes.">
      <AdminPanel title="Request a pack">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Label"><input className={inputCls} value={v.label} onChange={(e) => setV((s) => ({ ...s, label: e.target.value }))} /></Field>
          <Field label="Period from"><input type="date" className={inputCls} value={v.period_start} onChange={(e) => setV((s) => ({ ...s, period_start: e.target.value }))} /></Field>
          <Field label="Period to"><input type="date" className={inputCls} value={v.period_end} onChange={(e) => setV((s) => ({ ...s, period_end: e.target.value }))} /></Field>
          <Field label="Redact personal data" help="Recommended. People appear as stable pseudonyms.">
            <input type="checkbox" checked={v.redact_pii} onChange={(e) => setV((s) => ({ ...s, redact_pii: e.target.checked }))} />
          </Field>
        </div>
        <ErrorText error={request.error} />
        <div className="mt-3 flex items-center gap-3">
          <button type="button" className={btnPrimary} disabled={request.isPending} onClick={() => request.mutate(undefined)}>Request pack</button>
          <span className="text-xs text-gray-500">Packs are built in the background, usually within 10 minutes.</span>
        </div>
      </AdminPanel>
      <AdminPanel title="Packs">
        {q.isLoading ? <AdminPageSkeleton /> : null}
        {q.isError ? <AdminRetryBlock message={errMsg(q.error)} onRetry={() => q.refetch()} /> : null}
        {q.data && q.data.items.length === 0 ? <Empty>No packs yet.</Empty> : null}
        <ErrorText error={dlErr} />
        {q.data?.items.length ? (
          <table className="min-w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-gray-500"><th className="py-2">Pack</th><th>Period</th><th>Status</th><th>Requested</th><th>Manifest SHA-256</th><th /></tr></thead>
            <tbody>
              {q.data.items.map((p) => (
                <tr key={String(p.id)} className="border-t border-gray-100">
                  <td className="py-2">{String(p.label ?? "Audit pack")}{p.redact_pii ? <span className="ml-1 text-xs text-gray-500">(redacted)</span> : null}</td>
                  <td>{fmtDate(p.period_start)} – {fmtDate(p.period_end)}</td>
                  <td><Badge value={p.status} />{p.error_message ? <div className="text-xs text-red-700">{String(p.error_message)}</div> : null}</td>
                  <td>{userLabel(byId.get(String(p.requested_by)), p.requested_by)} · {fmtDate(p.created_at, true)}</td>
                  <td className="font-mono text-[10px] text-gray-600" title={String(p.manifest_hash ?? "")}>{p.manifest_hash ? `${String(p.manifest_hash).slice(0, 16)}…` : "—"}</td>
                  <td>{p.status === "ready" ? <button type="button" className={btnSecondary} disabled={downloading === p.id} onClick={() => void download(p)}>{downloading === p.id ? "Downloading…" : "Download"}</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <p className="mt-3 text-xs text-gray-500">Every download is recorded. Share the manifest hash with the auditor separately so they can verify the pack was not altered.</p>
      </AdminPanel>
    </GrcPage>
  );
}

// ─── Settings: parameters, role assignments, role matrix ─────────────────────

type SettingsResponse = { settings: Row[]; editable_keys: string[]; roles: { role: GrcRole; label: string; permissions: string[] }[]; your_grc_roles: string[] };

function SettingEditor({ s }: { s: Row }) {
  const initial = JSON.stringify(s.value);
  const [value, setValue] = useState<unknown>(s.value);
  useEffect(() => setValue(s.value), [initial]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useGrcMutation(() => adminApi.patchJson("/api/admin/grc/settings", { key: s.key, value }));
  const dirty = JSON.stringify(value) !== initial;
  const obj = value && typeof value === "object" ? (value as Record<string, number>) : null;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs text-gray-500">{String(s.key)}</div>
          <div className="text-sm text-gray-800">{String(s.description ?? "")}</div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {obj ? Object.keys(obj).map((k) => (
            <label key={k} className="text-xs text-gray-600">{k}
              <input type="number" min={1} className={`${inputCls} w-20`} value={obj[k]} onChange={(e) => setValue({ ...obj, [k]: Number(e.target.value) })} />
            </label>
          )) : <input type="number" min={1} className={`${inputCls} w-28`} value={Number(value)} onChange={(e) => setValue(Number(e.target.value))} />}
          <button type="button" className={btnSecondary} disabled={!dirty || save.isPending} onClick={() => save.mutate(undefined)}>Save</button>
        </div>
      </div>
      <ErrorText error={save.error} />
    </li>
  );
}

function Assignments() {
  const { users, byId } = useDirectory();
  const { userId } = useGrcPermissions();
  const q = useQuery({ queryKey: ["grc", "assignments"], queryFn: () => adminApi.getJson<{ items: Row[]; roles: GrcRole[] }>("/api/admin/grc/assignments") });
  const [showInactive, setShowInactive] = useState(false);
  const [g, setG] = useState({ email: "", grc_role: "contributor", reason: "", expires_at: "" });
  const grant = useGrcMutation(
    () => adminApi.postJson("/api/admin/grc/assignments", { ...g, expires_at: g.expires_at ? new Date(`${g.expires_at}T23:59:59`).toISOString() : null }),
    () => setG({ email: "", grc_role: "contributor", reason: "", expires_at: "" }),
  );
  const [revoking, setRevoking] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const revoke = useGrcMutation(() => adminApi.patchJson(`/api/admin/grc/assignments/${String(revoking!.id)}`, { revoke: true, revoke_reason: reason }), () => { setRevoking(null); setReason(""); });
  const items = (q.data?.items ?? []).filter((a) => showInactive || a.is_active);
  return (
    <AdminPanel title="Who holds which GRC role">
      <p className="-mt-2 mb-4 text-sm text-gray-600">
        People must already have admin portal access (Settings → Admin team). Nobody can grant roles to themselves; conflicting pairs (e.g. contributor + approver) are blocked. Every change is logged.
      </p>
      <div className="grid gap-3 rounded-lg bg-gray-50 p-3 sm:grid-cols-5">
        <Field label="Person">
          <select className={inputCls} value={g.email} onChange={(e) => setG((s) => ({ ...s, email: e.target.value }))}>
            <option value="">Choose…</option>
            {users.filter((u) => u.email && u.id !== userId).map((u) => <option key={u.id} value={u.email!}>{userLabel(u)}{u.full_name ? ` (${u.email})` : ""}</option>)}
          </select>
        </Field>
        <Field label="Role">
          <select className={inputCls} value={g.grc_role} onChange={(e) => setG((s) => ({ ...s, grc_role: e.target.value }))}>
            {(q.data?.roles ?? []).map((r) => <option key={r} value={r}>{GRC_ROLE_LABELS[r]}</option>)}
          </select>
        </Field>
        <Field label="Reason" required><input className={inputCls} value={g.reason} onChange={(e) => setG((s) => ({ ...s, reason: e.target.value }))} placeholder="e.g. Owns backups" /></Field>
        <Field label="Expires" help="Optional; recommended for temporary access"><input type="date" min={new Date().toISOString().slice(0, 10)} className={inputCls} value={g.expires_at} onChange={(e) => setG((s) => ({ ...s, expires_at: e.target.value }))} /></Field>
        <div className="flex items-end"><button type="button" className={btnPrimary} disabled={grant.isPending || !g.email || g.reason.trim().length < 5} onClick={() => grant.mutate(undefined)}>Grant role</button></div>
      </div>
      <ErrorText error={grant.error} />
      <label className="mt-4 flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show revoked and expired</label>
      {q.isError ? <AdminRetryBlock message={errMsg(q.error)} onRetry={() => q.refetch()} /> : null}
      <table className="mt-2 min-w-full text-sm">
        <thead><tr className="text-left text-xs uppercase text-gray-500"><th className="py-2">Person</th><th>Role</th><th>Reason</th><th>Granted by</th><th>Expires</th><th>Status</th><th /></tr></thead>
        <tbody>
          {items.map((a) => (
            <tr key={String(a.id)} className="border-t border-gray-100">
              <td className="py-2">{userLabel(byId.get(String(a.user_id)), a.user_id)}</td>
              <td>{GRC_ROLE_LABELS[a.grc_role as GrcRole] ?? String(a.grc_role)}</td>
              <td className="text-gray-600">{String(a.reason ?? "")}</td>
              <td>{userLabel(byId.get(String(a.assigned_by)), a.assigned_by)} · {fmtDate(a.created_at)}</td>
              <td>{fmtDate(a.expires_at)}</td>
              <td>{a.is_active ? <Badge value="active" /> : <span className="text-xs text-gray-500">revoked {fmtDate(a.revoked_at)}{a.revoke_reason ? `: ${String(a.revoke_reason)}` : ""}</span>}</td>
              <td>{a.is_active && a.user_id !== userId ? <button type="button" className={btnDanger} onClick={() => setRevoking(a)}>Revoke</button> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {q.data && items.length === 0 ? <Empty>No assignments.</Empty> : null}
      <AdminModal open={!!revoking} onClose={() => setRevoking(null)} title="Revoke role" description={revoking ? `${userLabel(byId.get(String(revoking.user_id)), revoking.user_id)}: ${GRC_ROLE_LABELS[revoking.grc_role as GrcRole] ?? ""}` : ""} footer={null}>
        <div className="space-y-3">
          <Field label="Reason" required><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Changed team" /></Field>
          <ErrorText error={revoke.error} />
          <div className="flex justify-end gap-2">
            <button type="button" className={btnSecondary} onClick={() => setRevoking(null)}>Cancel</button>
            <button type="button" className={btnDanger} disabled={revoke.isPending || reason.trim().length < 5} onClick={() => revoke.mutate(undefined)}>Revoke</button>
          </div>
        </div>
      </AdminModal>
    </AdminPanel>
  );
}

export function GrcSettingsPage() {
  const { allowed } = useGrcGate();
  const { has } = useGrcPermissions();
  const q = useQuery({ queryKey: ["grc", "settings"], queryFn: () => adminApi.getJson<SettingsResponse>("/api/admin/grc/settings"), enabled: allowed && has("grc.settings.manage") });
  const [tab, setTab] = useState<"assignments" | "parameters" | "matrix">("assignments");
  if (allowed && !has("grc.settings.manage") && !has("grc.assignments.manage")) {
    return <GrcPage title="GRC settings"><AdminPanel title="Not available"><Empty>Only the ISMS manager can change GRC settings.</Empty></AdminPanel></GrcPage>;
  }
  const allPerms = Array.from(new Set((q.data?.roles ?? []).flatMap((r) => r.permissions))).sort();
  return (
    <GrcPage title="GRC settings" description="Roles, thresholds and SLAs for the ISMS.">
      <Tabs tabs={[{ id: "assignments", label: "Role assignments" }, { id: "parameters", label: "Thresholds & SLAs" }, { id: "matrix", label: "Role permissions" }]} value={tab} onChange={setTab} />
      {tab === "assignments" ? (has("grc.assignments.manage") ? <Assignments /> : <Empty>You cannot manage assignments.</Empty>) : null}
      {tab !== "assignments" && q.isLoading ? <AdminPageSkeleton /> : null}
      {tab !== "assignments" && q.isError ? <AdminRetryBlock message={errMsg(q.error)} onRetry={() => q.refetch()} /> : null}
      {tab === "parameters" && q.data ? (
        <AdminPanel title="Thresholds & SLAs">
          <ul className="divide-y divide-gray-100">
            {q.data.settings.filter((s) => q.data!.editable_keys.includes(String(s.key))).map((s) => <SettingEditor key={String(s.key)} s={s} />)}
          </ul>
        </AdminPanel>
      ) : null}
      {tab === "matrix" && q.data ? (
        <AdminPanel title="What each role can do">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr><th className="py-2 pr-3 text-left">Permission</th>{q.data.roles.map((r) => <th key={r.role} className="px-2 text-center font-medium">{r.label}</th>)}</tr>
              </thead>
              <tbody>
                {allPerms.map((p) => (
                  <tr key={p} className="border-t border-gray-100">
                    <td className="py-1.5 pr-3 font-mono">{p.replace(/^grc\./, "")}</td>
                    {q.data!.roles.map((r) => <td key={r.role} className="text-center">{r.permissions.includes(p) ? "●" : ""}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-gray-500">Every permission also requires MFA (AAL2). The database enforces this matrix; the UI only hides what you cannot do.</p>
        </AdminPanel>
      ) : null}
    </GrcPage>
  );
}

// ─── Setup checklist ─────────────────────────────────────────────────────────

const SETUP_LINKS: Record<string, string> = {
  admin: "/admin/grc/settings", approver: "/admin/grc/settings", roles: "/admin/grc/settings", owners: "/admin/grc/controls",
  policies: "/admin/grc/documents", soa: "/admin/grc/soa", vendors: "/admin/grc/vendors", risks: "/admin/grc/risks",
};

export function GrcSetupPage() {
  const { allowed } = useGrcGate();
  const q = useQuery({
    queryKey: ["grc", "setup"],
    queryFn: () => adminApi.getJson<{ steps: { id: string; label: string; done: boolean; detail?: string }[]; complete: boolean }>("/api/admin/grc/setup"),
    enabled: allowed,
  });
  return (
    <GrcPage title="Setup checklist" description="First-run steps for ISO 27001 / NIST CSF readiness. Each step is checked against live data.">
      {q.isLoading ? <AdminPageSkeleton /> : null}
      {q.isError ? <AdminRetryBlock message={errMsg(q.error)} onRetry={() => q.refetch()} /> : null}
      {q.data ? (
        <AdminPanel title={q.data.complete ? "Setup complete" : `${q.data.steps.filter((s) => s.done).length}/${q.data.steps.length} done`}>
          <ol className="space-y-3">
            {q.data.steps.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2">
                  <span className={s.done ? "text-emerald-600" : "text-amber-600"}>{s.done ? "✓" : "○"}</span>
                  <span className={s.done ? "text-gray-500" : "text-gray-900"}>{s.label}</span>
                  {s.detail ? <span className="text-xs text-gray-500">({s.detail})</span> : null}
                </span>
                {!s.done && SETUP_LINKS[s.id] ? <Link className={btnSecondary} to={adminSpaTo(SETUP_LINKS[s.id])}>Go</Link> : null}
              </li>
            ))}
          </ol>
          {!q.data.steps.find((s) => s.id === "seed")?.done ? (
            <p className="mt-4 text-sm text-gray-600">Loading the catalogue is done by engineering: run <code className="rounded bg-gray-100 px-1">pnpm grc:seed</code> against this environment after the migrations.</p>
          ) : null}
        </AdminPanel>
      ) : null}
    </GrcPage>
  );
}
