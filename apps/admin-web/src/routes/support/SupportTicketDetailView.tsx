import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_SUPPORT } from "@beautonomi/admin-access";
import { AdminApiError } from "@beautonomi/admin-api-client";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
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
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { LearningArticlePicker } from "@/components/learning/LearningArticlePicker";
import { publicLearnUrl, type KbArticleResult, type KbAudience } from "@/lib/learning";
import { Building2, BookOpen, CheckCircle2, Copy, ExternalLink, FileText, Paperclip, Send, UploadCloud, UserRound, X } from "lucide-react";

type Assignee = { id: string; email: string | null; full_name: string | null; role: string };

type TicketRow = Record<string, unknown> & {
  id?: string;
  ticket_number?: string;
  subject?: string;
  description?: string;
  category?: string | null;
  requester_type?: string | null;
  support_context_type?: string | null;
  support_context_label?: string | null;
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
  user?: {
    id?: string;
    email?: string;
    full_name?: string | null;
    phone?: string | null;
    role?: string | null;
    is_active?: boolean | null;
    created_at?: string | null;
  } | null;
  provider?: {
    id?: string;
    business_name?: string | null;
    email?: string | null;
    phone?: string | null;
    status?: string | null;
    user_id?: string | null;
    created_at?: string | null;
  } | null;
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

const DETAIL_REFETCH_MS = 45_000;

function isImageAttachment(att: AttachmentItem): boolean {
  return Boolean(att.type?.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif)$/i.test(att.url));
}

function formatFileSize(size?: number): string {
  if (size == null) return "";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function messageDayLabel(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: today.getFullYear() === d.getFullYear() ? undefined : "numeric" });
}

function relativeTime(value?: string): string {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : "—";
}

export type SupportTicketDetailVariant = "page" | "panel";

type SupportTicketDetailViewProps = {
  id: string;
  variant?: SupportTicketDetailVariant;
};

export function SupportTicketDetailView({ id, variant = "page" }: SupportTicketDetailViewProps) {
  const isPanel = variant === "panel";
  const qc = useQueryClient();
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_SUPPORT, "Support access is required.");
  const { bootstrap } = useAdminSession();
  const myStaffUserId = bootstrap?.userId ?? "";

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
  const [dragActive, setDragActive] = useState(false);

  const detailQ = useQuery({
    queryKey: adminQueryKeys.supportTicketDetail(id),
    queryFn: () =>
      adminApi.getJson<TicketBundle>(`/api/admin/support-tickets/${encodeURIComponent(id)}`, { timeoutMs: 60_000 }),
    enabled: allowed && !!id,
    refetchInterval: DETAIL_REFETCH_MS,
    refetchOnWindowFocus: true,
  });

  useAdminDocumentTitle(isPanel ? "" : str(detailQ.data?.ticket?.subject) || "Support ticket");

  const assigneesQ = useQuery({
    queryKey: adminQueryKeys.supportTicketAssignees(),
    queryFn: () => adminApi.getJson<{ assignees: Assignee[] }>("/api/admin/support-ticket-assignees", { timeoutMs: 30_000 }),
    enabled: allowed && !!id && !detailQ.isLoading,
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  });

  const invalidateTicket = () => {
    void qc.invalidateQueries({ queryKey: adminQueryKeys.supportTicketDetail(id) });
    void qc.invalidateQueries({ queryKey: adminQueryKeys.supportTickets.all() });
  };

  // Realtime: refresh the ticket detail + list when this ticket or its messages change.
  const rtDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!allowed || !id) return;
    const sb = getSupabaseBrowserClient();
    if (!sb) return;
    const scheduleInvalidate = () => {
      if (rtDebounceRef.current) clearTimeout(rtDebounceRef.current);
      rtDebounceRef.current = setTimeout(() => {
        rtDebounceRef.current = null;
        invalidateTicket();
      }, 400);
    };
    const channel = sb
      .channel(`admin-ticket-detail:${id}`)
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "support_tickets", filter: `id=eq.${id}` },
        scheduleInvalidate,
      )
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "support_ticket_messages", filter: `ticket_id=eq.${id}` },
        scheduleInvalidate,
      )
      .subscribe();
    return () => {
      if (rtDebounceRef.current) clearTimeout(rtDebounceRef.current);
      try {
        sb.removeChannel(channel);
      } catch {
        // Ignore
      }
    };
  }, [allowed, id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    }) => {
      const bundle = qc.getQueryData<TicketBundle>(adminQueryKeys.supportTicketDetail(id));
      const token = bundle?.ticket?.updated_at;
      return adminApi.patchJson<{ ticket?: TicketRow }>(`/api/admin/support-tickets/${encodeURIComponent(id)}`, {
        ...body,
        ...(typeof token === "string" && token ? { expected_updated_at: token } : {}),
      });
    },
    onSuccess: () => {
      setPatchError(null);
      invalidateTicket();
    },
    onError: (e: Error) => {
      if (e instanceof AdminApiError && e.status === 409) {
        setPatchError(null);
        adminToast.error("Another teammate updated this ticket — refreshed from server.");
        invalidateTicket();
        return;
      }
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

  const handleSendReply = async (nextStatus?: string) => {
    const hasContent = reply.trim() || replyAttachments.length > 0;
    if (!hasContent || sendMessage.isPending || patchTicket.isPending) return;
    try {
      await sendMessage.mutateAsync();
      if (nextStatus) {
        await adminApi.patchJson(`/api/admin/support-tickets/${encodeURIComponent(id)}`, { status: nextStatus });
        invalidateTicket();
        adminToast.success(`Ticket marked ${nextStatus.replace(/_/g, " ")}`);
      }
    } catch {
      // Mutation handlers already surface the specific error.
    }
  };

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
  const staffParticipants = Array.from(
    new Set(
      messages
        .filter((m) => {
          const uid = m.user_id == null ? null : str(m.user_id);
          return !m.is_internal && uid !== customerUserId;
        })
        .map((m) => m.user?.full_name || m.user?.email || "Support")
        .filter(Boolean)
    )
  ).slice(0, 3);

  const ownerLabel =
    ticket.assigned_user?.full_name ||
    ticket.assigned_user?.email ||
    (assignedId ? `User ${assignedId.slice(0, 8)}…` : null);
  const iAmAssignee = Boolean(myStaffUserId && assignedId === myStaffUserId);

  const requester = str(ticket.requester_type);
  const replyAudience: KbAudience =
    requester === "provider" ? "provider" : requester === "customer" ? "customer" : ticket.provider_id ? "provider" : "customer";

  const insertArticleLink = (article: KbArticleResult) => {
    const snippet = `${article.title}: ${publicLearnUrl(article.slug)}`;
    setReply((prev) => (prev.trim() ? `${prev.trim()}\n\n${snippet}` : snippet));
    adminToast.success("Article link added to reply");
  };

  return (
    <div className={isPanel ? "space-y-4" : "space-y-6"}>
      <AdminPageHeader
        title={str(ticket.subject) || "Support ticket"}
        description={`#${str(ticket.ticket_number)} · ${str(ticket.status).replace(/_/g, " ")}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 shadow-sm ring-1 ring-gray-950/[0.04] hover:bg-gray-50"
              onClick={() => void detailQ.refetch()}
              disabled={detailQ.isFetching}
            >
              {detailQ.isFetching ? "Refreshing…" : "Refresh"}
            </button>
            {isPanel ? (
              <Link
                to={adminSpaTo(`/admin/support-tickets/${encodeURIComponent(id)}`)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 shadow-sm ring-1 ring-gray-950/[0.04] hover:bg-gray-50"
              >
                Open full page
                <ExternalLink className="h-4 w-4" aria-hidden />
              </Link>
            ) : (
              <Link
                to={adminSpaTo("/admin/support-tickets")}
                className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 shadow-sm ring-1 ring-gray-950/[0.04] hover:bg-gray-50"
              >
                ← Queue
              </Link>
            )}
          </div>
        }
      />

      <div className="rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-sm text-gray-800">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span>
            <span className="text-gray-500">Owner </span>
            <span className="font-medium text-gray-900">{ownerLabel ?? "Unassigned"}</span>
            {iAmAssignee ? (
              <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">You</span>
            ) : null}
          </span>
          <span className="hidden sm:inline text-gray-300" aria-hidden>
            |
          </span>
          <span className="text-gray-600">
            Last updated{" "}
            <time dateTime={ticket.updated_at ? String(ticket.updated_at) : undefined}>
              {ticket.updated_at ? new Date(String(ticket.updated_at)).toLocaleString() : "—"}
            </time>
          </span>
          <span className="text-xs text-gray-500 sm:ml-auto">
            Queue auto-refreshes about every {Math.round(DETAIL_REFETCH_MS / 1000)}s while this tab is open.
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {myStaffUserId ? (
            <>
              <button
                type="button"
                className={adminToolbarButtonClass(patchTicket.isPending || assignedId === myStaffUserId)}
                disabled={patchTicket.isPending || assignedId === myStaffUserId}
                onClick={() => void patchTicket.mutateAsync({ assigned_to: myStaffUserId })}
              >
                Assign to me
              </button>
              <button
                type="button"
                className={adminToolbarButtonClass(
                  patchTicket.isPending || (assignedId === myStaffUserId && str(ticket.status) === "in_progress"),
                )}
                disabled={
                  patchTicket.isPending || (assignedId === myStaffUserId && str(ticket.status) === "in_progress")
                }
                onClick={() =>
                  void patchTicket.mutateAsync({
                    assigned_to: myStaffUserId,
                    status: "in_progress",
                  })
                }
              >
                Claim &amp; start
              </button>
            </>
          ) : null}
          {assignedId ? (
            <button
              type="button"
              className={adminToolbarButtonClass(patchTicket.isPending)}
              disabled={patchTicket.isPending}
              onClick={() => void patchTicket.mutateAsync({ assigned_to: null })}
            >
              Unassign
            </button>
          ) : null}
        </div>
      </div>

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

      <div className={`grid gap-6 ${isPanel ? "grid-cols-1" : "lg:grid-cols-3"}`}>
        <AdminPanel className={isPanel ? "" : "lg:col-span-2"}>
          <h2 className="text-lg font-semibold text-gray-900">Conversation</h2>
          <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">{str(ticket.description)}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-700">
              Customer: {ticket.user?.full_name || ticket.user?.email || ticket.provider?.business_name || "Unknown"}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium capitalize text-slate-800">
              Origin: {str(ticket.requester_type) || (ticket.provider_id ? "provider" : "customer")}
            </span>
            {ticket.support_context_type ? (
              <span className="rounded-full bg-violet-50 px-2.5 py-1 font-medium text-violet-800">
                About: {str(ticket.support_context_type).replace(/_/g, " ")}
                {ticket.support_context_label ? ` · ${str(ticket.support_context_label)}` : ""}
              </span>
            ) : null}
            <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-800">
              Owner: {ownerLabel ?? "Unassigned"}
            </span>
            {staffParticipants.map((name) => (
              <span key={name} className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800">
                Support: {name}
              </span>
            ))}
          </div>
          <ul className="mt-6 space-y-3 border-t border-gray-100 pt-4">
            {messages.length === 0 ? (
              <li className="text-sm text-gray-500">No messages yet.</li>
            ) : (
              messages.map((m, idx) => {
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
                const dayLabel = messageDayLabel(str(m.created_at));
                const prevDayLabel = idx > 0 ? messageDayLabel(str(messages[idx - 1]?.created_at)) : "";
                const messageId = str(m.id);
                return (
                  <Fragment key={messageId}>
                    {dayLabel && dayLabel !== prevDayLabel ? (
                      <li className="flex justify-center">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-500 ring-1 ring-gray-200">
                          {dayLabel}
                        </span>
                      </li>
                    ) : null}
                  <li id={`message-${messageId}`} className={`flex w-full ${fromStaff ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[min(100%,42rem)] rounded-xl border p-3 shadow-sm ${bubble}`}>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span className="font-medium text-gray-700">{roleLabel}</span>
                        <span>·</span>
                        <span>{m.user?.full_name || m.user?.email || "User"}</span>
                        <span>·</span>
                        <span>{m.created_at ? new Date(String(m.created_at)).toLocaleString() : "—"}</span>
                        {m.created_at ? <span>({relativeTime(String(m.created_at))})</span> : null}
                        {internal ? (
                          <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-amber-950">Not visible to customer</span>
                        ) : null}
                        <button
                          type="button"
                          className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-gray-500 hover:bg-white/70 hover:text-gray-800"
                          onClick={() => {
                            const href = `${window.location.origin}${window.location.pathname}#message-${messageId}`;
                            void navigator.clipboard?.writeText(href).then(
                              () => adminToast.success("Message link copied"),
                              () => adminToast.error("Could not copy link")
                            );
                          }}
                        >
                          <Copy className="h-3 w-3" />
                          Copy link
                        </button>
                      </div>
                      <p className="mt-2 text-sm text-gray-800 whitespace-pre-wrap">{str(m.message)}</p>
                      {atts.length > 0 ? (
                        <ul className="mt-3 grid gap-2 border-t border-dashed border-gray-200 pt-2 text-xs sm:grid-cols-2">
                          {atts.map((a) => (
                            <li key={a.url}>
                              <a
                                href={a.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block overflow-hidden rounded-lg border border-gray-200 bg-white/70 hover:border-gray-300"
                              >
                                {isImageAttachment(a) ? (
                                  <img src={a.url} alt={a.name || "Attachment"} className="h-28 w-full object-cover" loading="lazy" />
                                ) : null}
                                <span className="flex items-center gap-2 px-2 py-2 font-medium text-gray-800">
                                  <FileText className="h-3.5 w-3.5 text-gray-500" />
                                  <span className="min-w-0 flex-1 truncate">{a.name || "Attachment"}</span>
                                  {a.size != null ? <span className="shrink-0 text-gray-500">{formatFileSize(a.size)}</span> : null}
                                </span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </li>
                  </Fragment>
                );
              })
            )}
          </ul>

          <div className="mt-6 space-y-3 border-t border-gray-100 pt-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1 text-sm">
                <button
                  type="button"
                  className={`rounded-lg px-3 py-2 font-medium transition-colors ${
                    !replyInternal ? "bg-gray-900 text-white shadow-sm" : "text-gray-700 hover:bg-white"
                  }`}
                  onClick={() => setReplyInternal(false)}
                >
                  Reply to customer
                </button>
                <button
                  type="button"
                  className={`rounded-lg px-3 py-2 font-medium transition-colors ${
                    replyInternal ? "bg-amber-500 text-amber-950 shadow-sm" : "text-gray-700 hover:bg-white"
                  }`}
                  onClick={() => setReplyInternal(true)}
                >
                  Internal note
                </button>
              </div>
              <p className={`text-xs ${replyInternal ? "text-amber-700" : "text-gray-500"}`}>
                {replyInternal ? "Only staff can see this note." : "Visible to the customer and included in notifications."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-gray-500">Snippet</span>
              <select
                className="min-h-10 max-w-xs rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800"
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
            <details className="rounded-xl border border-gray-200 bg-gray-50/70 p-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-gray-800">
                <BookOpen className="h-4 w-4 text-purple-600" aria-hidden />
                Help articles
                <span className="ml-1 text-xs font-normal text-gray-500">
                  Insert a link to a relevant {replyAudience} guide
                </span>
              </summary>
              <div className="mt-3">
                <LearningArticlePicker
                  audience={replyAudience}
                  includeInternal={replyInternal}
                  onInsert={insertArticleLink}
                  initialQuery={str(ticket.subject)}
                  placeholder="Search guides to share with the customer…"
                />
              </div>
            </details>
            <textarea
              className={`w-full min-h-[120px] rounded-xl border px-3 py-2 text-sm focus:outline-none ${
                replyInternal
                  ? "border-amber-300 bg-amber-50/70 focus:border-amber-500"
                  : "border-gray-300 bg-white focus:border-gray-500"
              }`}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void handleSendReply();
                }
                if (e.key === "Escape" && reply.trim()) {
                  e.preventDefault();
                  setReply("");
                }
              }}
              placeholder={replyInternal ? "Add context for teammates…" : "Type a clear reply to the customer…"}
            />
            <p className="text-xs text-gray-500">Press Cmd/Ctrl+Enter to send, or Esc to clear the draft.</p>
            <div
              className={`rounded-2xl border border-dashed p-4 transition-colors ${
                dragActive ? "border-blue-400 bg-blue-50" : "border-gray-300 bg-gray-50/80"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                void onPickFiles(e.dataTransfer.files);
              }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="rounded-xl bg-white p-2 text-gray-700 shadow-sm ring-1 ring-gray-200">
                    <UploadCloud className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">Drop files here or attach from your device</p>
                    <p className="text-xs text-gray-500">Images preview inline. Attachments are sent with this reply.</p>
                  </div>
                </div>
                <button
                  type="button"
                  className={adminToolbarButtonClass(uploading)}
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  <Paperclip className="mr-1.5 h-4 w-4" />
                  {uploading ? "Uploading…" : "Attach files"}
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                disabled={uploading}
                onChange={(e) => void onPickFiles(e.target.files)}
              />
              {replyAttachments.length > 0 ? (
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {replyAttachments.map((a) => (
                    <li key={a.url} className="overflow-hidden rounded-xl border border-gray-200 bg-white text-xs shadow-sm">
                      {isImageAttachment(a) ? (
                        <img src={a.url} alt={a.name || "Attachment preview"} className="h-24 w-full object-cover" loading="lazy" />
                      ) : null}
                      <div className="flex items-center gap-2 px-3 py-2">
                        <FileText className="h-4 w-4 shrink-0 text-gray-500" />
                        <span className="min-w-0 flex-1 truncate text-gray-700">{a.name || "file"}</span>
                        {a.size != null ? <span className="shrink-0 text-gray-500">{formatFileSize(a.size)}</span> : null}
                        <button
                          type="button"
                          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                          aria-label={`Remove ${a.name || "attachment"}`}
                          onClick={() => setReplyAttachments((prev) => prev.filter((x) => x.url !== a.url))}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {uploadErr ? <p className="text-sm text-red-600">{uploadErr}</p> : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                className={adminToolbarButtonClass(
                  (!reply.trim() && replyAttachments.length === 0) || sendMessage.isPending || patchTicket.isPending
                )}
                disabled={(!reply.trim() && replyAttachments.length === 0) || sendMessage.isPending || patchTicket.isPending}
                onClick={() => void handleSendReply()}
              >
                <Send className="mr-1.5 h-4 w-4" />
                {sendMessage.isPending ? "Sending…" : replyInternal ? "Save internal note" : "Send reply"}
              </button>
              {!replyInternal ? (
                <>
                  <button
                    type="button"
                    className={adminToolbarButtonClass(
                      (!reply.trim() && replyAttachments.length === 0) || sendMessage.isPending || patchTicket.isPending
                    )}
                    disabled={(!reply.trim() && replyAttachments.length === 0) || sendMessage.isPending || patchTicket.isPending}
                    onClick={() => void handleSendReply("resolved")}
                  >
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    Send and resolve
                  </button>
                  <button
                    type="button"
                    className={adminToolbarButtonClass(
                      (!reply.trim() && replyAttachments.length === 0) || sendMessage.isPending || patchTicket.isPending
                    )}
                    disabled={(!reply.trim() && replyAttachments.length === 0) || sendMessage.isPending || patchTicket.isPending}
                    onClick={() => void handleSendReply("waiting_customer")}
                  >
                    Send and wait for customer
                  </button>
                </>
              ) : null}
            </div>
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
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">People</h2>
                <p className="mt-1 text-xs text-gray-500">Open quick details here, or jump to the full admin profile.</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <details className="group rounded-2xl border border-gray-200 bg-white p-3 open:border-primary/30 open:bg-primary/5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600">
                      <UserRound className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-medium uppercase tracking-wide text-gray-500">Requester</span>
                      <span className="block truncate text-sm font-semibold text-gray-900">
                        {ticket.user?.full_name || ticket.user?.email || ticket.user?.id || "Unknown user"}
                      </span>
                    </span>
                  </span>
                  <span className="text-xs font-medium text-primary group-open:hidden">View info</span>
                  <span className="hidden text-xs font-medium text-gray-500 group-open:inline">Hide</span>
                </summary>
                <dl className="mt-3 grid grid-cols-1 gap-2 border-t border-gray-200 pt-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-gray-500">Email</dt>
                    <dd className="break-all text-gray-800">{ticket.user?.email || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Phone</dt>
                    <dd className="text-gray-800">{ticket.user?.phone || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Role / origin</dt>
                    <dd className="capitalize text-gray-800">
                      {ticket.user?.role || str(ticket.requester_type) || (ticket.provider_id ? "provider" : "customer")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Status</dt>
                    <dd className={ticket.user?.is_active === false ? "font-medium text-red-700" : "text-gray-800"}>
                      {ticket.user?.is_active === false ? "Inactive" : ticket.user?.is_active === true ? "Active" : "—"}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-gray-500">User ID</dt>
                    <dd className="break-all font-mono text-xs text-gray-700">{ticket.user?.id || ticket.user_id || "—"}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-gray-500">Joined</dt>
                    <dd className="text-gray-800">{formatDateTime(ticket.user?.created_at)}</dd>
                  </div>
                </dl>
                {ticket.user?.id ? (
                  <Link
                    className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-800"
                    to={adminSpaTo(`/admin/users/${ticket.user.id}`)}
                  >
                    View full user profile
                    <ExternalLink className="h-4 w-4" aria-hidden />
                  </Link>
                ) : null}
              </details>

              <details className="group rounded-2xl border border-gray-200 bg-white p-3 open:border-emerald-300 open:bg-emerald-50/60">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      <Building2 className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-medium uppercase tracking-wide text-gray-500">Provider</span>
                      <span className="block truncate text-sm font-semibold text-gray-900">
                        {ticket.provider?.business_name || ticket.provider?.id || "No provider linked"}
                      </span>
                    </span>
                  </span>
                  <span className="text-xs font-medium text-primary group-open:hidden">View info</span>
                  <span className="hidden text-xs font-medium text-gray-500 group-open:inline">Hide</span>
                </summary>
                <dl className="mt-3 grid grid-cols-1 gap-2 border-t border-gray-200 pt-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-gray-500">Business email</dt>
                    <dd className="break-all text-gray-800">{ticket.provider?.email || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Business phone</dt>
                    <dd className="text-gray-800">{ticket.provider?.phone || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Provider status</dt>
                    <dd className="capitalize text-gray-800">{ticket.provider?.status || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Created</dt>
                    <dd className="text-gray-800">{formatDateTime(ticket.provider?.created_at)}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-gray-500">Provider ID</dt>
                    <dd className="break-all font-mono text-xs text-gray-700">{ticket.provider?.id || ticket.provider_id || "—"}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-gray-500">Owner user ID</dt>
                    <dd className="break-all font-mono text-xs text-gray-700">{ticket.provider?.user_id || "—"}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  {ticket.provider?.id ? (
                    <Link
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-800"
                      to={adminSpaTo(`/admin/providers/${ticket.provider.id}`)}
                    >
                      View full provider profile
                      <ExternalLink className="h-4 w-4" aria-hidden />
                    </Link>
                  ) : null}
                  {ticket.provider?.user_id ? (
                    <Link
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 hover:bg-gray-50"
                      to={adminSpaTo(`/admin/users/${ticket.provider.user_id}`)}
                    >
                      View provider owner
                      <ExternalLink className="h-4 w-4" aria-hidden />
                    </Link>
                  ) : null}
                </div>
              </details>
            </div>

            <dl className="mt-4 space-y-2 border-t border-gray-100 pt-4 text-sm">
              <div>
                <dt className="text-gray-500">Support context</dt>
                <dd className="text-gray-700">
                  {ticket.support_context_type
                    ? `${str(ticket.support_context_type).replace(/_/g, " ")}${ticket.support_context_label ? ` · ${ticket.support_context_label}` : ""}`
                    : "—"}
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
