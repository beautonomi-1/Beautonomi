import { useState, useRef, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDER_OPS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { cn } from "@/lib/cn";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminModal } from "@/components/admin/AdminModal";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToast } from "@/lib/adminToast";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import {
  LEAD_STAGE_BADGE as STAGE_BADGE,
  LEAD_STAGE_DOT as STAGE_DOT,
  LEAD_STAGE_KEYS as STAGES,
  LEAD_STAGE_LABELS as STAGE_LABELS,
  getLeadStageDescription,
  getLeadStageLabel,
  getLeadStageNextAction,
} from "@/lib/providerOpsLeadStages";
import {
  ArrowLeft, Phone, Mail, MapPin, Calendar, Tag, User,
  Trash2, UserPlus, ExternalLink, StickyNote, TrendingUp, RotateCcw,
  MessageSquare, Globe, Building2, FileText, Clock,
  ChevronRight, ArrowRightCircle, Send, Link2, Copy, Check, MessageCircle, Ban, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { LeadWhatsAppPanel } from "@/components/whatsapp/LeadWhatsAppPanel";
import { handleLeadConcurrent409 } from "@/lib/handleLeadConcurrentUpdate";
import { LeadAssigneeInline } from "@/components/provider-ops/LeadAssigneeInline";
import { LeadVoiceDialer } from "@/components/provider-ops/LeadVoiceDialer";
import { ReferrerPicker, referrerSelectionFromLead, type ReferrerSelection } from "@/components/provider-ops/ReferrerPicker";
import {
  canWhatsAppLead,
  getLeadContactAlertLabel,
  normalizeLeadWhatsAppStatus,
  getWhatsAppBlockedReason,
  hasLeadEmail,
  hasLeadPhone,
} from "@/lib/providerOpsLeadContact";

function detailAssigneeName(lead: Record<string, unknown>): string {
  const aid = lead.assigned_to != null ? String(lead.assigned_to) : "";
  if (!aid) return "Unassigned";
  const au = lead.assigned_user as { full_name?: string | null; email?: string | null } | null | undefined;
  if (au && typeof au === "object") {
    const n = typeof au.full_name === "string" ? au.full_name.trim() : "";
    const e = typeof au.email === "string" ? au.email.trim() : "";
    if (n || e) return n || e;
  }
  return `${aid.slice(0, 8)}…`;
}

const ACTIVITY_ICON_MAP: Record<string, typeof MessageSquare> = {
  note: StickyNote,
  stage_change: TrendingUp,
  stage_changed: TrendingUp,
  call: Phone,
  call_logged: Phone,
  email: Mail,
  email_sent: Mail,
  sms_sent: Send,
  whatsapp_sent: MessageCircle,
  do_not_contact_set: Ban,
  do_not_contact_cleared: Check,
  meeting: Calendar,
  default: MessageSquare,
};
const OPS_DETAIL_REFETCH_MS = 45_000;

const ACTIVITY_COLOR_MAP: Record<string, { bg: string; text: string }> = {
  note: { bg: "bg-blue-100", text: "text-blue-600" },
  stage_change: { bg: "bg-purple-100", text: "text-purple-600" },
  stage_changed: { bg: "bg-purple-100", text: "text-purple-600" },
  call: { bg: "bg-green-100", text: "text-green-600" },
  call_logged: { bg: "bg-green-100", text: "text-green-600" },
  email: { bg: "bg-amber-100", text: "text-amber-600" },
  email_sent: { bg: "bg-amber-100", text: "text-amber-600" },
  sms_sent: { bg: "bg-indigo-100", text: "text-indigo-600" },
  whatsapp_sent: { bg: "bg-green-100", text: "text-green-600" },
  do_not_contact_set: { bg: "bg-rose-100", text: "text-rose-600" },
  do_not_contact_cleared: { bg: "bg-emerald-100", text: "text-emerald-600" },
  meeting: { bg: "bg-pink-100", text: "text-pink-600" },
  default: { bg: "bg-gray-100", text: "text-gray-500" },
};

/** Activities API returns `{ data: Activity[], meta }` after envelope unwrap — never assume a bare array. */
function normalizeActivityRows(raw: unknown): Activity[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as Activity[];
  if (typeof raw === "object" && raw !== null && "data" in raw && Array.isArray((raw as { data: unknown }).data)) {
    return (raw as { data: Activity[] }).data;
  }
  return [];
}

interface Activity {
  id?: string;
  activity_type: string;
  description: string;
  created_at: string;
  created_by_name?: string | null;
}

export function ProviderOpsLeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_PROVIDER_OPS, "Provider Ops access is required.");
  const { bootstrap } = useAdminSession();
  const myUserId = bootstrap?.userId ?? "";
  const [noteText, setNoteText] = useState("");
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteChannel, setInviteChannel] = useState<"email" | "sms">("email");
  const [inviteResult, setInviteResult] = useState<{
    invite_link: string;
    sent_to: string;
    channel?: string;
    delivered?: boolean;
    delivery_error?: string | null;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState({
    business_name: "", contact_person_name: "", email: "", phone_e164: "",
    suggested_location_text: "", country: "", description: "", notes: "",
  });
  const [editReferrer, setEditReferrer] = useState<ReferrerSelection | null>(null);
  const lastCallLogAtRef = useRef(0);
  const noteInputRef = useRef<HTMLInputElement>(null);

  const q = useQuery({
    queryKey: adminQueryKeys.providerOps.leadDetail(id!),
    queryFn: () => adminApi.getJson<Record<string, unknown>>(`/api/admin/provider-ops/leads/${id}`, { timeoutMs: 60_000 }),
    enabled: allowed && !!id,
    refetchInterval: OPS_DETAIL_REFETCH_MS,
    refetchOnWindowFocus: true,
  });

  const activitiesQ = useQuery({
    queryKey: adminQueryKeys.providerOps.leadActivities(id!),
    queryFn: () => adminApi.getJson<{ data: Activity[] }>(`/api/admin/provider-ops/leads/${id}/activities`, { timeoutMs: 30_000 }),
    enabled: allowed && !!id,
    refetchInterval: OPS_DETAIL_REFETCH_MS,
    refetchOnWindowFocus: true,
  });

  const tasksQ = useQuery({
    queryKey: [...adminQueryKeys.providerOps.leadDetail(id!), "tasks"],
    queryFn: () =>
      adminApi.getJson<{
        tasks: Array<{
          id: string;
          title: string;
          description: string | null;
          due_at: string | null;
          completed_at: string | null;
          assigned_to: string | null;
          assignee?: { full_name?: string | null; email?: string | null } | null;
        }>;
      }>(`/api/admin/provider-ops/leads/${id}/tasks`),
    enabled: allowed && !!id,
    refetchInterval: OPS_DETAIL_REFETCH_MS,
  });

  const commsQ = useQuery({
    queryKey: [...adminQueryKeys.providerOps.leadDetail(id!), "communications"],
    queryFn: () =>
      adminApi.getJson<{
        communications: Array<{
          id: string;
          channel: string;
          direction: string;
          status: string | null;
          subject: string | null;
          body: string | null;
          created_at: string;
        }>;
      }>(`/api/admin/provider-ops/leads/${id}/communications?limit=20`),
    enabled: allowed && !!id,
    refetchInterval: OPS_DETAIL_REFETCH_MS,
  });

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueAt, setTaskDueAt] = useState("");

  const createTaskMut = useMutation({
    mutationFn: () =>
      adminApi.postJson(`/api/admin/provider-ops/leads/${id}/tasks`, {
        title: taskTitle.trim(),
        due_at: taskDueAt ? new Date(taskDueAt).toISOString() : null,
      }),
    onSuccess: () => {
      adminToast.success("Task created");
      setTaskTitle("");
      setTaskDueAt("");
      void tasksQ.refetch();
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadActivities(id!) });
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to create task"),
  });

  const completeTaskMut = useMutation({
    mutationFn: (taskId: string) =>
      adminApi.patchJson(`/api/admin/provider-ops/leads/${id}/tasks/${taskId}`, { completed: true }),
    onSuccess: () => {
      void tasksQ.refetch();
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadActivities(id!) });
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to complete task"),
  });

  const stageChange = useMutation({
    mutationFn: (stage: string) => {
      const d = q.data as Record<string, unknown> | undefined;
      const token = typeof d?.updated_at === "string" ? d.updated_at : undefined;
      return adminApi.patchJson(`/api/admin/provider-ops/leads/${id}/stage`, {
        stage,
        ...(token ? { expected_updated_at: token } : {}),
      });
    },
    onSuccess: (_data, stage) => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadDetail(id!) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadActivities(id!) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
      adminToast.success(`Stage updated to "${getLeadStageLabel(stage)}"`);
    },
    onError: (e: Error) => {
      if (handleLeadConcurrent409(e)) {
        void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadDetail(id!) });
        void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
        return;
      }
      adminToast.error(`Stage update failed: ${e.message}`);
    },
  });

  const addNote = useMutation({
    mutationFn: () => adminApi.postJson(`/api/admin/provider-ops/leads/${id}/activities`, { activity_type: "note", description: noteText.trim() }),
    onSuccess: () => {
      setNoteText("");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadActivities(id!) });
      adminToast.success("Note added");
    },
    onError: (e: Error) => adminToast.error(`Failed to add note: ${e.message}`),
  });

  const logCall = useMutation({
    mutationFn: () =>
      adminApi.postJson(`/api/admin/provider-ops/leads/${id}/activities`, {
        activity_type: "call_logged",
        description: noteText.trim() || "Phone call with lead",
        metadata: { direction: "outbound", source: "manual_log" },
      }),
    onSuccess: () => {
      setNoteText("");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadActivities(id!) });
      adminToast.success("Call logged");
    },
    onError: (e: Error) => adminToast.error(`Failed to log call: ${e.message}`),
  });

  const handleLeadCallClick = useCallback(async () => {
    const lead = q.data as Record<string, unknown> | undefined;
    const phone = typeof lead?.phone_e164 === "string" ? lead.phone_e164.trim() : "";
    if (!phone) return;
    if (lead?.do_not_contact) {
      const ok = window.confirm("This lead is marked Do Not Contact. Place the call anyway?");
      if (!ok) return;
    }

    const now = Date.now();
    const shouldLog = now - lastCallLogAtRef.current >= 2000;
    if (shouldLog) lastCallLogAtRef.current = now;

    const a = document.createElement("a");
    a.href = `tel:${phone}`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();

    if (!shouldLog) return;

    try {
      await adminApi.postJson(`/api/admin/provider-ops/leads/${id}/activities`, {
        activity_type: "call_logged",
        description: "Phone call with lead",
        metadata: { direction: "outbound", source: "tel_link" },
      });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadActivities(id!) });
      toast.success("Call logged", {
        action: {
          label: "Add note",
          onClick: () => noteInputRef.current?.focus(),
        },
      });
    } catch (e) {
      adminToast.error(e instanceof Error ? e.message : "Failed to log call");
    }
  }, [id, q.data, qc]);

  const assignMut = useMutation({
    mutationFn: (args: { assigned_to: string; assigned_to_name?: string }) => {
      const d = q.data as Record<string, unknown> | undefined;
      const token = typeof d?.updated_at === "string" ? d.updated_at : undefined;
      return adminApi.patchJson(`/api/admin/provider-ops/leads/${id}/assign`, {
        assigned_to: args.assigned_to || null,
        ...(args.assigned_to_name ? { assigned_to_name: args.assigned_to_name } : {}),
        ...(token ? { expected_updated_at: token } : {}),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadDetail(id!) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
      adminToast.success("Lead assigned");
    },
    onError: (e: Error) => {
      if (handleLeadConcurrent409(e)) {
        void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadDetail(id!) });
        void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
        return;
      }
      adminToast.error(`Assign failed: ${e.message}`);
    },
  });

  const deleteLead = useMutation({
    mutationFn: () => adminApi.deleteJson(`/api/admin/provider-ops/leads/${id}`),
    onSuccess: () => {
      adminToast.success("Lead moved to trash");
      navigate(adminSpaTo("/admin/provider-ops/leads"));
    },
    onError: (e: Error) => adminToast.error(`Failed to delete lead: ${e.message}`),
  });

  const restoreLead = useMutation({
    mutationFn: () => adminApi.postJson(`/api/admin/provider-ops/leads/${id}/restore`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadDetail(id!) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
      adminToast.success("Lead restored");
    },
    onError: (e: Error) => adminToast.error(`Restore failed: ${e.message}`),
  });

  const convertMut = useMutation({
    mutationFn: (mode: "assisted" | "invite") =>
      adminApi.postJson<{ data: Record<string, unknown> }>(
        `/api/admin/provider-ops/leads/${id}/convert`,
        { mode }
      ),
    onSuccess: (res, mode) => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadDetail(id!) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadActivities(id!) });
      setShowConvertModal(false);
      if (mode === "assisted") {
        adminToast.success("Lead converted — provider account created");
      } else {
        const data = res?.data;
        if (data?.invite_link) {
          setInviteResult({
            invite_link: String(data.invite_link),
            sent_to: String(data.sent_to || ""),
            channel: data.channel ? String(data.channel) : undefined,
            delivered: Boolean(data.delivered),
            delivery_error: data.delivery_error ? String(data.delivery_error) : null,
          });
        }
        if (data?.delivered) {
          adminToast.success(`Onboarding invite sent via ${data.channel || "message"}`);
        } else {
          adminToast.info("Invite link generated — copy and send it manually");
        }
      }
    },
    onError: (e: Error) => adminToast.error(`Conversion failed: ${e.message}`),
  });

  const inviteMut = useMutation({
    mutationFn: (channel: "email" | "sms") =>
      adminApi.postJson<{ data: Record<string, unknown> }>(
        `/api/admin/provider-ops/leads/${id}/invite`,
        { channel }
      ),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadDetail(id!) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadActivities(id!) });
      const data = res?.data;
      if (data?.invite_link) {
        setInviteResult({
          invite_link: String(data.invite_link),
          sent_to: String(data.sent_to || ""),
          channel: data.channel ? String(data.channel) : undefined,
          delivered: Boolean(data.delivered),
          delivery_error: data.delivery_error ? String(data.delivery_error) : null,
        });
      }
      setShowInviteModal(false);
      if (data?.delivered) {
        adminToast.success(`Onboarding invite sent via ${data.channel || "message"}`);
      } else {
        adminToast.info("Invite link generated — copy and send it manually");
      }
    },
    onError: (e: Error) => adminToast.error(`Failed to send invite: ${e.message}`),
  });

  const updateLeadMut = useMutation({
    mutationFn: (fields: Record<string, unknown>) => {
      const d = q.data as Record<string, unknown> | undefined;
      const token = typeof d?.updated_at === "string" ? d.updated_at : undefined;
      return adminApi.patchJson(`/api/admin/provider-ops/leads/${id}`, {
        ...fields,
        ...(token ? { expected_updated_at: token } : {}),
      });
    },
    onSuccess: () => {
      setIsEditing(false);
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadDetail(id!) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadActivities(id!) });
      adminToast.success("Lead updated");
    },
    onError: (e: Error) => {
      if (handleLeadConcurrent409(e)) {
        void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadDetail(id!) });
        void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
        return;
      }
      adminToast.error(`Update failed: ${e.message}`);
    },
  });

  function startEditing() {
    const d = q.data as Record<string, unknown> | undefined;
    if (!d) return;
    setEditDraft({
      business_name: String(d.business_name ?? ""),
      contact_person_name: String(d.contact_person_name ?? ""),
      email: String(d.email ?? ""),
      phone_e164: String(d.phone_e164 ?? ""),
      suggested_location_text: String(d.suggested_location_text ?? ""),
      country: String(d.country ?? ""),
      description: String(d.description ?? ""),
      notes: String(d.notes ?? ""),
    });
    setEditReferrer(referrerSelectionFromLead(d));
    setIsEditing(true);
  }

  function saveEdits() {
    const d = q.data as Record<string, unknown> | undefined;
    if (!d) return;
    const updates: Record<string, unknown> = {};
    const fields = ["business_name", "contact_person_name", "email", "phone_e164", "suggested_location_text", "country", "description", "notes"] as const;
    for (const f of fields) {
      if (editDraft[f] !== String(d[f] ?? "")) {
        updates[f] = editDraft[f] || null;
      }
    }
    const currentReferrer = referrerSelectionFromLead(d);
    const sameReferrer =
      (currentReferrer?.referrer_user_id ?? null) === (editReferrer?.referrer_user_id ?? null) &&
      (currentReferrer?.referrer_provider_id ?? null) === (editReferrer?.referrer_provider_id ?? null);
    if (!sameReferrer) {
      updates.referrer_user_id = editReferrer?.referrer_user_id ?? null;
      updates.referrer_provider_id = editReferrer?.referrer_provider_id ?? null;
    }
    if (Object.keys(updates).length === 0) { setIsEditing(false); return; }
    updateLeadMut.mutate(updates);
  }

  const handleCopyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      adminToast.error("Failed to copy link");
    }
  };

  if (denied) return denied;
  if (q.isLoading) return <div className="space-y-6"><AdminPageHeader title="Lead Detail" /><AdminPanel><AdminPageSkeleton rows={8} /></AdminPanel></div>;
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const lead = q.data as Record<string, unknown> | undefined;
  if (!lead) return <AdminRetryBlock message="Lead not found" onRetry={() => void q.refetch()} />;

  const name = String(lead.business_name || lead.contact_person_name || lead.lead_name || "Unnamed Lead");
  const stage = String(lead.commercial_stage || "new");
  const activities = normalizeActivityRows(activitiesQ.data?.data ?? activitiesQ.data);
  const categories = (Array.isArray(lead.provider_lead_categories)
    ? lead.provider_lead_categories
    : lead.provider_lead_categories && typeof lead.provider_lead_categories === "object"
      ? [lead.provider_lead_categories as { global_category_id: string; global_service_categories: { id: string; name: string; slug: string; icon: string | null } | null }]
      : []) as { global_category_id: string; global_service_categories: { id: string; name: string; slug: string; icon: string | null } | null }[];
  const tags: string[] = Array.isArray(lead.tags)
    ? (lead.tags as string[])
    : typeof lead.tags === "string"
      ? (() => {
          const t = lead.tags.trim();
          if (!t) return [];
          try {
            const p = JSON.parse(t) as unknown;
            if (Array.isArray(p)) return p.map(String);
          } catch {
            /* use split below */
          }
          return t.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
        })()
      : [];
  const currentStageIdx = STAGES.indexOf(stage as typeof STAGES[number]);
  const onboardingData = lead.onboarding_data as Record<string, unknown> | null;
  const hasOnboardingData = onboardingData && Object.keys(onboardingData).filter((k) => k !== "invite_token").length > 0;
  const canConvert = !lead.matched_provider_id && (stage === "won" || stage === "qualified");
  const hasEmail = !!lead.email;
  const assignedToId = lead.assigned_to != null ? String(lead.assigned_to) : "";
  const iOwnLead = Boolean(myUserId && assignedToId === myUserId);
  const updatedAtRaw = lead.updated_at != null ? String(lead.updated_at) : "";
  const doNotContact = Boolean(lead.do_not_contact);
  const contactLead = {
    phone_e164: typeof lead.phone_e164 === "string" ? lead.phone_e164 : null,
    email: typeof lead.email === "string" ? lead.email : null,
    do_not_contact: doNotContact,
    whatsapp_status: normalizeLeadWhatsAppStatus(lead.whatsapp_status),
  };
  const contactAlertLabel = getLeadContactAlertLabel(contactLead);
  const whatsAppBlockedReason = getWhatsAppBlockedReason(contactLead);
  const whatsAppEnabled = canWhatsAppLead(contactLead);
  const referrerDisplay =
    referrerSelectionFromLead(lead)?.display_name ||
    (lead.source_detail ? String(lead.source_detail) : null);

  function toggleDoNotContact() {
    updateLeadMut.mutate({ do_not_contact: !doNotContact });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-3 pb-[max(3rem,env(safe-area-inset-bottom,0px))] pt-1 sm:px-4 lg:px-0">
      {/* Back link */}
      <Link to={adminSpaTo("/admin/provider-ops/leads")} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-gray-500 touch-manipulation hover:text-gray-700 transition-colors">
        <ArrowLeft className="h-4 w-4" />Back to Lead Inbox
      </Link>

      <div className="rounded-xl border border-gray-200 bg-gray-50/90 px-4 py-3 text-sm text-gray-800">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-gray-500">Owner</span>
            <LeadAssigneeInline
              leadId={id!}
              assignedToId={assignedToId || null}
              displayName={assignedToId ? (iOwnLead ? "You" : detailAssigneeName(lead)) : "—"}
              updatedAt={updatedAtRaw}
              onAssign={(args) =>
                assignMut.mutate({
                  assigned_to: args.assigned_to,
                  assigned_to_name: args.assigned_to_name,
                })
              }
              disabled={assignMut.isPending}
            />
            {iOwnLead ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Assigned to you</span>
            ) : null}
          </div>
          <span className="hidden sm:inline text-gray-300" aria-hidden>
            |
          </span>
          <span className="text-gray-600">
            Last updated{" "}
            <time dateTime={updatedAtRaw || undefined}>{updatedAtRaw ? new Date(updatedAtRaw).toLocaleString() : "—"}</time>
          </span>
          <span className="text-xs text-gray-500 sm:ml-auto">
            Detail refreshes about every {Math.round(OPS_DETAIL_REFETCH_MS / 1000)}s while this tab is open — safe for multiple admins.
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={adminToolbarButtonClass(q.isFetching)}
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            {q.isFetching ? "Refreshing…" : "Refresh"}
          </button>
          {myUserId ? (
            <>
              <button
                type="button"
                className={adminToolbarButtonClass(assignMut.isPending || iOwnLead)}
                disabled={assignMut.isPending || iOwnLead}
                onClick={() => assignMut.mutate({ assigned_to: myUserId })}
              >
                Assign to me
              </button>
              {assignedToId ? (
                <button
                  type="button"
                  className={adminToolbarButtonClass(assignMut.isPending)}
                  disabled={assignMut.isPending}
                  onClick={() => assignMut.mutate({ assigned_to: "" })}
                >
                  Unassign
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gray-900 text-xl font-bold text-white">
            {name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", STAGE_BADGE[stage] || "bg-gray-100 text-gray-600")}>
                {getLeadStageLabel(stage)}
              </span>
              <button
                type="button"
                disabled={updateLeadMut.isPending}
                onClick={toggleDoNotContact}
                title={
                  doNotContact
                    ? "Do not contact — outbound SMS/WhatsApp blocked. Click to clear."
                    : "Mark as do-not-contact"
                }
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset touch-manipulation transition-colors",
                  doNotContact
                    ? "bg-rose-100 text-rose-800 ring-rose-200 hover:bg-rose-200/80"
                    : "border border-dashed border-gray-300 bg-white text-gray-500 hover:border-rose-300 hover:text-rose-700",
                  updateLeadMut.isPending && "opacity-60",
                )}
              >
                <Ban className="h-3 w-3" />
                {doNotContact ? "Do not contact" : "Mark DNC"}
              </button>
              {contactAlertLabel ? (
                <span
                  title={contactAlertLabel}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200"
                >
                  <AlertTriangle className="h-3 w-3" />
                  {contactAlertLabel}
                </span>
              ) : null}
              <span className="inline-block rounded-md border border-gray-200 px-2 py-0.5 text-xs text-gray-500">{String(lead.source ?? "—")}</span>
              <span className="text-xs text-gray-400">{lead.created_at ? new Date(String(lead.created_at)).toLocaleDateString() : ""}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isEditing && (
            <button
              type="button"
              onClick={startEditing}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-blue-300 bg-white px-4 py-2.5 text-sm font-medium text-blue-700 touch-manipulation hover:bg-blue-50 transition-colors"
            >
              <FileText className="h-4 w-4" />Edit
            </button>
          )}
          {hasLeadPhone(contactLead) ? (
            <button
              type="button"
              onClick={() => void handleLeadCallClick()}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 touch-manipulation hover:bg-gray-50 transition-colors"
            >
              <Phone className="h-4 w-4" />Call
            </button>
          ) : null}
          {hasLeadEmail(contactLead) ? (
            <a href={`mailto:${String(lead.email)}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 touch-manipulation hover:bg-gray-50 transition-colors">
              <Mail className="h-4 w-4" />Email
            </a>
          ) : null}
          <button
            type="button"
            disabled={!whatsAppEnabled}
            onClick={() => document.getElementById("whatsapp-panel")?.scrollIntoView({ behavior: "smooth" })}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-medium touch-manipulation transition-colors",
              whatsAppEnabled
                ? "border-green-300 bg-white text-green-700 hover:bg-green-50"
                : "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400",
            )}
            title={whatsAppBlockedReason ?? "Send WhatsApp"}
          >
            <MessageCircle className="h-4 w-4" />WhatsApp
          </button>
          {lead.deleted_at ? (
            <button
              type="button"
              disabled={restoreLead.isPending}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-medium text-emerald-700 touch-manipulation hover:bg-emerald-50 transition-colors disabled:opacity-50"
              onClick={() => {
                if (confirm("Restore this lead from trash?")) restoreLead.mutate();
              }}
            >
              <RotateCcw className="h-4 w-4" />Restore
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-700 touch-manipulation hover:bg-red-50 transition-colors"
              onClick={() => {
                if (confirm("Move this lead to trash?")) deleteLead.mutate();
              }}
            >
              <Trash2 className="h-4 w-4" />Trash
            </button>
          )}
        </div>
      </div>

      {/* Invite result banner */}
      {inviteResult && (
        <AdminPanel className={inviteResult.delivered ? "!border-green-200 !bg-green-50/50" : "!border-amber-200 !bg-amber-50/50"}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <h3 className={cn("flex items-center gap-2 text-sm font-semibold", inviteResult.delivered ? "text-green-800" : "text-amber-800")}>
                <Link2 className="h-4 w-4 shrink-0" />
                {inviteResult.delivered
                  ? `Onboarding Invite Sent${inviteResult.channel ? ` via ${inviteResult.channel}` : ""}`
                  : "Onboarding Invite Link Ready"}
              </h3>
              {inviteResult.delivered ? (
                <p className="mt-1 text-xs text-green-700">
                  Sent to {inviteResult.sent_to}. Includes the onboarding link and the Provider app download links.
                </p>
              ) : (
                <p className="mt-1 text-xs text-amber-700">
                  {inviteResult.delivery_error
                    ? `Auto-send unavailable: ${inviteResult.delivery_error} `
                    : ""}
                  Copy the link below and send it to {inviteResult.sent_to || "the lead"} manually.
                </p>
              )}
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className={cn("block max-w-full overflow-x-auto rounded px-2 py-1 text-xs break-all", inviteResult.delivered ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")}>{inviteResult.invite_link}</code>
                <button
                  type="button"
                  onClick={() => void handleCopyLink(inviteResult.invite_link)}
                  className={cn("inline-flex items-center justify-center gap-1 self-start rounded-lg border bg-white px-3 py-2 text-xs touch-manipulation sm:self-center", inviteResult.delivered ? "border-green-300 text-green-700 hover:bg-green-50" : "border-amber-300 text-amber-700 hover:bg-amber-50")}
                >
                  {copiedLink ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiedLink ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <button type="button" onClick={() => setInviteResult(null)} className={cn("text-xs", inviteResult.delivered ? "text-green-600 hover:text-green-800" : "text-amber-600 hover:text-amber-800")}>Dismiss</button>
          </div>
        </AdminPanel>
      )}

      {/* Stage progress bar — scroll horizontally on narrow viewports */}
      <AdminPanel className="overflow-hidden">
        <div className="-mx-1 overflow-x-auto overscroll-x-contain px-1 pb-1 [-webkit-overflow-scrolling:touch] lg:mx-0 lg:overflow-visible lg:px-0 lg:pb-0">
          <div className="flex min-w-max gap-1 lg:min-w-0">
          {STAGES.map((s, i) => {
            const isActive = s === stage;
            const isPast = i < currentStageIdx;
            const isTerminal = s === "won" || s === "lost" || s === "matched";
            return (
              <button
                key={s}
                type="button"
                disabled={stageChange.isPending}
                onClick={() => stageChange.mutate(s)}
                className={cn(
                  "group relative min-w-[5.5rem] flex-shrink-0 rounded-lg px-1.5 py-2.5 text-center text-[11px] font-medium transition-all touch-manipulation lg:min-w-0 lg:flex-1",
                  isActive ? "bg-gray-900 text-white shadow-md" :
                  isPast ? "bg-gray-200 text-gray-700 hover:bg-gray-300" :
                  isTerminal ? "border border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600" :
                  "bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600",
                )}
              >
                <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full", isActive ? "bg-white" : STAGE_DOT[s])} />
                <span className="whitespace-nowrap">{STAGE_LABELS[s]}</span>
                {i < STAGES.length - 1 && !isTerminal && (
                  <ChevronRight className="absolute -right-1.5 top-1/2 z-10 hidden h-3.5 w-3.5 -translate-y-1/2 text-gray-300 lg:block" aria-hidden />
                )}
              </button>
            );
          })}
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
          <p className="text-xs font-medium text-gray-800">
            Current step: {getLeadStageLabel(stage)}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
            {getLeadStageDescription(stage)} Next action: {getLeadStageNextAction(stage)}
          </p>
        </div>
      </AdminPanel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Contact information */}
          <AdminPanel>
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <User className="h-4 w-4 text-gray-500" />Contact Information
            </h3>
            {isEditing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="text-xs font-medium text-gray-500">Contact Person</span>
                    <input className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-gray-500 focus:outline-none sm:text-sm" value={editDraft.contact_person_name} onChange={(e) => setEditDraft((d) => ({ ...d, contact_person_name: e.target.value }))} />
                  </label>
                  <label className="block text-sm">
                    <span className="text-xs font-medium text-gray-500">Business Name</span>
                    <input className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-gray-500 focus:outline-none sm:text-sm" value={editDraft.business_name} onChange={(e) => setEditDraft((d) => ({ ...d, business_name: e.target.value }))} />
                  </label>
                  <label className="block text-sm">
                    <span className="text-xs font-medium text-gray-500">Email</span>
                    <input type="email" className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-gray-500 focus:outline-none sm:text-sm" value={editDraft.email} onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))} />
                  </label>
                  <label className="block text-sm">
                    <span className="text-xs font-medium text-gray-500">Phone</span>
                    <input type="tel" className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-gray-500 focus:outline-none sm:text-sm" value={editDraft.phone_e164} onChange={(e) => setEditDraft((d) => ({ ...d, phone_e164: e.target.value }))} />
                  </label>
                  <label className="block text-sm">
                    <span className="text-xs font-medium text-gray-500">Location</span>
                    <input className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-gray-500 focus:outline-none sm:text-sm" value={editDraft.suggested_location_text} onChange={(e) => setEditDraft((d) => ({ ...d, suggested_location_text: e.target.value }))} />
                  </label>
                  <label className="block text-sm">
                    <span className="text-xs font-medium text-gray-500">Country</span>
                    <input className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-gray-500 focus:outline-none sm:text-sm" value={editDraft.country} onChange={(e) => setEditDraft((d) => ({ ...d, country: e.target.value }))} />
                  </label>
                </div>
                <label className="block text-sm">
                  <span className="text-xs font-medium text-gray-500">Description</span>
                  <textarea rows={3} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-gray-500 focus:outline-none sm:text-sm" value={editDraft.description} onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))} />
                </label>
                <label className="block text-sm">
                  <span className="text-xs font-medium text-gray-500">Notes</span>
                  <textarea rows={2} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-gray-500 focus:outline-none sm:text-sm" value={editDraft.notes} onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))} />
                </label>
                <label className="block text-sm">
                  <span className="text-xs font-medium text-gray-500">Referrer</span>
                  <div className="mt-1">
                    <ReferrerPicker value={editReferrer} onChange={setEditReferrer} disabled={updateLeadMut.isPending} />
                  </div>
                </label>
                <div className="flex gap-2 pt-1">
                  <button type="button" disabled={updateLeadMut.isPending} onClick={saveEdits} className="min-h-11 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 transition-colors">
                    {updateLeadMut.isPending ? "Saving…" : "Save Changes"}
                  </button>
                  <button type="button" onClick={() => setIsEditing(false)} className="min-h-11 rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <DetailField icon={User} label="Contact Person" value={lead.contact_person_name} />
                <DetailField icon={Building2} label="Business Name" value={lead.business_name} />
                <DetailField
                  icon={Mail}
                  label="Email"
                  value={hasLeadEmail(contactLead) ? lead.email : "No email"}
                  href={hasLeadEmail(contactLead) ? `mailto:${String(lead.email)}` : undefined}
                />
                <DetailField
                  icon={Phone}
                  label="Phone"
                  value={hasLeadPhone(contactLead) ? lead.phone_e164 : "No phone"}
                  href={hasLeadPhone(contactLead) ? `tel:${String(lead.phone_e164)}` : undefined}
                />
                {lead.phone_e164 ? (
                  <div className="sm:col-span-2">
                    <LeadVoiceDialer
                      leadId={String(lead.id)}
                      phoneE164={String(lead.phone_e164)}
                      tenantId={lead.tenant_id != null ? String(lead.tenant_id) : undefined}
                      doNotContact={doNotContact}
                      phoneLookupStatus={
                        lead.phone_lookup_status != null
                          ? String(lead.phone_lookup_status)
                          : undefined
                      }
                    />
                  </div>
                ) : null}
                <DetailField icon={MapPin} label="Location" value={lead.suggested_location_text} />
                <DetailField icon={Globe} label="Country" value={lead.country} />
                <DetailField icon={ExternalLink} label="Source" value={lead.source} />
                {referrerDisplay ? (
                  <DetailField icon={UserPlus} label="Referrer" value={referrerDisplay} />
                ) : null}
                <DetailField icon={Calendar} label="Created" value={lead.created_at ? new Date(String(lead.created_at)).toLocaleString() : null} />
                <DetailField
                  icon={UserPlus}
                  label="Assigned To"
                  value={lead.assigned_to ? detailAssigneeName(lead) : "Unassigned"}
                />
              </div>
            )}
          </AdminPanel>

          {/* Onboarding data preview */}
          {hasOnboardingData && (
            <AdminPanel>
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-800">
                <FileText className="h-4 w-4 text-gray-500" />Onboarding Data
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {Boolean(onboardingData!.business_type) ? <OnboardingField label="Business Type" value={String(onboardingData!.business_type)} /> : null}
                {Boolean(onboardingData!.team_size) ? <OnboardingField label="Team Size" value={String(onboardingData!.team_size)} /> : null}
                {Boolean(onboardingData!.website_url) ? <OnboardingField label="Website" value={String(onboardingData!.website_url)} /> : null}
                {onboardingData!.years_in_business != null ? <OnboardingField label="Years in Business" value={String(onboardingData!.years_in_business)} /> : null}
                {Array.isArray(onboardingData!.languages) && (onboardingData!.languages as string[]).length > 0 ? (
                  <OnboardingField label="Languages" value={(onboardingData!.languages as string[]).join(", ")} />
                ) : null}
                {Boolean(onboardingData!.address) ? (
                  <div className="sm:col-span-2">
                    <OnboardingField label="Address" value={formatAddress(onboardingData!.address as Record<string, unknown>)} />
                  </div>
                ) : null}
                {Array.isArray(onboardingData!.services) && (onboardingData!.services as Record<string, unknown>[]).length > 0 ? (
                  <div className="sm:col-span-2">
                    <OnboardingField label="Services" value={(onboardingData!.services as Record<string, unknown>[]).map((s) => `${s.name} (${s.duration_minutes}min, ${s.currency} ${s.price})`).join("; ")} />
                  </div>
                ) : null}
                {Boolean(onboardingData!.payment) ? (
                  <div className="sm:col-span-2">
                    <OnboardingField label="Payment Settings" value={formatPayment(onboardingData!.payment as Record<string, unknown>)} />
                  </div>
                ) : null}
              </div>
            </AdminPanel>
          )}

          {/* Description & notes */}
          <AdminPanel>
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <FileText className="h-4 w-4 text-gray-500" />Description & Notes
            </h3>
            {lead.description ? (
              <p className="text-sm leading-relaxed text-gray-700">{String(lead.description)}</p>
            ) : (
              <p className="text-sm italic text-gray-400">No description provided</p>
            )}
            {Boolean(lead.notes) ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm italic text-amber-800">{String(lead.notes)}</p> : null}
          </AdminPanel>

          {/* Follow-up tasks */}
          <AdminPanel>
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Calendar className="h-4 w-4 text-gray-500" />
              Follow-up tasks
              <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                {(tasksQ.data?.tasks ?? []).length}
              </span>
            </h3>
            <div className="space-y-2">
              {(tasksQ.data?.tasks ?? []).map((task) => {
                const overdue =
                  !task.completed_at &&
                  task.due_at &&
                  new Date(task.due_at).getTime() < Date.now();
                return (
                  <div
                    key={task.id}
                    className={cn(
                      "flex items-start justify-between gap-3 rounded-lg border px-3 py-2",
                      overdue ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50",
                    )}
                  >
                    <div>
                      <p className={cn("text-sm font-medium", task.completed_at ? "text-gray-400 line-through" : "text-gray-900")}>
                        {task.title}
                      </p>
                      {task.due_at ? (
                        <p className={cn("text-xs", overdue ? "text-red-700" : "text-gray-500")}>
                          Due {new Date(task.due_at).toLocaleString()}
                        </p>
                      ) : null}
                    </div>
                    {!task.completed_at ? (
                      <button
                        type="button"
                        onClick={() => completeTaskMut.mutate(task.id)}
                        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-100"
                      >
                        Complete
                      </button>
                    ) : (
                      <span className="text-xs text-green-700">Done</span>
                    )}
                  </div>
                );
              })}
            </div>
            <form
              className="mt-4 flex flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (!taskTitle.trim()) return;
                createTaskMut.mutate();
              }}
            >
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="New follow-up task…"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="datetime-local"
                value={taskDueAt}
                onChange={(e) => setTaskDueAt(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={createTaskMut.isPending || !taskTitle.trim()}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                Add task
              </button>
            </form>
          </AdminPanel>

          {/* Communications log */}
          <AdminPanel>
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <MessageSquare className="h-4 w-4 text-gray-500" />
              Communications
            </h3>
            {(commsQ.data?.communications ?? []).length > 0 ? (
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {(commsQ.data?.communications ?? []).map((comm) => (
                  <li key={comm.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium capitalize text-gray-800">
                        {comm.channel} · {comm.direction}
                      </span>
                      <span className="text-xs text-gray-500">{comm.status ?? "sent"}</span>
                    </div>
                    {comm.subject ? <p className="mt-1 text-xs font-medium text-gray-700">{comm.subject}</p> : null}
                    {comm.body ? (
                      <p className="mt-1 line-clamp-2 text-xs text-gray-600">{comm.body}</p>
                    ) : null}
                    <p className="mt-1 text-[10px] text-gray-400">
                      {new Date(comm.created_at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">No outbound communications logged yet.</p>
            )}
          </AdminPanel>

          {/* Activity timeline */}
          <AdminPanel>
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Clock className="h-4 w-4 text-gray-500" />Activity Timeline
              <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{activities.length}</span>
            </h3>

            {activities.length > 0 ? (
              <div className="relative max-h-[500px] overflow-y-auto">
                <div className="absolute left-4 top-4 bottom-0 w-px bg-gray-200" />
                <div className="space-y-0">
                  {activities.map((a, i) => {
                    const Icon = ACTIVITY_ICON_MAP[a.activity_type] || ACTIVITY_ICON_MAP.default;
                    const colors = ACTIVITY_COLOR_MAP[a.activity_type] || ACTIVITY_COLOR_MAP.default;
                    return (
                      <div key={a.id ?? i} className="group relative flex gap-4 py-3 hover:bg-gray-50/50 rounded-lg px-1 transition-colors">
                        <div className={cn("relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full", colors.bg)}>
                          <Icon className={cn("h-3.5 w-3.5", colors.text)} />
                        </div>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="inline-block rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-500">
                                {a.activity_type.replace(/_/g, " ")}
                              </span>
                              <p className="mt-1 text-sm text-gray-800">{a.description || a.activity_type.replace(/_/g, " ")}</p>
                            </div>
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                            <span>{new Date(a.created_at).toLocaleString()}</span>
                            {a.created_by_name && <span className="flex items-center gap-1"><User className="h-3 w-3" />{a.created_by_name}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center">
                <Clock className="mx-auto h-6 w-6 text-gray-300" />
                <p className="mt-2 text-sm text-gray-400">No activities yet</p>
                <p className="text-xs text-gray-300">Add a note below to start tracking</p>
              </div>
            )}

            {/* Add note */}
            <div className="mt-4 flex flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:items-end">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 sm:mb-0.5">
                <StickyNote className="h-3.5 w-3.5 text-blue-600" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  ref={noteInputRef}
                  type="text"
                  placeholder="Add a note…"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && noteText.trim() && addNote.mutate()}
                  className="min-h-11 w-full flex-1 rounded-lg border border-gray-200 px-3 py-2 text-base placeholder:text-gray-400 focus:border-gray-400 focus:outline-none sm:text-sm"
                />
                <button
                  type="button"
                  disabled={!noteText.trim() || addNote.isPending}
                  className="min-h-11 w-full shrink-0 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-gray-800 transition-colors touch-manipulation sm:w-auto"
                  onClick={() => addNote.mutate()}
                >
                  Add Note
                </button>
                <button
                  type="button"
                  disabled={logCall.isPending}
                  title="Log a phone call (uses the text above as the call summary)"
                  className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 disabled:opacity-50 hover:bg-emerald-100 transition-colors touch-manipulation sm:w-auto"
                  onClick={() => logCall.mutate()}
                >
                  <Phone className="h-3.5 w-3.5" />
                  Log call
                </button>
              </div>
            </div>
          </AdminPanel>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Conversion actions */}
          {!lead.matched_provider_id && (
            <AdminPanel className="!border-indigo-200 !bg-indigo-50/30">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-indigo-800">
                <ArrowRightCircle className="h-4 w-4 text-indigo-600" />Conversion
              </h3>
              <div className="space-y-2">
                {canConvert && (
                  <button
                    type="button"
                    onClick={() => setShowConvertModal(true)}
                    disabled={convertMut.isPending}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    <ArrowRightCircle className="h-4 w-4" />
                    Convert to Provider
                  </button>
                )}
                {!canConvert && !lead.matched_provider_id && (
                  <p className="text-xs text-indigo-600/70">
                    Move lead to &ldquo;Won&rdquo; or &ldquo;Qualified&rdquo; stage to enable conversion.
                  </p>
                )}
                {hasEmail && (
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(true)}
                    disabled={inviteMut.isPending}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-indigo-300 bg-white px-4 py-2.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 transition-colors"
                  >
                    <Send className="h-4 w-4" />
                    Send Onboarding Link
                  </button>
                )}
                {lead.invite_sent_at != null ? (
                  <p className="mt-1 text-[11px] text-indigo-500">
                    Last invite sent: {new Date(String(lead.invite_sent_at)).toLocaleString()}
                  </p>
                ) : null}
              </div>
            </AdminPanel>
          )}

          {/* WhatsApp */}
          <LeadWhatsAppPanel lead={lead as any} />

          {/* Stage change */}
          <AdminPanel>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <TrendingUp className="h-4 w-4 text-gray-500" />Change Stage
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {STAGES.map((s) => (
                <button key={s} type="button" disabled={stageChange.isPending} onClick={() => stageChange.mutate(s)} className={cn(
                "min-h-11 rounded-full px-3 py-1.5 text-xs font-medium transition-all touch-manipulation",
                  s === stage ? "bg-gray-900 text-white shadow-md" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:shadow-sm",
                )}>
                  <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full", s === stage ? "bg-white" : STAGE_DOT[s])} />
                  {STAGE_LABELS[s]}
                </button>
              ))}
            </div>
          </AdminPanel>

          {/* Categories */}
          {categories.length > 0 && (
            <AdminPanel>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
                <Tag className="h-4 w-4 text-gray-500" />Categories
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <span key={c.global_category_id} className="inline-flex items-center rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-700">
                    {c.global_service_categories?.icon ? `${c.global_service_categories.icon} ` : ""}{c.global_service_categories?.name ?? c.global_category_id}
                  </span>
                ))}
              </div>
            </AdminPanel>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <AdminPanel>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
                <Tag className="h-4 w-4 text-gray-500" />Tags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                    <Tag className="h-2.5 w-2.5" />{tag}
                  </span>
                ))}
              </div>
            </AdminPanel>
          )}

          {/* Lead source detail */}
          <AdminPanel>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <ExternalLink className="h-4 w-4 text-gray-500" />Lead Source
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Source</span>
                <span className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700">{String(lead.source ?? "—")}</span>
              </div>
              {referrerDisplay ? (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Referrer</span>
                  <span className="text-xs font-medium text-gray-700">{referrerDisplay}</span>
                </div>
              ) : null}
              {lead.source_detail && !referrerDisplay ? (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Source detail</span>
                  <span className="text-xs text-gray-700">{String(lead.source_detail)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Created</span>
                <span className="text-xs text-gray-700">{lead.created_at ? new Date(String(lead.created_at)).toLocaleDateString() : "—"}</span>
              </div>
              {Boolean(lead.assigned_to) ? (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Assigned to</span>
                  <span className="text-xs font-medium text-gray-700">{detailAssigneeName(lead)}</span>
                </div>
              ) : null}
            </div>
          </AdminPanel>

          {/* Matched provider */}
          {typeof lead.matched_provider_id === "string" && lead.matched_provider_id && (
            <AdminPanel className="!border-green-200 !bg-green-50">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-green-800">
                <User className="h-4 w-4 text-green-600" />Matched Provider
              </h3>
              <Link to={adminSpaTo(`/admin/providers/${lead.matched_provider_id}`)} className="inline-flex items-center gap-1.5 text-sm text-green-700 underline decoration-green-300 hover:decoration-green-500 transition-colors">
                View Provider <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </AdminPanel>
          )}
        </div>
      </div>

      {/* Convert modal */}
      <AdminModal
        open={showConvertModal}
        onClose={() => setShowConvertModal(false)}
        title="Convert Lead to Provider"
        description="Choose how to convert this lead into a provider account."
        footer={
          <button
            type="button"
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            onClick={() => setShowConvertModal(false)}
          >
            Cancel
          </button>
        }
      >
        <div className="space-y-4">
          {hasOnboardingData && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-xs font-medium text-blue-800">Pre-filled onboarding data available</p>
              <p className="mt-1 text-xs text-blue-600">
                {[
                  Boolean(onboardingData!.business_type) ? `Type: ${String(onboardingData!.business_type)}` : "",
                  Boolean(onboardingData!.team_size) ? `Team: ${String(onboardingData!.team_size)}` : "",
                  Array.isArray(onboardingData!.services) ? `${(onboardingData!.services as unknown[]).length} service(s)` : "",
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
          )}
          <button
            type="button"
            disabled={convertMut.isPending}
            onClick={() => convertMut.mutate("assisted")}
            className="flex w-full flex-col rounded-xl border-2 border-gray-200 p-4 text-left hover:border-indigo-400 hover:bg-indigo-50/50 transition-all disabled:opacity-50"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <UserPlus className="h-4 w-4 text-indigo-600" />
              Assisted Onboarding
            </span>
            <span className="mt-1 text-xs text-gray-500">
              Create the provider account directly using lead data. A password reset email will be sent.
            </span>
          </button>
          <button
            type="button"
            disabled={convertMut.isPending || !hasEmail}
            onClick={() => convertMut.mutate("invite")}
            className="flex w-full flex-col rounded-xl border-2 border-gray-200 p-4 text-left hover:border-indigo-400 hover:bg-indigo-50/50 transition-all disabled:opacity-50"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Send className="h-4 w-4 text-indigo-600" />
              Send Onboarding Invite
            </span>
            <span className="mt-1 text-xs text-gray-500">
              Send an invite link to the lead&apos;s email to complete self-service onboarding with pre-filled data.
            </span>
          </button>
        </div>
      </AdminModal>

      {/* Invite modal */}
      <AdminModal
        open={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        title="Send Onboarding Link"
        description="Generate an onboarding invite link for this lead."
        footer={
          <>
            <button
              type="button"
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={() => setShowInviteModal(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={inviteMut.isPending}
              onClick={() => inviteMut.mutate(inviteChannel)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {inviteMut.isPending ? "Sending..." : "Send Invite"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            This sends the lead a unique onboarding link plus the Provider app download
            links over the selected channel. If that channel isn&apos;t configured, the link
            is still generated for you to copy and send manually.
          </p>
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500">Send via</label>
            <div className="flex gap-3">
              <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-colors ${inviteChannel === "email" ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                <input type="radio" name="inviteChannel" value="email" checked={inviteChannel === "email"} onChange={() => setInviteChannel("email")} className="sr-only" />
                <Mail className="h-4 w-4" /> Email
                {Boolean(lead.email) ? <span className="text-xs text-gray-400">({String(lead.email)})</span> : null}
              </label>
              <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-colors ${inviteChannel === "sms" ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600 hover:border-gray-300"} ${!lead.phone_e164 ? "opacity-50 cursor-not-allowed" : ""}`}>
                <input type="radio" name="inviteChannel" value="sms" checked={inviteChannel === "sms"} onChange={() => { if (lead.phone_e164) setInviteChannel("sms"); }} className="sr-only" disabled={!lead.phone_e164} />
                <Phone className="h-4 w-4" /> SMS
                {Boolean(lead.phone_e164) ? <span className="text-xs text-gray-400">({String(lead.phone_e164)})</span> : null}
              </label>
            </div>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}

function DetailField({ icon: Icon, label, value, href }: { icon: typeof User; label: string; value: unknown; href?: string }) {
  const text = value ? String(value) : null;
  return (
    <div className="flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-gray-50">
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
        {href && text ? (
          <a href={href} className="text-sm text-blue-600 hover:underline">{text}</a>
        ) : (
          <p className="text-sm text-gray-800">{text || "—"}</p>
        )}
      </div>
    </div>
  );
}

function OnboardingField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white p-2">
      <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm text-gray-800">{value}</p>
    </div>
  );
}

function formatAddress(addr: Record<string, unknown>): string {
  const parts = [
    addr.address_line1,
    addr.address_line2,
    addr.city,
    addr.state,
    addr.postal_code,
    addr.country,
  ]
    .filter(Boolean)
    .map(String);
  return parts.join(", ") || "—";
}

function formatPayment(payment: Record<string, unknown>): string {
  const parts: string[] = [];
  if (payment.is_vat_registered) parts.push(`VAT: ${payment.vat_number || "Yes"}`);
  if (payment.accepts_tips) parts.push("Tips: Yes");
  if (payment.cancellation_window_hours) parts.push(`Cancel window: ${payment.cancellation_window_hours}h`);
  if (payment.requires_deposit) parts.push(`Deposit: ${payment.deposit_percentage || "?"}%`);
  return parts.join(" · ") || "—";
}
