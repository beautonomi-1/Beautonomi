import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ADMIN_SECTION_PROVIDERS_OPERATIONS,
  ADMIN_SECTION_SUPPORT,
  ADMIN_SECTION_USERS_TRUST,
  canAccessSection,
} from "@beautonomi/admin-access";
import { AdminApiError } from "@beautonomi/admin-api-client";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { invalidateAdminShellCounts } from "@/lib/invalidateAdminShellCounts";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import { AdminModal } from "@/components/admin/AdminModal";
import { formatAdminCurrency } from "@/lib/adminFormatCurrency";
import {
  REFUND_REASON_PRESETS,
  computeBookingAvailableRefund,
  canShowBookingRefund,
  normalizeRefundReason,
  isRefundReasonValid,
  type RefundReasonPreset,
} from "@/lib/refunds/refundUiHelpers";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToast } from "@/lib/adminToast";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { useAdminBreadcrumbLeaf } from "@/providers/AdminBreadcrumbProvider";
import { publicLearnUrl, type KbArticleResult, type KbAudience } from "@/lib/learning";
import type { UserRole } from "@beautonomi/types";
import { AgentAssistPanel } from "@/components/agent-assist/AgentAssistPanel";
import { useAgentShadowMode } from "@/hooks/useAgentShadowMode";
import { useElementWidth } from "@/hooks/useElementWidth";
import { TicketAttentionBanner } from "@/routes/support/ticket-detail/TicketAttentionBanner";
import { TicketComposer } from "@/routes/support/ticket-detail/TicketComposer";
import { TicketDetailHeader } from "@/routes/support/ticket-detail/TicketDetailHeader";
import { TicketSidebar } from "@/routes/support/ticket-detail/TicketSidebar";
import { TicketThread } from "@/routes/support/ticket-detail/TicketThread";
import {
  buildThreadItems,
  datetimeLocalToIso,
  detailsTabNeedsAttention,
  hasFailedPublicEmailSend,
  isWideTicketLayout,
  listAttentionBanners,
  resolveQueueNav,
  shouldAutoScrollThread,
  shouldShowOriginalRequest,
  str,
  toDatetimeLocalValue,
  unwrapAdminBookingPayload,
  type AttachmentItem,
  type MessageRow,
  type NoteRow,
  type TicketRow,
} from "@/routes/support/ticket-detail/ticketDetailHelpers";
import { useAdminWorkspaceHeight } from "@/hooks/useAdminWorkspaceHeight";

type Assignee = { id: string; email: string | null; full_name: string | null; role: string };

type TicketBundle = {
  ticket: TicketRow;
  messages: MessageRow[];
  notes: NoteRow[];
};

type BookingContextRow = {
  id: string;
  status: string;
  currency: string;
  payment_status?: string | null;
  total_amount?: number | null;
  total_paid?: number | null;
  total_refunded?: number | null;
  wallet_amount?: number | null;
  gift_card_amount?: number | null;
};

const DETAIL_REFETCH_MS = 45_000;

export type SupportTicketDetailVariant = "page" | "panel";

type SupportTicketDetailViewProps = {
  id: string;
  variant?: SupportTicketDetailVariant;
  queueTicketIds?: string[] | null;
  selectedOffPage?: boolean;
  onNavigateNext?: (nextId: string | null) => void;
};

function resetComposerState(setters: {
  setReply: (v: string) => void;
  setReplyInternal: (v: boolean) => void;
  setReplyAttachments: (v: AttachmentItem[]) => void;
  setUploadErr: (v: string | null) => void;
  setContextAttachSearch: (v: string) => void;
  setAttachBookingNumber: (v: string) => void;
  setAttachOrderNumber: (v: string) => void;
  setAttachGiftCode: (v: string) => void;
  setShowCancelBooking: (v: boolean) => void;
  setShowRefundBooking: (v: boolean) => void;
}) {
  setters.setReply("");
  setters.setReplyInternal(false);
  setters.setReplyAttachments([]);
  setters.setUploadErr(null);
  setters.setContextAttachSearch("");
  setters.setAttachBookingNumber("");
  setters.setAttachOrderNumber("");
  setters.setAttachGiftCode("");
  setters.setShowCancelBooking(false);
  setters.setShowRefundBooking(false);
}

export function SupportTicketDetailView({
  id,
  variant = "page",
  queueTicketIds = null,
  selectedOffPage = false,
  onNavigateNext,
}: SupportTicketDetailViewProps) {
  const isPanel = variant === "panel";
  const { shellRef, heightPx } = useAdminWorkspaceHeight(!isPanel);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_SUPPORT, "Support access is required.");
  const { shadowMode } = useAgentShadowMode();
  const { bootstrap } = useAdminSession();
  const myStaffUserId = bootstrap?.userId ?? "";
  const viewerRole = (bootstrap?.role as UserRole) ?? "support_agent";
  const canProviderOpsEarly = canAccessSection(viewerRole, ADMIN_SECTION_PROVIDERS_OPERATIONS);

  const [reply, setReply] = useState("");
  const [replyInternal, setReplyInternal] = useState(false);
  const [replyAttachments, setReplyAttachments] = useState<AttachmentItem[]>([]);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const seenStampedRef = useRef<string | null>(null);
  const [searchParams] = useSearchParams();
  const assistId = searchParams.get("assist");
  const [patchError, setPatchError] = useState<string | null>(null);
  const [tagsInput, setTagsInput] = useState("");
  const [slaDueInput, setSlaDueInput] = useState("");
  const [showCancelBooking, setShowCancelBooking] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showRefundBooking, setShowRefundBooking] = useState(false);
  const [refundAmount, setRefundAmount] = useState(0);
  const [refundReasonPreset, setRefundReasonPreset] = useState<RefundReasonPreset | "">("");
  const [refundReasonOther, setRefundReasonOther] = useState("");
  const [attachBookingNumber, setAttachBookingNumber] = useState("");
  const [attachOrderNumber, setAttachOrderNumber] = useState("");
  const [attachGiftCode, setAttachGiftCode] = useState("");
  const [contextAttachSearch, setContextAttachSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"conversation" | "details">("conversation");
  const [rootRef, rootWidth] = useElementWidth<HTMLDivElement>();
  const isWide = isWideTicketLayout(rootWidth);
  const showConversation = isWide || activeTab === "conversation";
  const showDetails = isWide || activeTab === "details";

  const detailQ = useQuery({
    queryKey: adminQueryKeys.supportTicketDetail(id),
    queryFn: () =>
      adminApi.getJson<TicketBundle>(`/api/admin/support-tickets/${encodeURIComponent(id)}`, { timeoutMs: 60_000 }),
    enabled: allowed && !!id,
    refetchInterval: DETAIL_REFETCH_MS,
    refetchOnWindowFocus: true,
  });

  useAdminDocumentTitle(isPanel ? "" : str(detailQ.data?.ticket?.subject) || "Support ticket");
  useAdminBreadcrumbLeaf(
    isPanel
      ? undefined
      : str(detailQ.data?.ticket?.ticket_number) || str(detailQ.data?.ticket?.subject) || undefined,
  );

  const ticketTenantId = detailQ.data?.ticket?.tenant_id ?? null;

  const contextQ = useQuery({
    queryKey: [...adminQueryKeys.supportTicketDetail(id), "context"],
    queryFn: async () => {
      const res = await adminApi.getJson<{
        data?: {
          facts?: Record<string, string | number | boolean | null> | null;
          records?: Array<{ kind: string; id: string; label: string; status: string | null; at: string | null }>;
        };
      }>(`/api/admin/support-tickets/${encodeURIComponent(id)}/context`, { timeoutMs: 30_000 });
      return res.data ?? null;
    },
    enabled: allowed && !!id,
    staleTime: 30_000,
  });

  const contextRecordsQ = useQuery({
    queryKey: [...adminQueryKeys.supportTicketDetail(id), "context", "search", contextAttachSearch],
    queryFn: async () => {
      const qs = contextAttachSearch.trim() ? `?q=${encodeURIComponent(contextAttachSearch.trim())}` : "";
      const res = await adminApi.getJson<{
        data?: {
          records?: Array<{ kind: string; id: string; label: string; status: string | null; at: string | null }>;
        };
      }>(`/api/admin/support-tickets/${encodeURIComponent(id)}/context${qs}`, { timeoutMs: 30_000 });
      return res.data?.records ?? [];
    },
    enabled: allowed && !!id,
    staleTime: 10_000,
  });

  const assigneesQ = useQuery({
    queryKey: [...adminQueryKeys.supportTicketAssignees(), ticketTenantId ?? "global"],
    queryFn: () => {
      const qs = ticketTenantId ? `?tenant_id=${encodeURIComponent(ticketTenantId)}` : "";
      return adminApi.getJson<{ assignees: Assignee[] }>(`/api/admin/support-ticket-assignees${qs}`, {
        timeoutMs: 30_000,
      });
    },
    enabled: allowed && !!id && !detailQ.isLoading,
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  });

  const invalidateTicket = useCallback(() => {
    void qc.invalidateQueries({ queryKey: adminQueryKeys.supportTicketDetail(id) });
    void qc.invalidateQueries({ queryKey: adminQueryKeys.supportTickets.all() });
    invalidateAdminShellCounts(qc);
  }, [qc, id]);

  useEffect(() => {
    resetComposerState({
      setReply,
      setReplyInternal,
      setReplyAttachments,
      setUploadErr,
      setContextAttachSearch,
      setAttachBookingNumber,
      setAttachOrderNumber,
      setAttachGiftCode,
      setShowCancelBooking,
      setShowRefundBooking,
    });
    setCancelReason("");
    setRefundReasonPreset("");
    setRefundReasonOther("");
    setActiveTab("conversation");
    seenStampedRef.current = null;
  }, [id]);

  const attachContextMut = useMutation({
    mutationFn: async (pick?: { kind: string; id: string }) => {
      const body: Record<string, string> = {};
      if (pick?.kind === "booking") body.booking_id = pick.id;
      else if (pick?.kind === "product_order") body.order_id = pick.id;
      else if (attachBookingNumber.trim()) body.booking_number = attachBookingNumber.trim();
      else if (attachOrderNumber.trim()) body.order_number = attachOrderNumber.trim();
      else if (attachGiftCode.trim()) body.gift_card_code = attachGiftCode.trim();
      else throw new Error("Enter a booking number, order number, or gift card code");
      return adminApi.postJson(`/api/admin/support-tickets/${encodeURIComponent(id)}/context`, body);
    },
    onSuccess: () => {
      adminToast.success("Linked record attached to ticket");
      setAttachBookingNumber("");
      setAttachOrderNumber("");
      setAttachGiftCode("");
      invalidateTicket();
      void qc.invalidateQueries({ queryKey: [...adminQueryKeys.supportTicketDetail(id), "context"] });
      void qc.invalidateQueries({ queryKey: [...adminQueryKeys.supportTicketDetail(id), "context", "search"] });
    },
    onError: (err: unknown) => {
      adminToast.error(err instanceof Error ? err.message : "Could not attach record");
    },
  });

  useEffect(() => {
    if (!allowed || !id || seenStampedRef.current === id) return;
    seenStampedRef.current = id;
    void adminApi
      .postJson(`/api/admin/support-tickets/${encodeURIComponent(id)}/seen`, {})
      .then(() => void qc.invalidateQueries({ queryKey: adminQueryKeys.supportTickets.all() }))
      .catch(() => {});
  }, [allowed, id, qc]);

  const usePageQueue = Boolean(queueTicketIds && queueTicketIds.length > 0);
  const nextQueueQ = useQuery({
    queryKey: ["support-tickets-next-queue", id],
    queryFn: () =>
      adminApi.getJson<{ tickets: Array<{ id: string }> }>(
        "/api/admin/support-tickets?sort=smart&needs_response=1&limit=25",
        { timeoutMs: 15_000 },
      ),
    enabled: allowed && !!id && !usePageQueue,
    staleTime: 30_000,
  });
  const remoteNextId = usePageQueue
    ? null
    : (() => {
        const list = nextQueueQ.data?.tickets ?? [];
        if (list.length === 0) return null;
        const idx = list.findIndex((t) => t.id === id);
        if (idx === -1) return list[0]?.id ?? null;
        return list[idx + 1]?.id ?? null;
      })();

  const queueNav = resolveQueueNav({
    currentId: id,
    queueTicketIds: usePageQueue ? queueTicketIds : null,
    remoteNextId,
  });

  const handleNextInQueue = useCallback(() => {
    if (queueNav.endOfPage) return;
    const targetId = queueNav.nextId;
    if (isPanel && onNavigateNext) {
      onNavigateNext(targetId);
      return;
    }
    if (targetId) {
      navigate(adminSpaTo(`/admin/support-tickets/${encodeURIComponent(targetId)}`), {
        state: queueTicketIds?.length ? { queueTicketIds } : undefined,
      });
    } else {
      navigate(adminSpaTo("/admin/support-tickets"));
    }
  }, [isPanel, onNavigateNext, queueNav.endOfPage, queueNav.nextId, queueTicketIds, navigate]);

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
      sla_resolution_due_at?: string | null;
    }) => {
      const bundle = qc.getQueryData<TicketBundle>(adminQueryKeys.supportTicketDetail(id));
      const token = bundle?.ticket?.updated_at;
      return adminApi.patchJson<{ ticket?: TicketRow }>(`/api/admin/support-tickets/${encodeURIComponent(id)}`, {
        ...body,
        ...(typeof token === "string" && token ? { expected_updated_at: token } : {}),
      });
    },
    onSuccess: (_data, variables) => {
      setPatchError(null);
      invalidateTicket();
      const keys = Object.keys(variables);
      const toastByField: Record<string, string> = {
        tags: "Tags updated",
        sla_resolution_due_at: "SLA updated",
        status: "Status updated",
        priority: "Priority updated",
        assigned_to: "Assignee updated",
        category: "Category updated",
      };
      if (keys.length === 2 && keys.includes("assigned_to") && keys.includes("status")) {
        adminToast.success("Ticket claimed");
      } else if (keys.length === 1 && toastByField[keys[0]]) {
        adminToast.success(toastByField[keys[0]]);
      }
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
      adminToast.success(wasInternal ? "Internal note saved" : "Reply sent");
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

  const syncedTicket = detailQ.data?.ticket;
  const bookingContextId =
    syncedTicket && str(syncedTicket.support_context_type) === "booking" && syncedTicket.support_context_id
      ? str(syncedTicket.support_context_id)
      : null;

  const bookingQ = useQuery({
    queryKey: adminQueryKeys.bookings.detail(bookingContextId ?? ""),
    queryFn: () =>
      adminApi.getJson<BookingContextRow>(`/api/admin/bookings/${encodeURIComponent(bookingContextId!)}`, {
        timeoutMs: 45_000,
      }),
    enabled: allowed && !!bookingContextId && canProviderOpsEarly,
  });

  const cancelBookingMut = useMutation({
    mutationFn: (reason: string | undefined) =>
      adminApi.postJson(`/api/admin/bookings/${encodeURIComponent(bookingContextId!)}/cancel`, { reason }),
    onSuccess: () => {
      void bookingQ.refetch();
      invalidateTicket();
      setShowCancelBooking(false);
      setCancelReason("");
      adminToast.success("Booking cancelled");
      void adminApi
        .postJson(`/api/admin/support-tickets/${encodeURIComponent(id)}/messages`, {
          message:
            "Staff action: booking cancelled. Online payments were credited to the customer wallet (admin cancel — no customer fee).",
          is_internal: true,
        })
        .then(() => invalidateTicket())
        .catch((err: Error) => adminToast.error(`Staff note failed: ${err.message}`));
    },
    onError: (e: Error) => adminToast.error(`Failed to cancel booking: ${e.message}`),
  });

  const refundBookingMut = useMutation({
    mutationFn: (payload: { amount: number; reason: string }) =>
      adminApi.postJson(`/api/admin/bookings/${encodeURIComponent(bookingContextId!)}/refund`, payload),
    onSuccess: (_data, vars) => {
      void bookingQ.refetch();
      invalidateTicket();
      setShowRefundBooking(false);
      setRefundReasonPreset("");
      setRefundReasonOther("");
      adminToast.success("Refund credited to customer wallet");
      const amount = Number((vars as { amount?: number }).amount ?? 0);
      const reason = String((vars as { reason?: string }).reason ?? "");
      void adminApi
        .postJson(`/api/admin/support-tickets/${encodeURIComponent(id)}/messages`, {
          message: `Staff action: ${amount.toFixed(2)} credited to the customer wallet. Reason: ${reason}.`,
          is_internal: true,
        })
        .then(() => invalidateTicket())
        .catch((err: Error) => adminToast.error(`Staff note failed: ${err.message}`));
    },
    onError: (e: Error) => adminToast.error(`Refund failed: ${e.message}`),
  });

  useEffect(() => {
    if (!syncedTicket?.id) return;
    setTagsInput(((syncedTicket.tags as string[] | null | undefined) ?? []).join(", "));
    setSlaDueInput(toDatetimeLocalValue(syncedTicket.sla_resolution_due_at as string | null | undefined));
  }, [syncedTicket?.id, syncedTicket?.tags, syncedTicket?.sla_resolution_due_at]);

  useEffect(() => {
    if (!assistId || detailQ.isLoading) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`agent-assist-${assistId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [assistId, detailQ.isLoading]);

  const threadMessages = detailQ.data?.messages ?? [];
  const threadNotes = detailQ.data?.notes ?? [];
  const threadItems = useMemo(
    () => buildThreadItems(threadMessages, threadNotes),
    [threadMessages, threadNotes],
  );

  const scrolledForRef = useRef<{ id: string | null; count: number }>({ id: null, count: 0 });
  const threadItemCount = threadItems.length;
  const hasTicket = Boolean(detailQ.data?.ticket);
  const scrollThreadToEnd = useCallback(
    (forceTicketChanged: boolean) => {
      const el = threadRef.current;
      if (!el || el.clientHeight === 0) return false;
      const prev = scrolledForRef.current;
      const ticketChanged = forceTicketChanged || prev.id !== id;
      const auto = shouldAutoScrollThread({
        ticketChanged,
        prevItemCount: prev.count,
        nextItemCount: threadItemCount,
        distanceFromBottom: el.scrollHeight - el.scrollTop - el.clientHeight,
      });
      scrolledForRef.current = { id, count: threadItemCount };
      if (!auto) return true;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
      return true;
    },
    [id, threadItemCount],
  );

  useEffect(() => {
    if (!hasTicket || !showConversation) return;
    if (scrollThreadToEnd(false)) return;
    const el = threadRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      scrollThreadToEnd(false);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasTicket, showConversation, scrollThreadToEnd]);

  if (denied) return denied;
  if (!id) return <AdminRetryBlock message="Missing ticket id" onRetry={() => {}} />;

  if (detailQ.isLoading) {
    return (
      <div className={isPanel ? "flex h-full min-h-0 flex-col overflow-hidden p-4" : "flex min-h-0 flex-col"}>
        <AdminPageSkeleton rows={4} />
      </div>
    );
  }

  if (detailQ.error) {
    if (isAdminApiAuthFailure(detailQ.error)) return <PermissionDenied />;
    return (
      <div className={isPanel ? "p-4" : undefined}>
        <AdminRetryBlock message={detailQ.error.message} onRetry={() => void detailQ.refetch()} />
      </div>
    );
  }

  const bundle = detailQ.data;
  const ticket = bundle?.ticket;

  if (!ticket) {
    return <p className="p-4 text-sm text-gray-600">Ticket not found.</p>;
  }

  const assignees = assigneesQ.data?.assignees ?? [];
  const contextBooking = unwrapAdminBookingPayload(bookingQ.data) as BookingContextRow | null;
  const availableRefund = contextBooking ? computeBookingAvailableRefund(contextBooking) : 0;
  const canProviderOps = canProviderOpsEarly;
  const canUsersTrust = canAccessSection(viewerRole, ADMIN_SECTION_USERS_TRUST);
  const showRefundAction =
    contextBooking && canProviderOps ? canShowBookingRefund(contextBooking) : false;
  const resolvedRefundReason = normalizeRefundReason(refundReasonPreset, refundReasonOther);
  const refundReasonValid = isRefundReasonValid(refundReasonPreset, refundReasonOther);
  const assignedId = ticket.assigned_to == null ? "" : str(ticket.assigned_to);
  const assigneeInList = assignedId && assignees.some((a) => a.id === assignedId);
  const customerUserId = ticket.user_id == null ? null : str(ticket.user_id);

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

  const attentionBanners = listAttentionBanners(ticket);
  const showCancelAction =
    Boolean(bookingContextId && contextBooking && canProviderOps) &&
    str(contextBooking?.status) !== "cancelled" &&
    str(contextBooking?.status) !== "completed";
  const detailsAlert = detailsTabNeedsAttention({
    showCancel: showCancelAction,
    showRefund: Boolean(showRefundAction),
    unlinkedContext: Boolean(ticket.support_context_type && !ticket.support_context_id),
    failedPublicSend: hasFailedPublicEmailSend(threadMessages),
  });
  const showOriginal = shouldShowOriginalRequest(str(ticket.description), threadMessages, customerUserId);
  const originalRequestText = showOriginal ? str(ticket.description).trim() : null;

  const contextRecords = contextRecordsQ.data?.length
    ? contextRecordsQ.data
    : (contextQ.data?.records ?? []);

  const claimStartDisabled = assignedId === myStaffUserId && str(ticket.status) === "in_progress";

  const rootStyle =
    !isPanel && heightPx != null ? ({ height: `${heightPx}px` } as const) : undefined;

  return (
    <div
      ref={(el) => {
        rootRef(el);
        if (!isPanel) shellRef(el);
      }}
      style={rootStyle}
      className={
        isPanel
          ? "flex h-full min-h-0 flex-col gap-3 overflow-hidden p-4"
          : "flex min-h-0 flex-col gap-3 overflow-hidden"
      }
    >
      {selectedOffPage ? (
        <p className="shrink-0 text-xs text-amber-800">Not on this page.</p>
      ) : null}

      <TicketAttentionBanner banners={attentionBanners} />

      <TicketDetailHeader
        ticket={ticket}
        ticketId={id}
        variant={variant}
        ownerLabel={ownerLabel}
        iAmAssignee={iAmAssignee}
        myStaffUserId={myStaffUserId}
        assignedId={assignedId}
        patchPending={patchTicket.isPending}
        isFetching={detailQ.isFetching}
        queueNavLabel={queueNav.label}
        queueNavDisabled={queueNav.endOfPage}
        queueTicketIds={queueTicketIds}
        onNextInQueue={handleNextInQueue}
        onRefresh={() => void detailQ.refetch()}
        onAssignToMe={() => void patchTicket.mutateAsync({ assigned_to: myStaffUserId })}
        onClaimAndStart={() =>
          void patchTicket.mutateAsync({ assigned_to: myStaffUserId, status: "in_progress" })
        }
        onUnassign={() => void patchTicket.mutateAsync({ assigned_to: null })}
        claimStartDisabled={claimStartDisabled}
      />

      {ticket.channel === "email" ? (
        <div className="shrink-0 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-xs text-sky-950 sm:text-sm">
          Email from {ticket.requester_email || ticket.user?.email || "unknown sender"} to{" "}
          {ticket.mailbox?.address || "support mailbox"}
          {ticket.tenant?.name ? (
            <>
              , {ticket.tenant.name}
              {ticket.tenant.region_code ? ` (${ticket.tenant.region_code})` : ""}
            </>
          ) : null}
          . Public replies send from {ticket.mailbox?.address || "the mailbox"}.
          {ticket.mailbox?.outbound_enabled === false ? (
            <span className="mt-1 block font-medium text-amber-900">Outbound email is off for this mailbox.</span>
          ) : null}
        </div>
      ) : null}

      <div id="agent-assist-panel" className="max-h-32 shrink-0 overflow-y-auto">
        <AgentAssistPanel
          targetType="support_ticket"
          targetId={id}
          actionTypes={["support.reply", "support.assign", "support.resolve"]}
          entityLabel={`#${str(ticket.ticket_number)}`}
          shadowMode={shadowMode}
          hideWhenEmpty
          emptyTitle="No AI draft for this ticket"
          emptyDescription="When Support Triage drafts a reply, it will appear here for your approval."
        />
      </div>

      {patchError ? (
        <p className="shrink-0 text-sm text-red-700" role="alert">
          {patchError}
        </p>
      ) : null}
      <AdminMutationAlert
        errors={[
          sendMessage.error instanceof Error ? sendMessage.error : null,
          cancelBookingMut.error instanceof Error ? cancelBookingMut.error : null,
          refundBookingMut.error instanceof Error ? refundBookingMut.error : null,
        ]}
      />

      {!isWide ? (
        <div
          role="tablist"
          aria-label="Ticket workspace"
          className="flex shrink-0 gap-1 rounded-xl bg-gray-100 p-1 text-sm font-medium"
        >
          {(
            [
              ["conversation", "Conversation"],
              ["details", "Details & actions"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`ticket-tab-${key}`}
              aria-controls={key === "conversation" ? "ticket-conversation" : "ticket-details"}
              aria-selected={activeTab === key}
              onClick={() => setActiveTab(key)}
              className={`relative min-h-10 flex-1 rounded-lg px-3 ${
                activeTab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {label}
              {key === "details" && detailsAlert ? (
                <span
                  className="absolute end-2 top-2 h-2 w-2 rounded-full bg-amber-500"
                  aria-hidden
                />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      <div
        className={`grid min-h-0 flex-1 gap-4 overflow-hidden grid-rows-[minmax(0,1fr)] ${
          isWide ? "grid-cols-[minmax(0,1fr)_20rem]" : ""
        }`}
      >
        <section
          id="ticket-conversation"
          role="tabpanel"
          aria-labelledby="ticket-tab-conversation"
          hidden={!showConversation}
          className={`${showConversation ? "flex" : "hidden"} min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-3 shadow-sm ring-1 ring-gray-950/[0.03]`}
        >
          <TicketThread
            threadRef={threadRef}
            threadItems={threadItems}
            customerUserId={customerUserId}
            originalRequestText={originalRequestText}
            ticketCreatedAt={ticket.created_at ? str(ticket.created_at) : undefined}
          />
          <TicketComposer
            ticket={ticket}
            ticketId={id}
            reply={reply}
            setReply={setReply}
            replyInternal={replyInternal}
            setReplyInternal={setReplyInternal}
            replyAttachments={replyAttachments}
            setReplyAttachments={setReplyAttachments}
            replyAudience={replyAudience}
            onInsertArticle={insertArticleLink}
            onSend={handleSendReply}
            sendPending={sendMessage.isPending}
            patchPending={patchTicket.isPending}
            uploading={uploading}
            uploadErr={uploadErr}
            onPickFiles={onPickFiles}
            fileRef={fileRef}
          />
        </section>

        <div
          id="ticket-details"
          role="tabpanel"
          aria-labelledby="ticket-tab-details"
          hidden={!showDetails}
          className={showDetails ? "h-full min-h-0 overflow-hidden" : "hidden"}
        >
        <TicketSidebar
          ticket={ticket}
          assignees={assignees}
          assignedId={assignedId}
          assigneeInList={Boolean(assigneeInList)}
          tagsInput={tagsInput}
          setTagsInput={setTagsInput}
          slaDueInput={slaDueInput}
          setSlaDueInput={setSlaDueInput}
          patchPending={patchTicket.isPending}
          assigneesLoading={assigneesQ.isLoading}
          onPatch={(body) => void patchTicket.mutateAsync(body)}
          onTagsBlur={() => {
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
          onSlaBlur={() => {
            const nextIso = datetimeLocalToIso(slaDueInput);
            const prevIso = ticket.sla_resolution_due_at ? String(ticket.sla_resolution_due_at) : null;
            if (nextIso === prevIso || (!nextIso && !prevIso)) return;
            void patchTicket.mutateAsync({ sla_resolution_due_at: nextIso });
          }}
          viewerRole={viewerRole}
          canProviderOps={canProviderOps}
          canUsersTrust={canUsersTrust}
          contextFacts={contextQ.data?.facts}
          contextRecords={contextRecords}
          contextAttachSearch={contextAttachSearch}
          setContextAttachSearch={setContextAttachSearch}
          contextRecordsFetching={contextRecordsQ.isFetching}
          attachBookingNumber={attachBookingNumber}
          setAttachBookingNumber={setAttachBookingNumber}
          attachOrderNumber={attachOrderNumber}
          setAttachOrderNumber={setAttachOrderNumber}
          attachGiftCode={attachGiftCode}
          setAttachGiftCode={setAttachGiftCode}
          attachContextPending={attachContextMut.isPending}
          onAttachPick={(pick) => attachContextMut.mutate(pick)}
          onAttachManual={() => attachContextMut.mutate(undefined)}
          bookingContextId={bookingContextId}
          contextBooking={contextBooking ?? null}
          showRefundAction={Boolean(showRefundAction)}
          onCancelBooking={() => setShowCancelBooking(true)}
          onRefundBooking={() => {
            setRefundAmount(availableRefund);
            setRefundReasonPreset("");
            setRefundReasonOther("");
            setShowRefundBooking(true);
          }}
        />
        </div>
      </div>

      <AdminModal
        open={showCancelBooking}
        onClose={() => setShowCancelBooking(false)}
        title="Cancel booking"
        description="This cannot be undone."
        labelledBy="ticket-booking-cancel-title"
        footer={
          <>
            <button
              type="button"
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              onClick={() => setShowCancelBooking(false)}
            >
              Back
            </button>
            <button
              type="button"
              className="rounded bg-red-700 px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={cancelBookingMut.isPending}
              onClick={() => cancelBookingMut.mutate(cancelReason || undefined)}
            >
              Confirm cancel
            </button>
          </>
        }
      >
        <textarea
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="Reason (optional)"
          rows={3}
          className="w-full rounded border border-gray-300 p-2 text-sm"
        />
        <AdminMutationAlert errors={[cancelBookingMut.error]} />
      </AdminModal>

      <AdminModal
        open={showRefundBooking}
        onClose={() => setShowRefundBooking(false)}
        title="Process refund"
        labelledBy="ticket-booking-refund-title"
        footer={
          <>
            <button
              type="button"
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              onClick={() => setShowRefundBooking(false)}
            >
              Back
            </button>
            <button
              type="button"
              className="rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={
                refundBookingMut.isPending ||
                !refundReasonValid ||
                refundAmount <= 0 ||
                refundAmount > availableRefund + 0.001
              }
              onClick={() => refundBookingMut.mutate({ amount: refundAmount, reason: resolvedRefundReason })}
            >
              Process refund
            </button>
          </>
        }
      >
        {contextBooking ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
              {(contextBooking.total_refunded ?? 0) > 0 ? (
                <p>
                  <span className="font-medium">Already refunded:</span>{" "}
                  {formatAdminCurrency(contextBooking.total_refunded ?? 0, contextBooking.currency)}
                </p>
              ) : null}
              <p>
                <span className="font-medium">Available to refund:</span>{" "}
                {formatAdminCurrency(availableRefund, contextBooking.currency)}
              </p>
            </div>
            <label className="block text-sm">
              Amount
              <input
                type="number"
                value={refundAmount}
                onChange={(e) => setRefundAmount(parseFloat(e.target.value) || 0)}
                className="mt-1 w-full rounded border border-gray-300 p-2"
                min={0.01}
                max={availableRefund}
                step="0.01"
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Reason *
              <select
                className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
                value={refundReasonPreset}
                onChange={(e) => setRefundReasonPreset(e.target.value as RefundReasonPreset | "")}
              >
                <option value="">Select a reason…</option>
                {REFUND_REASON_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </select>
            </label>
            {refundReasonPreset === "Other" || refundReasonPreset === "" ? (
              <label className="block text-sm font-medium text-gray-700">
                {refundReasonPreset === "Other" ? "Describe reason *" : "Or enter reason *"}
                <input
                  type="text"
                  className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
                  value={refundReasonOther}
                  onChange={(e) => setRefundReasonOther(e.target.value)}
                  placeholder="Reason for refund…"
                />
              </label>
            ) : null}
            <AdminMutationAlert errors={[refundBookingMut.error]} />
          </div>
        ) : null}
      </AdminModal>
    </div>
  );
}
