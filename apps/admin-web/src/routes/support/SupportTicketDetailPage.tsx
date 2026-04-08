import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_SUPPORT } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import { SUPPORT_TICKET_CATEGORY_GROUPS } from "@/lib/supportTicketCategories";
import { SUPPORT_TICKET_CANNED_RESPONSES } from "@/lib/supportTicketCannedResponses";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToast } from "@/lib/adminToast";
import { adminToolbarButtonClass } from "@/lib/adminUi";

type Assignee = { id: string; email: string | null; full_name: string | null; role: string };

type TicketRow = Record<string, unknown> & {
  id?: string;
  ticket_number?: string;
  subject?: string;
  description?: string;
  category?: string | null;
  priority?: string;
  status?: string;
  user_id?: string | null;
  provider_id?: string | null;
  assigned_to?: string | null;
  tags?: string[] | null;
  sla_resolution_due_at?: string | null;
  first_staff_reply_at?: string | null;
  last_customer_reply_at?: string | null;
  csat_score?: number | null;
  csat_comment?: string | null;
  created_at?: string;
  updated_at?: string;
  user?: { id?: string; email?: string; full_name?: string | null } | null;
  provider?: { id?: string; business_name?: string | null } | null;
  assigned_user?: { id?: string; email?: string; full_name?: string | null } | null;
};

type AttachmentItem = { url: string; name?: string; type?: string; size?: number };

type MessageRow = Record<string, unknown> & {
  id?: string;
  user_id?: string | null;
  message?: string;
  is_internal?: boolean;
  created_at?: string;
  attachments?: unknown;
  user?: { email?: string; full_name?: string | null } | null;
};

type NoteRow = Record<string, unknown> & {
  id?: string;
  note?: string;
  is_private?: boolean;
  created_at?: string;
  user?: { email?: string; full_name?: string | null } | null;
};

type TicketBundle = {
  ticket: TicketRow;
  messages: MessageRow[];
  notes: NoteRow[];
};

const STATUSES = ["open", "in_progress", "waiting_customer", "resolved", "closed"] as const;
const PRIORITIES = ["urgent", "high", "medium", "low"] as const;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function isSlaBreached(ticket: TicketRow): boolean {
  const due = ticket.sla_resolution_due_at;
  if (!due) return false;
  const st = str(ticket.status);
  if (st === "resolved" || st === "closed") return false;
  return new Date(due).getTime() < Date.now();
}

function attachmentsFromRow(raw: unknown): AttachmentItem[] {
  if (!Array.isArray(raw)) return [];
  const out: AttachmentItem[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const url = typeof o.url === "string" ? o.url : "";
    if (!url) continue;
    out.push({
      url,
      name: typeof o.name === "string" ? o.name : undefined,
      type: typeof o.type === "string" ? o.type : undefined,
      size: typeof o.size === "number" ? o.size : undefined,
    });
  }
  return out;
}

export function SupportTicketDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_SUPPORT, "Support access is required.");

  const [reply, setReply] = useState("");
  const [replyInternal, setReplyInternal] = useState(false);
  const [replyAttachments, setReplyAttachments] = useState<AttachmentItem[]>([]);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [noteBody, setNoteBody] = useState("");
  const [patchError, setPatchError] = useState<string | null>(null);
  const [tagsInput, setTagsInput] = useState("");
  const [csatScore, setCsatScore] = useState<number | "">("");
  const [csatCommentDraft, setCsatCommentDraft] = useState("");

  const detailQ = useQuery({
    queryKey: adminQueryKeys.supportTicketDetail(id),
    queryFn: () =>
      adminApi.getJson<TicketBundle>(`/api/admin/support-tickets/${encodeURIComponent(id)}`, { timeoutMs: 60_000 }),
    enabled: allowed && !!id,
  });

  const assigneesQ = useQuery({
    queryKey: adminQueryKeys.supportTicketAssignees(),
    queryFn: () => adminApi.getJson<{ assignees: Assignee[] }>("/api/admin/support-ticket-assignees", { timeoutMs: 30_000 }),
    enabled: allowed && !!id && !detailQ.isLoading,
  });

  const invalidateTicket = () => {
    void qc.invalidateQueries({ queryKey: adminQueryKeys.supportTicketDetail(id) });
    void qc.invalidateQueries({ queryKey: adminQueryKeys.supportTickets.all() });
  };

  const patchTicket = useMutation({
    mutationFn: (body: {
      status?: string;
      priority?: string;
      assigned_to?: string | null;
      category?: string | null;
      tags?: string[];
      csat_score?: number | null;
      csat_comment?: string | null;
      sla_resolution_due_at?: string | null;
    }) => adminApi.patchJson<{ ticket?: TicketRow }>(`/api/admin/support-tickets/${encodeURIComponent(id)}`, body),
    onSuccess: () => {
      setPatchError(null);
      invalidateTicket();
    },
    onError: (e: Error) => {
      setPatchError(e.message);
      adminToast.error(e.message);
    },
  });

  const sendMessage = useMutation({
    mutationFn: () =>
      adminApi.postJson(`/api/admin/support-tickets/${encodeURIComponent(id)}/messages`, {
        message: reply.trim(),
        is_internal: replyInternal,
        attachments: replyAttachments,
      }),
    onSuccess: () => {
      const wasInternal = replyInternal;
      setReply("");
      setReplyInternal(false);
      setReplyAttachments([]);
      setUploadErr(null);
      invalidateTicket();
      adminToast.success(wasInternal ? "Internal reply saved" : "Reply sent");
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  async function onPickFiles(files: FileList | null) {
    if (!files?.length || !id) return;
    setUploadErr(null);
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append("files", f);
      const res = await fetch(`/api/admin/support-tickets/${encodeURIComponent(id)}/upload`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { attachments?: AttachmentItem[] };
        error?: string | { message?: string };
      };
      if (!res.ok) {
        const msg =
          typeof json.error === "string"
            ? json.error
            : json.error && typeof json.error === "object" && json.error.message
              ? String(json.error.message)
              : `Upload failed (${res.status})`;
        throw new Error(msg);
      }
      const next = json.data?.attachments ?? [];
      if (!next.length) throw new Error("No files were uploaded");
      setReplyAttachments((prev) => [...prev, ...next]);
      adminToast.success(next.length === 1 ? "File attached" : `${next.length} files attached`);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setUploadErr(msg);
      adminToast.error(msg);
    } finally {
      setUploading(false);
    }
  }

  const addNote = useMutation({
    mutationFn: () =>
      adminApi.postJson(`/api/admin/support-tickets/${encodeURIComponent(id)}/notes`, {
        note: noteBody.trim(),
        is_private: true,
      }),
    onSuccess: () => {
      setNoteBody("");
      invalidateTicket();
      adminToast.success("Note added");
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const syncedTicket = detailQ.data?.ticket;
  useEffect(() => {
    if (!syncedTicket?.id) return;
    setTagsInput(((syncedTicket.tags as string[] | null | undefined) ?? []).join(", "));
    const sc = syncedTicket.csat_score;
    setCsatScore(typeof sc === "number" ? sc : "");
    setCsatCommentDraft(typeof syncedTicket.csat_comment === "string" ? syncedTicket.csat_comment : "");
  }, [syncedTicket?.id, syncedTicket?.tags, syncedTicket?.csat_score, syncedTicket?.csat_comment]);

  if (denied) return denied;
  if (!id) return <AdminRetryBlock message="Missing ticket id" onRetry={() => {}} />;

  if (detailQ.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Support ticket" />
        <AdminPanel>
          <AdminPageSkeleton rows={4} />
        </AdminPanel>
      </div>
    );
  }

  if (detailQ.error) {
    if (isAdminApiAuthFailure(detailQ.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={detailQ.error.message} onRetry={() => void detailQ.refetch()} />;
  }

  const bundle = detailQ.data;
  const ticket = bundle?.ticket;

  if (!ticket) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Support ticket" />
        <AdminPanel>
          <p className="text-sm text-gray-600">Ticket not found.</p>
        </AdminPanel>
      </div>
    );
  }

  const messages = bundle?.messages ?? [];
  const notes = bundle?.notes ?? [];
  const assignees = assigneesQ.data?.assignees ?? [];
  const assignedId = ticket.assigned_to == null ? "" : str(ticket.assigned_to);
  const assigneeInList = assignedId && assignees.some((a) => a.id === assignedId);
  const customerUserId = ticket.user_id == null ? null : str(ticket.user_id);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={str(ticket.subject) || "Support ticket"}
        description={`#${str(ticket.ticket_number)} · ${str(ticket.status).replace(/_/g, " ")}`}
        actions={
          <Link
            to={adminSpaTo("/admin/support-tickets")}
            className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 shadow-sm ring-1 ring-gray-950/[0.04] hover:bg-gray-50"
          >
            ← Queue
          </Link>
        }
      />

      {patchError ? (
        <p className="text-sm text-red-700" role="alert">
          {patchError}
        </p>
      ) : null}
      <AdminMutationAlert
        errors={[
          sendMessage.error instanceof Error ? sendMessage.error : null,
          addNote.error instanceof Error ? addNote.error : null,
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <AdminPanel className="lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900">Conversation</h2>
          <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">{str(ticket.description)}</p>
          <ul className="mt-6 space-y-3 border-t border-gray-100 pt-4">
            {messages.length === 0 ? (
              <li className="text-sm text-gray-500">No messages yet.</li>
            ) : (
              messages.map((m) => {
                const internal = Boolean(m.is_internal);
                const uid = m.user_id == null ? null : str(m.user_id);
                const fromCustomer = !internal && customerUserId !== null && uid === customerUserId;
                const fromStaff = !internal && !fromCustomer;
                const bubble =
                  internal
                    ? "border-amber-200 bg-amber-50/90"
                    : fromStaff
                      ? "border-blue-200 bg-blue-50/90"
                      : "border-gray-200 bg-gray-50/90";
                const atts = attachmentsFromRow(m.attachments);
                const roleLabel = internal ? "Internal" : fromCustomer ? "Customer" : "Support";
                return (
                  <li key={str(m.id)} className={`flex w-full ${fromStaff ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[min(100%,42rem)] rounded-xl border p-3 ${bubble}`}>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span className="font-medium text-gray-700">{roleLabel}</span>
                        <span>·</span>
                        <span>{m.user?.full_name || m.user?.email || "User"}</span>
                        <span>·</span>
                        <span>{m.created_at ? new Date(String(m.created_at)).toLocaleString() : "—"}</span>
                        {internal ? (
                          <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-amber-950">Not visible to customer</span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm text-gray-800 whitespace-pre-wrap">{str(m.message)}</p>
                      {atts.length > 0 ? (
                        <ul className="mt-2 space-y-1 border-t border-dashed border-gray-200 pt-2 text-xs">
                          {atts.map((a) => (
                            <li key={a.url}>
                              <a
                                href={a.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-primary underline"
                              >
                                {a.name || "Attachment"}
                              </a>
                              {a.size != null ? <span className="text-gray-500"> ({Math.round(a.size / 1024)} KB)</span> : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </li>
                );
              })
            )}
          </ul>

          <div className="mt-6 space-y-3 border-t border-gray-100 pt-4">
            <label className="block text-sm font-medium text-gray-700">Reply</label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500">Snippet</span>
              <select
                className="max-w-xs rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800"
                defaultValue=""
                aria-label="Insert canned reply"
                onChange={(e) => {
                  const label = e.target.value;
                  e.target.value = "";
                  if (!label) return;
                  const snippet = SUPPORT_TICKET_CANNED_RESPONSES.find((c) => c.label === label);
                  if (!snippet) return;
                  setReply((prev) => (prev.trim() ? `${prev.trim()}\n\n${snippet.body}` : snippet.body));
                }}
              >
                <option value="">Insert canned reply…</option>
                {SUPPORT_TICKET_CANNED_RESPONSES.map((c) => (
                  <option key={c.label} value={c.label}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              className="w-full min-h-[100px] rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Type a reply to the customer…"
            />
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={replyInternal} onChange={(e) => setReplyInternal(e.target.checked)} />
              Internal note (not visible to customer)
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                multiple
                className="text-sm text-gray-700"
                disabled={uploading}
                onChange={(e) => void onPickFiles(e.target.files)}
              />
              {uploading ? <span className="text-xs text-gray-500">Uploading…</span> : null}
            </div>
            {uploadErr ? <p className="text-sm text-red-600">{uploadErr}</p> : null}
            {replyAttachments.length > 0 ? (
              <ul className="text-xs text-gray-600">
                {replyAttachments.map((a) => (
                  <li key={a.url} className="flex items-center gap-2">
                    <span>{a.name || "file"}</span>
                    <button
                      type="button"
                      className="text-primary underline"
                      onClick={() => setReplyAttachments((prev) => prev.filter((x) => x.url !== a.url))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              className={adminToolbarButtonClass(
                (!reply.trim() && replyAttachments.length === 0) || sendMessage.isPending
              )}
              disabled={(!reply.trim() && replyAttachments.length === 0) || sendMessage.isPending}
              onClick={() => void sendMessage.mutate()}
            >
              {sendMessage.isPending ? "Sending…" : "Send reply"}
            </button>
          </div>
        </AdminPanel>

        <div className="space-y-6">
          <AdminPanel>
            <h2 className="text-lg font-semibold text-gray-900">Routing</h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Status</label>
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={str(ticket.status)}
                  disabled={patchTicket.isPending}
                  onChange={(e) => void patchTicket.mutateAsync({ status: e.target.value })}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Priority</label>
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={str(ticket.priority)}
                  disabled={patchTicket.isPending}
                  onChange={(e) => void patchTicket.mutateAsync({ priority: e.target.value })}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Assignee</label>
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={assignedId}
                  disabled={patchTicket.isPending || assigneesQ.isLoading}
                  onChange={(e) => {
                    const v = e.target.value;
                    void patchTicket.mutateAsync({ assigned_to: v === "" ? null : v });
                  }}
                >
                  <option value="">Unassigned</option>
                  {!assigneeInList && assignedId ? (
                    <option value={assignedId}>
                      {ticket.assigned_user?.full_name ||
                        ticket.assigned_user?.email ||
                        assignedId}{" "}
                      (current)
                    </option>
                  ) : null}
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.full_name || a.email || a.id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Category</label>
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={ticket.category ?? ""}
                  disabled={patchTicket.isPending}
                  onChange={(e) => {
                    const v = e.target.value;
                    void patchTicket.mutateAsync({ category: v === "" ? null : v });
                  }}
                >
                  <option value="">Uncategorized</option>
                  {SUPPORT_TICKET_CATEGORY_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.items.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Tags (comma-separated)</label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  onBlur={() => {
                    const next = tagsInput
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    const prev = ((ticket.tags as string[] | null | undefined) ?? [])
                      .map((t) => String(t))
                      .sort()
                      .join("|");
                    const n = [...next].sort().join("|");
                    if (prev !== n) void patchTicket.mutateAsync({ tags: next });
                  }}
                  placeholder="billing, vip, follow-up"
                />
              </div>
            </div>
          </AdminPanel>

          <AdminPanel>
            <h2 className="text-lg font-semibold text-gray-900">People</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-gray-500">Customer</dt>
                <dd>
                  {ticket.user?.id ? (
                    <Link className="font-medium text-primary underline" to={adminSpaTo(`/admin/users/${ticket.user.id}`)}>
                      {ticket.user.full_name || ticket.user.email || ticket.user.id}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Provider</dt>
                <dd>
                  {ticket.provider?.id ? (
                    <Link className="font-medium text-primary underline" to={adminSpaTo(`/admin/providers/${ticket.provider.id}`)}>
                      {ticket.provider.business_name || ticket.provider.id}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Created</dt>
                <dd className="text-gray-700">{ticket.created_at ? new Date(String(ticket.created_at)).toLocaleString() : "—"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">SLA resolution due</dt>
                <dd className={isSlaBreached(ticket) ? "font-medium text-red-700" : "text-gray-700"}>
                  {ticket.sla_resolution_due_at
                    ? `${new Date(String(ticket.sla_resolution_due_at)).toLocaleString()}${isSlaBreached(ticket) ? " (overdue)" : ""}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">First staff reply</dt>
                <dd className="text-gray-700">
                  {ticket.first_staff_reply_at
                    ? new Date(String(ticket.first_staff_reply_at)).toLocaleString()
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Last customer reply</dt>
                <dd className="text-gray-700">
                  {ticket.last_customer_reply_at
                    ? new Date(String(ticket.last_customer_reply_at)).toLocaleString()
                    : "—"}
                </dd>
              </div>
            </dl>
          </AdminPanel>

          <AdminPanel>
            <h2 className="text-lg font-semibold text-gray-900">Satisfaction (CSAT)</h2>
            <p className="mt-1 text-xs text-gray-500">Record follow-up survey feedback (1–5).</p>
            <div className="mt-3 space-y-2">
              <label className="text-xs font-medium text-gray-600">Score</label>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={csatScore === "" ? "" : String(csatScore)}
                disabled={patchTicket.isPending}
                onChange={(e) => {
                  const v = e.target.value;
                  setCsatScore(v === "" ? "" : Number(v));
                }}
              >
                <option value="">Not set</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <label className="text-xs font-medium text-gray-600">Comment</label>
              <textarea
                className="w-full min-h-[72px] rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={csatCommentDraft}
                onChange={(e) => setCsatCommentDraft(e.target.value)}
                placeholder="Optional note from the customer"
              />
              <button
                type="button"
                className={adminToolbarButtonClass(patchTicket.isPending)}
                disabled={patchTicket.isPending}
                onClick={() => {
                  void patchTicket
                    .mutateAsync({
                      csat_score: csatScore === "" ? null : Number(csatScore),
                      csat_comment: csatCommentDraft.trim() || null,
                    })
                    .then(() => adminToast.success("CSAT saved"))
                    .catch(() => {});
                }}
              >
                {patchTicket.isPending ? "Saving…" : "Save CSAT"}
              </button>
            </div>
          </AdminPanel>

          <AdminPanel>
            <h2 className="text-lg font-semibold text-gray-900">Team notes</h2>
            <ul className="mt-3 max-h-48 space-y-2 overflow-auto text-sm">
              {notes.length === 0 ? <li className="text-gray-500">No notes.</li> : null}
              {notes.map((n) => (
                <li key={str(n.id)} className="rounded-lg bg-gray-50 p-2">
                  <div className="text-xs text-gray-500">
                    {n.user?.full_name || n.user?.email} · {n.created_at ? new Date(String(n.created_at)).toLocaleString() : ""}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-gray-800">{str(n.note)}</p>
                </li>
              ))}
            </ul>
            <textarea
              className="mt-3 w-full min-h-[72px] rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Add internal note…"
            />
            <button
              type="button"
              className={`mt-2 ${adminToolbarButtonClass(!noteBody.trim() || addNote.isPending)}`}
              disabled={!noteBody.trim() || addNote.isPending}
              onClick={() => void addNote.mutate()}
            >
              {addNote.isPending ? "Saving…" : "Add note"}
            </button>
          </AdminPanel>
        </div>
      </div>
    </div>
  );
}
