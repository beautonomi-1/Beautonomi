import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { GrcModuleKey } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  Badge, Empty, ErrorText, Field, btnDanger, btnPrimary, btnSecondary, fmtDate, grcAction, inputCls, sha256File,
  useDirectory, useGrcMutation, useGrcPermissions, userLabel, type DirectoryUser, type Row,
} from "./grcShared";

const EVIDENCE_TYPES: Record<string, string> = {
  "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg,.jpeg", "text/plain": ".txt", "text/csv": ".csv",
  "text/markdown": ".md", "application/json": ".json", "application/zip": ".zip",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};
const ACCEPT = Object.values(EVIDENCE_TYPES).join(",");
const MAX_BYTES = 50 * 1024 * 1024;

function dayOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function mimeFor(file: File): string | null {
  if (file.type && EVIDENCE_TYPES[file.type]) return file.type;
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const found = Object.entries(EVIDENCE_TYPES).find(([, exts]) => exts.split(",").includes(`.${ext}`));
  return found?.[0] ?? null;
}

function Section({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
        {actions}
      </div>
      {children}
    </section>
  );
}

async function openEvidence(id: string) {
  const r = await adminApi.getJson<{ url: string }>(`/api/admin/grc/evidence/${id}/download`);
  window.open(r.url, "_blank", "noopener");
}

export function EvidenceReview({ evidence }: { evidence: Row }) {
  const { has, userId } = useGrcPermissions();
  const [mode, setMode] = useState<"accepted" | "rejected" | null>(null);
  const [notes, setNotes] = useState("");
  const review = useGrcMutation(() => grcAction("evidence.review", { evidence_id: evidence.id, decision: mode, notes }), () => setMode(null));
  const own = evidence.submitted_by === userId;
  if (!has("grc.evidence.review") || evidence.review_status !== "pending") return null;
  if (own) return <span className="text-xs text-gray-500">You submitted this, so someone else must review it.</span>;
  if (!mode) {
    return (
      <span className="flex gap-2">
        <button type="button" className={btnSecondary} onClick={() => setMode("accepted")}>Accept</button>
        <button type="button" className={btnDanger} onClick={() => setMode("rejected")}>Reject</button>
      </span>
    );
  }
  return (
    <div className="mt-2 w-full space-y-2">
      <textarea className={inputCls} placeholder={mode === "rejected" ? "What is wrong, so the owner can fix it" : "Optional notes"} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <ErrorText error={review.error} />
      <div className="flex gap-2">
        <button type="button" className={mode === "rejected" ? btnDanger : btnPrimary} disabled={review.isPending} onClick={() => review.mutate(undefined)}>
          {mode === "rejected" ? "Reject evidence" : "Accept evidence"}
        </button>
        <button type="button" className={btnSecondary} onClick={() => setMode(null)}>Cancel</button>
      </div>
    </div>
  );
}

function EvidenceList({ evidence, byId }: { evidence: Row[]; byId: Map<string, DirectoryUser> }) {
  const { has } = useGrcPermissions();
  const [err, setErr] = useState<unknown>(null);
  if (!evidence.length) return <Empty>No evidence yet.</Empty>;
  return (
    <ul className="divide-y divide-gray-100">
      {evidence.map((e) => (
        <li key={String(e.id)} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
          <div className="min-w-0">
            <div className="font-medium text-gray-900">{String(e.title ?? e.file_name ?? "Evidence")}</div>
            <div className="text-xs text-gray-500">
              {fmtDate(e.created_at, true)} · {e.source === "collector" ? "automated collector" : userLabel(byId.get(String(e.submitted_by)), e.submitted_by)}
              {e.last_review_notes ? ` · “${String(e.last_review_notes)}”` : ""}
            </div>
            <div className="font-mono text-[10px] text-gray-400">sha256 {String(e.content_sha256).slice(0, 16)}…</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge value={e.source} />
            <Badge value={e.review_status} />
            {has("grc.evidence.view") ? <button type="button" className={btnSecondary} onClick={() => openEvidence(String(e.id)).catch(setErr)}>Open</button> : null}
            <EvidenceReview evidence={e} />
          </div>
        </li>
      ))}
      <ErrorText error={err} />
    </ul>
  );
}

function EvidenceUpload({ controlId }: { controlId: string }) {
  const [kind, setKind] = useState<"file" | "note">("file");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [progress, setProgress] = useState("");

  const submit = useGrcMutation(async () => {
    const period = { period_start: periodStart || null, period_end: periodEnd || null };
    if (kind === "note") {
      return adminApi.postJson("/api/admin/grc/evidence/note", { control_id: controlId, title, body_markdown: body, ...period });
    }
    if (!file) throw new Error("Choose a file");
    const mime = mimeFor(file);
    if (!mime) throw new Error("That file type is not accepted. Use PDF, image, text, CSV, Markdown, JSON, ZIP, XLSX or DOCX.");
    if (file.size > MAX_BYTES) throw new Error("Files must be 50 MB or smaller");
    setProgress("Fingerprinting…");
    const sha256 = await sha256File(file);
    const slot = await adminApi.postJson<{ path: string; exists: boolean; token: string | null }>("/api/admin/grc/evidence/upload-url", { control_id: controlId, sha256, size_bytes: file.size, mime_type: mime });
    if (!slot.exists) {
      setProgress("Uploading…");
      const sb = getSupabaseBrowserClient();
      if (!sb || !slot.token) throw new Error("Upload is not available in this browser session");
      const { error } = await sb.storage.from("grc-evidence").uploadToSignedUrl(slot.path, slot.token, file, { contentType: mime });
      if (error) throw new Error(`Upload failed: ${error.message}`);
    }
    setProgress("Verifying…");
    return adminApi.postJson("/api/admin/grc/evidence", { control_id: controlId, sha256, title: title || file.name, file_name: file.name, mime_type: mime, ...period });
  }, () => {
    setFile(null);
    setTitle("");
    setBody("");
    setProgress("");
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1"><input type="radio" checked={kind === "file"} onChange={() => setKind("file")} /> Upload a file</label>
        <label className="flex items-center gap-1"><input type="radio" checked={kind === "note"} onChange={() => setKind("note")} /> Write an attestation</label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {kind === "file" ? (
          <Field label="File" help="Screenshots, exports, reports. Max 50 MB. The file is fingerprinted (SHA-256) before upload and verified after.">
            <input type="file" accept={ACCEPT} className="text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
        ) : null}
        <Field label="Title" required={kind === "note"}>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "file" ? "Defaults to the file name" : "e.g. Q3 backup restore test"} />
        </Field>
        <Field label="Covers from"><input type="date" className={inputCls} value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></Field>
        <Field label="Covers to"><input type="date" className={inputCls} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></Field>
      </div>
      {kind === "note" ? (
        <Field label="What was done" required help="When, by whom, what the result was, and where the underlying record lives (ticket, doc, dashboard).">
          <textarea className={`${inputCls} min-h-[120px]`} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
      ) : null}
      <ErrorText error={submit.error} />
      {submit.isSuccess ? <p className="text-sm text-emerald-700">Evidence recorded. A reviewer will check it.</p> : null}
      <button type="button" className={btnPrimary} disabled={submit.isPending || (kind === "file" ? !file : !title || body.length < 30)} onClick={() => submit.mutate(undefined)}>
        {submit.isPending ? progress || "Submitting…" : "Submit evidence"}
      </button>
    </div>
  );
}

function ControlExtras({ item, related, byId }: { item: Row; related: Record<string, Row[]>; byId: Map<string, DirectoryUser> }) {
  const { has } = useGrcPermissions();
  const reqs = related.requirements ?? [];
  const requests = (related.requests ?? []).filter((r) => r.status === "open");
  return (
    <>
      <Section title="Framework requirements met by this control">
        {reqs.length ? (
          <div className="flex flex-wrap gap-1.5">
            {reqs.map((r) => {
              const req = r.grc_requirements as Row | null;
              return (
                <span key={String(r.requirement_id)} title={String(req?.title ?? "")} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                  {String(req?.framework_id ?? "").toUpperCase()} {String(req?.ref_code ?? r.requirement_id)}
                </span>
              );
            })}
          </div>
        ) : <Empty>Not mapped to any requirement.</Empty>}
      </Section>
      {requests.length ? (
        <Section title="Open evidence requests">
          <ul className="space-y-1 text-sm">
            {requests.map((r) => (
              <li key={String(r.id)}>{String(r.title)} — due {fmtDate(r.due_at)} · {userLabel(byId.get(String(r.assignee_user_id)), r.assignee_user_id)}</li>
            ))}
          </ul>
        </Section>
      ) : null}
      <Section title="Evidence">
        <EvidenceList evidence={related.evidence ?? []} byId={byId} />
      </Section>
      {has("grc.evidence.submit") && item.status !== "not_applicable" ? (
        <Section title="Add evidence"><EvidenceUpload controlId={String(item.id)} /></Section>
      ) : null}
      {(related.risks ?? []).length ? (
        <Section title="Risks this control treats">
          <ul className="space-y-1 text-sm">
            {(related.risks ?? []).map((r) => {
              const risk = r.grc_risks as Row | null;
              return <li key={String(r.risk_id)}>{String(risk?.title ?? r.risk_id)} <Badge value={risk?.status} /></li>;
            })}
          </ul>
        </Section>
      ) : null}
    </>
  );
}

function DocumentExtras({ item, related, byId }: { item: Row; related: Record<string, Row[]>; byId: Map<string, DirectoryUser> }) {
  const { has, userId } = useGrcPermissions();
  const versions = related.versions ?? [];
  const acks = related.acknowledgements ?? [];
  const draft = versions.find((v) => v.status === "draft");
  const inReview = versions.find((v) => v.status === "in_review");
  const current = versions.find((v) => v.id === item.current_version_id);
  const [body, setBody] = useState(String(draft?.body_markdown ?? ""));
  const [summary, setSummary] = useState(String(draft?.change_summary ?? ""));
  const draftId = draft ? String(draft.id) : null;
  useEffect(() => {
    setBody(String(draft?.body_markdown ?? ""));
    setSummary(String(draft?.change_summary ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);
  const [nextReview, setNextReview] = useState("");
  const [newVersion, setNewVersion] = useState(false);
  const [newSummary, setNewSummary] = useState("");

  const saveDraft = useGrcMutation(() => grcAction("document.update_draft", { version_id: draft!.id, body_markdown: body, change_summary: summary }));
  const submit = useGrcMutation(() => grcAction("document.submit", { version_id: draft!.id }));
  const approve = useGrcMutation(() => grcAction("document.approve", { version_id: inReview!.id, next_review_at: nextReview || null }));
  const ack = useGrcMutation(() => grcAction("document.acknowledge", { version_id: current!.id }));
  const create = useGrcMutation(() => grcAction("document.new_version", { document_id: item.id, body_markdown: String(current?.body_markdown ?? ""), change_summary: newSummary }), () => setNewVersion(false));

  const acked = current ? acks.some((a) => a.document_version_id === current.id && a.user_id === userId) : false;
  const ackCount = current ? acks.filter((a) => a.document_version_id === current.id).length : 0;

  return (
    <>
      <Section title="Versions">
        <table className="min-w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-gray-500"><th className="py-1">Version</th><th>Status</th><th>Author</th><th>Approved by</th><th>Summary</th></tr></thead>
          <tbody>
            {versions.map((v) => (
              <tr key={String(v.id)} className="border-t border-gray-100">
                <td className="py-1.5">v{String(v.version_number)}{v.id === item.current_version_id ? " (current)" : ""}</td>
                <td><Badge value={v.status} /></td>
                <td>{userLabel(byId.get(String(v.author_user_id)), v.author_user_id)}</td>
                <td>{v.approved_by ? `${userLabel(byId.get(String(v.approved_by)), v.approved_by)} · ${fmtDate(v.approved_at)}` : "—"}</td>
                <td className="text-gray-600">{String(v.change_summary ?? "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {current && item.requires_acknowledgement ? (
        <Section title="Acknowledgement" actions={<span className="text-xs text-gray-500">{ackCount} people have acknowledged v{String(current.version_number)}</span>}>
          {acked ? <p className="text-sm text-emerald-700">You have acknowledged the current version.</p> : (
            <div className="space-y-2">
              <p className="text-sm text-gray-700">Read the current version below, then confirm you have read and understood it.</p>
              <ErrorText error={ack.error} />
              <button type="button" className={btnPrimary} disabled={ack.isPending} onClick={() => ack.mutate(undefined)}>I have read and understood this policy</button>
            </div>
          )}
        </Section>
      ) : null}

      {draft && has("grc.documents.edit") ? (
        <Section title={`Draft v${String(draft.version_number)}`}>
          <div className="space-y-3">
            <textarea className={`${inputCls} min-h-[280px] font-mono`} value={body} onChange={(e) => setBody(e.target.value)} />
            <Field label="What changed"><input className={inputCls} value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>
            <ErrorText error={saveDraft.error ?? submit.error} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnSecondary} disabled={saveDraft.isPending} onClick={() => saveDraft.mutate(undefined)}>Save draft</button>
              <button type="button" className={btnPrimary} disabled={submit.isPending || body !== String(draft.body_markdown ?? "")} title={body !== String(draft.body_markdown ?? "") ? "Save the draft first" : ""} onClick={() => submit.mutate(undefined)}>Submit for approval</button>
            </div>
          </div>
        </Section>
      ) : null}

      {inReview ? (
        <Section title={`v${String(inReview.version_number)} awaiting approval`}>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs">{String(inReview.body_markdown)}</pre>
          {has("grc.documents.approve") ? (
            inReview.author_user_id === userId ? <p className="mt-2 text-xs text-gray-500">You wrote this version, so someone else must approve it.</p> : (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <Field label="Next review" help="Defaults to 12 months"><input type="date" className={inputCls} value={nextReview} onChange={(e) => setNextReview(e.target.value)} /></Field>
                <button type="button" className={btnPrimary} disabled={approve.isPending} onClick={() => approve.mutate(undefined)}>Approve and publish</button>
                <ErrorText error={approve.error} />
              </div>
            )
          ) : null}
        </Section>
      ) : null}

      {current ? (
        <Section title={`Current policy (v${String(current.version_number)})`}>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs">{String(current.body_markdown)}</pre>
          {!draft && !inReview && has("grc.documents.edit") ? (
            newVersion ? (
              <div className="mt-3 space-y-2">
                <Field label="Why a new version?" required><input className={inputCls} value={newSummary} onChange={(e) => setNewSummary(e.target.value)} placeholder="e.g. Annual review; updated vendor list" /></Field>
                <ErrorText error={create.error} />
                <div className="flex gap-2">
                  <button type="button" className={btnPrimary} disabled={create.isPending || newSummary.trim().length < 5} onClick={() => create.mutate(undefined)}>Create draft from current</button>
                  <button type="button" className={btnSecondary} onClick={() => setNewVersion(false)}>Cancel</button>
                </div>
              </div>
            ) : <button type="button" className={`${btnSecondary} mt-3`} onClick={() => setNewVersion(true)}>Start a new version</button>
          ) : null}
        </Section>
      ) : null}
    </>
  );
}

function AcceptanceDecision({ acceptance }: { acceptance: Row }) {
  const { roles, userId } = useGrcPermissions();
  const [notes, setNotes] = useState("");
  const decide = useGrcMutation((approve: boolean) => grcAction("risk.decide_acceptance", { acceptance_id: acceptance.id, approve, notes }));
  if (acceptance.status !== "pending" || !roles.includes("management_approver")) return null;
  if (acceptance.risk_manager_id === userId) return <p className="text-xs text-gray-500">You proposed this, so another approver must decide.</p>;
  return (
    <div className="mt-2 space-y-2">
      <textarea className={inputCls} placeholder="Decision notes (required)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <ErrorText error={decide.error} />
      <div className="flex gap-2">
        <button type="button" className={btnPrimary} disabled={decide.isPending || notes.trim().length < 10} onClick={() => decide.mutate(true)}>Approve acceptance</button>
        <button type="button" className={btnDanger} disabled={decide.isPending || notes.trim().length < 10} onClick={() => decide.mutate(false)}>Reject</button>
      </div>
    </div>
  );
}

function RiskExtras({ item, related, byId }: { item: Row; related: Record<string, Row[]>; byId: Map<string, DirectoryUser> }) {
  const { has, roles } = useGrcPermissions();
  const acceptances = related.acceptances ?? [];
  const controls = related.controls ?? [];
  const [rationale, setRationale] = useState("");
  const [expires, setExpires] = useState("");
  const [linkId, setLinkId] = useState("");
  const controlList = useQuery({
    queryKey: ["grc", "records", "controls", "picker"],
    queryFn: () => adminApi.getJson<{ items: Row[] }>("/api/admin/grc/records/controls"),
    enabled: has("grc.risks.edit") && has("grc.controls.view"),
  });
  const propose = useGrcMutation(() => grcAction("risk.propose_acceptance", { risk_id: item.id, rationale, expires_at: expires }), () => setRationale(""));
  const link = useGrcMutation((control_id: string) => grcAction("risk.link_control", { risk_id: item.id, control_id }), () => setLinkId(""));
  const unlink = useGrcMutation((control_id: string) => grcAction("risk.unlink_control", { risk_id: item.id, control_id }));
  const pending = acceptances.some((a) => a.status === "pending");
  const canPropose = has("grc.risks.accept") && roles.includes("risk_manager") && item.status !== "accepted" && item.status !== "closed" && !pending;

  return (
    <>
      <Section title="Treated by controls">
        {controls.length ? (
          <ul className="space-y-1 text-sm">
            {controls.map((c) => {
              const ctl = c.grc_controls as Row | null;
              return (
                <li key={String(c.control_id)} className="flex items-center justify-between gap-2">
                  <span>{String(c.control_id)} · {String(ctl?.title ?? "")} <Badge value={ctl?.status} /></span>
                  {has("grc.risks.edit") ? <button type="button" className={btnSecondary} onClick={() => unlink.mutate(String(c.control_id))}>Unlink</button> : null}
                </li>
              );
            })}
          </ul>
        ) : <Empty>No controls linked. Link the controls that reduce this risk.</Empty>}
        {has("grc.risks.edit") && controlList.data ? (
          <div className="mt-3 flex gap-2">
            <select className={inputCls} value={linkId} onChange={(e) => setLinkId(e.target.value)}>
              <option value="">Link a control…</option>
              {controlList.data.items.filter((c) => !controls.some((x) => x.control_id === c.id)).map((c) => <option key={String(c.id)} value={String(c.id)}>{String(c.id)} · {String(c.title)}</option>)}
            </select>
            <button type="button" className={btnSecondary} disabled={!linkId || link.isPending} onClick={() => link.mutate(linkId)}>Link</button>
          </div>
        ) : null}
        <ErrorText error={link.error ?? unlink.error} />
      </Section>

      <Section title="Risk acceptance">
        {item.above_appetite ? <p className="mb-2 text-sm text-amber-800">This risk is above appetite: acceptance needs a management approver.</p> : <p className="mb-2 text-sm text-gray-600">Below appetite: a risk manager's acceptance is recorded without further approval.</p>}
        {acceptances.length ? (
          <ul className="mb-3 divide-y divide-gray-100 text-sm">
            {acceptances.map((a) => (
              <li key={String(a.id)} className="py-2">
                <div className="flex flex-wrap items-center gap-2"><Badge value={a.status} /> proposed by {userLabel(byId.get(String(a.risk_manager_id)), a.risk_manager_id)} · {fmtDate(a.proposed_at)} · expires {fmtDate(a.expires_at)}</div>
                <p className="mt-1 text-gray-700">{String(a.notes ?? "")}</p>
                {a.decision_notes ? <p className="text-xs text-gray-500">Decision: {String(a.decision_notes)} ({userLabel(byId.get(String(a.management_approver_id)), a.management_approver_id)})</p> : null}
                <AcceptanceDecision acceptance={a} />
              </li>
            ))}
          </ul>
        ) : null}
        {canPropose ? (
          <div className="space-y-2">
            <Field label="Why accept instead of treating?" required><textarea className={inputCls} value={rationale} onChange={(e) => setRationale(e.target.value)} /></Field>
            <Field label="Acceptance expires" required help="Within 12 months. Accepted risks reopen for review on this date."><input type="date" className={inputCls} min={dayOffset(1)} max={dayOffset(365)} value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
            <ErrorText error={propose.error} />
            <button type="button" className={btnPrimary} disabled={propose.isPending || rationale.trim().length < 20 || !expires} onClick={() => propose.mutate(undefined)}>Propose acceptance</button>
          </div>
        ) : null}
      </Section>
    </>
  );
}

function FindingExtras({ item, related }: { item: Row; related: Record<string, Row[]> }) {
  const { has } = useGrcPermissions();
  const [notes, setNotes] = useState("");
  const [retest, setRetest] = useState("");
  const serious = item.severity === "critical" || item.severity === "high";
  const evidence = useQuery({
    queryKey: ["grc", "records", "evidence", "retest", item.control_id ?? ""],
    queryFn: () => adminApi.getJson<{ items: Row[] }>(`/api/admin/grc/records/evidence${item.control_id ? `?control_id=${encodeURIComponent(String(item.control_id))}` : ""}`),
    enabled: has("grc.findings.close") && has("grc.evidence.view") && item.status !== "closed",
  });
  const close = useGrcMutation(() => grcAction("finding.close", { finding_id: item.id, closure_notes: notes, retest_evidence_id: retest || null }));
  return (
    <>
      {(related.corrective_actions ?? []).length ? (
        <Section title="Corrective actions">
          <ul className="space-y-1 text-sm">{(related.corrective_actions ?? []).map((a) => <li key={String(a.id)}>{String(a.title)} <Badge value={a.status} /> due {fmtDate(a.due_at)}</li>)}</ul>
        </Section>
      ) : null}
      {item.status === "closed" ? (
        <Section title="Closure"><p className="text-sm text-gray-700">{String(item.closure_notes ?? "")}</p><p className="text-xs text-gray-500">Closed {fmtDate(item.closed_at)}</p></Section>
      ) : has("grc.findings.close") ? (
        <Section title="Close this finding">
          <div className="space-y-2">
            <Field label="How was it fixed?" required><textarea className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
            <Field label={serious ? "Retest evidence (required for critical/high)" : "Retest evidence"} required={serious} help="Upload the retest result as evidence on the related control first.">
              <select className={inputCls} value={retest} onChange={(e) => setRetest(e.target.value)}>
                <option value="">—</option>
                {(evidence.data?.items ?? []).slice(0, 100).map((e) => <option key={String(e.id)} value={String(e.id)}>{String(e.control_id)} · {String(e.title ?? e.id)} · {fmtDate(e.created_at)}</option>)}
              </select>
            </Field>
            <ErrorText error={close.error} />
            <button type="button" className={btnPrimary} disabled={close.isPending || notes.trim().length < 10 || (serious && !retest)} onClick={() => close.mutate(undefined)}>Close finding</button>
          </div>
        </Section>
      ) : null}
    </>
  );
}

function AccessReviewExtras({ related }: { related: Record<string, Row[]> }) {
  const { has, userId } = useGrcPermissions();
  const items = related.items ?? [];
  const [notes, setNotes] = useState<Record<string, string>>({});
  const decide = useGrcMutation((v: { id: string; decision: string }) => grcAction("access_review.decide", { item_id: v.id, decision: v.decision, notes: notes[v.id] ?? "" }));
  const decided = items.filter((i) => i.decision).length;
  return (
    <Section title={`People with admin access (${decided}/${items.length} decided)`}>
      <p className="mb-3 text-sm text-gray-600">For each person, confirm their platform role and GRC roles are still needed. Modify or revoke raises a follow-up finding for the change to be made.</p>
      <ul className="divide-y divide-gray-100">
        {items.map((i) => {
          const id = String(i.id);
          const self = i.subject_user_id === userId;
          return (
            <li key={id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium text-gray-900">{String(i.subject_email ?? i.subject_user_id)}</div>
                  <div className="text-xs text-gray-500">
                    {String(i.platform_role ?? "")}{(i.grc_roles as string[] | null)?.length ? ` · GRC: ${(i.grc_roles as string[]).join(", ")}` : ""} · last sign-in {fmtDate(i.subject_last_login_at)}
                  </div>
                </div>
                {i.decision ? <Badge value={i.decision} /> : null}
              </div>
              {!i.decision && has("grc.access_reviews.decide") ? (
                self ? <p className="mt-1 text-xs text-gray-500">This is you; someone else must review your access.</p> : (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input className={`${inputCls} max-w-md`} placeholder="Notes (required for modify/revoke)" value={notes[id] ?? ""} onChange={(e) => setNotes((s) => ({ ...s, [id]: e.target.value }))} />
                    <button type="button" className={btnSecondary} disabled={decide.isPending} onClick={() => decide.mutate({ id, decision: "keep" })}>Keep</button>
                    <button type="button" className={btnSecondary} disabled={decide.isPending} onClick={() => decide.mutate({ id, decision: "modify" })}>Modify</button>
                    <button type="button" className={btnDanger} disabled={decide.isPending} onClick={() => decide.mutate({ id, decision: "revoke" })}>Revoke</button>
                  </div>
                )
              ) : i.notes ? <p className="mt-1 text-xs text-gray-600">“{String(i.notes)}”</p> : null}
            </li>
          );
        })}
      </ul>
      <ErrorText error={decide.error} />
    </Section>
  );
}

function ManagementReviewExtras({ item }: { item: Row }) {
  const { roles, userId } = useGrcPermissions();
  const approve = useGrcMutation(() => grcAction("management_review.approve", { review_id: item.id }));
  if (item.status === "approved") return <Section title="Sign-off"><p className="text-sm text-emerald-700">Signed off {fmtDate(item.approved_at)}. The record is locked.</p></Section>;
  if (!roles.includes("management_approver")) return null;
  return (
    <Section title="Sign-off">
      {item.created_by === userId ? <p className="text-sm text-gray-500">You recorded these minutes, so another management approver must sign them off.</p> : (
        <>
          <p className="mb-2 text-sm text-gray-600">Signing off confirms the minutes cover the ISO 27001 clause 9.3 inputs and decisions. The record then locks.</p>
          <ErrorText error={approve.error} />
          <button type="button" className={btnPrimary} disabled={approve.isPending} onClick={() => approve.mutate(undefined)}>Sign off management review</button>
        </>
      )}
    </Section>
  );
}

export function RecordExtras({ module, item, related }: { module: GrcModuleKey; item: Row; related: Record<string, Row[]>; users: DirectoryUser[] }) {
  const { byId } = useDirectory();
  switch (module) {
    case "controls":
      return <ControlExtras item={item} related={related} byId={byId} />;
    case "documents":
      return <DocumentExtras item={item} related={related} byId={byId} />;
    case "risks":
      return <RiskExtras item={item} related={related} byId={byId} />;
    case "risk_acceptances":
      return <Section title="Decision"><AcceptanceDecision acceptance={item} /></Section>;
    case "findings":
      return <FindingExtras item={item} related={related} />;
    case "access_reviews":
      return <AccessReviewExtras related={related} />;
    case "management_reviews":
      return <ManagementReviewExtras item={item} />;
    case "evidence":
      return (
        <Section title="Evidence">
          <EvidenceList evidence={[item]} byId={byId} />
        </Section>
      );
    default:
      return null;
  }
}
