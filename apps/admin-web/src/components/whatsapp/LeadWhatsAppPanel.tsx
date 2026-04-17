import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { MessageCircle, CheckCircle2, XCircle, AlertTriangle, HelpCircle, Loader2, Send, Clock } from "lucide-react";
import { cn } from "@/lib/cn";

interface LeadWhatsAppPanelProps {
  lead: {
    id: string;
    phone_e164?: string | null;
    whatsapp_status?: string | null;
    whatsapp_checked_at?: string | null;
    contact_person_name?: string;
    lead_name?: string;
    business_name?: string;
    email?: string;
  };
}

interface Session {
  id: string;
  name: string;
  phone_number: string | null;
  status: string;
  is_paused: boolean;
}

interface Template {
  id: string;
  name: string;
  category: string;
  body: string;
}

interface CommEntry {
  id: string;
  body: string;
  status: string;
  created_at: string;
  direction: string;
}

const STATUS_BADGE: Record<string, { bg: string; text: string; icon: typeof CheckCircle2; label: string }> = {
  verified: { bg: "bg-green-100", text: "text-green-700", icon: CheckCircle2, label: "On WhatsApp" },
  not_found: { bg: "bg-red-100", text: "text-red-600", icon: XCircle, label: "Not on WhatsApp" },
  check_failed: { bg: "bg-amber-100", text: "text-amber-700", icon: AlertTriangle, label: "Check failed" },
  unknown: { bg: "bg-gray-100", text: "text-gray-500", icon: HelpCircle, label: "Not checked" },
};

const MSG_STATUS_DOT: Record<string, string> = {
  delivered: "bg-green-500",
  sent: "bg-blue-500",
  failed: "bg-red-500",
  queued: "bg-gray-400",
  sending: "bg-blue-400",
};

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const CATEGORY_ORDER = ["cold_intro", "follow_up", "hot_lead", "pricing_info", "re_engagement", "custom"];
const CATEGORY_LABELS: Record<string, string> = {
  cold_intro: "Cold Intro",
  follow_up: "Follow-up",
  hot_lead: "Hot Lead",
  pricing_info: "Pricing Info",
  re_engagement: "Re-engagement",
  custom: "Custom",
};

export function LeadWhatsAppPanel({ lead }: LeadWhatsAppPanelProps) {
  const qc = useQueryClient();
  const [selectedSession, setSelectedSession] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [message, setMessage] = useState("");
  const [sendSuccess, setSendSuccess] = useState(false);

  const hasPhone = Boolean(lead.phone_e164);
  const waStatus = lead.whatsapp_status || "unknown";
  const badge = STATUS_BADGE[waStatus] || STATUS_BADGE.unknown;
  const BadgeIcon = badge.icon;

  const sessionsQuery = useQuery({
    queryKey: adminQueryKeys.whatsapp.sessions(),
    queryFn: () => adminApi.getJson<Session[]>("/api/admin/whatsapp/sessions"),
    enabled: hasPhone,
  });

  const templatesQuery = useQuery({
    queryKey: adminQueryKeys.whatsapp.templates(),
    queryFn: () => adminApi.getJson<Template[]>("/api/admin/whatsapp/templates"),
    enabled: hasPhone,
  });

  const commsQuery = useQuery({
    queryKey: adminQueryKeys.whatsapp.leadComms(lead.id),
    queryFn: () =>
      adminApi.getJson<CommEntry[]>(
        `/api/admin/provider-ops/leads/${lead.id}/activities?channel=whatsapp&limit=5`,
      ),
    enabled: hasPhone,
  });

  const verifyMutation = useMutation({
    mutationFn: () =>
      adminApi.postJson("/api/admin/whatsapp/verify-number", { phone_e164: lead.phone_e164, lead_id: lead.id }),
    onSuccess: (data: any) => {
      const status = data?.check_status || "unknown";
      adminToast.success(
        status === "verified" ? "Number is on WhatsApp!" :
        status === "not_found" ? "Number not found on WhatsApp" :
        "Verification failed"
      );
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadDetail(lead.id) });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      adminApi.postJson("/api/admin/whatsapp/send", {
        lead_id: lead.id,
        session_id: selectedSession,
        template_id: selectedTemplate || undefined,
        message: message || undefined,
      }),
    onSuccess: () => {
      const name = lead.contact_person_name || lead.lead_name || lead.business_name || "Lead";
      adminToast.success(`Message sent to ${name}`);
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 2000);
      setMessage("");
      setSelectedTemplate("");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.whatsapp.leadComms(lead.id) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadActivities(lead.id) });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  // Resolve template placeholders locally for preview
  const resolveLocal = (body: string): string => {
    const nameStr = String(lead.contact_person_name || lead.lead_name || lead.business_name || "");
    const parts = nameStr.trim().split(/\s+/);
    const vars: Record<string, string> = {
      first_name: parts[0] || "",
      last_name: parts.slice(1).join(" ") || "",
      full_name: nameStr.trim(),
      email: String(lead.email || ""),
      phone: String(lead.phone_e164 || ""),
      business_name: String(lead.business_name || ""),
    };
    return body.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k.toLowerCase()] ?? `{{${k}}}`);
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    if (!templateId) { setMessage(""); return; }
    const tpl = (templatesQuery.data || []).find((t) => t.id === templateId);
    if (tpl) setMessage(resolveLocal(tpl.body));
  };

  // Auto-select session if only one
  const activeSessions = (sessionsQuery.data || []).filter((s) => s.status === "connected" && !s.is_paused);
  if (activeSessions.length === 1 && !selectedSession) {
    setSelectedSession(activeSessions[0].id);
  }

  // Group templates by category
  const templates = templatesQuery.data || [];
  const groupedTemplates = CATEGORY_ORDER
    .map((cat) => ({ cat, items: templates.filter((t) => t.category === cat) }))
    .filter((g) => g.items.length > 0);

  const recentComms = (commsQuery.data || []) as CommEntry[];

  if (!hasPhone) {
    return (
      <AdminPanel className="!border-gray-200 !bg-gray-50/50">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <MessageCircle className="h-4 w-4" />
          <span>WhatsApp — No phone number</span>
        </div>
      </AdminPanel>
    );
  }

  return (
    <div id="whatsapp-panel">
    <AdminPanel className="!border-green-200 !bg-green-50/20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-green-600" />
          <span className="text-sm font-semibold text-gray-900">WhatsApp</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", badge.bg, badge.text)}>
            <BadgeIcon className="h-3 w-3" />
            {badge.label}
          </span>
          <button
            className="text-xs text-green-600 hover:underline disabled:opacity-50"
            disabled={verifyMutation.isPending}
            onClick={() => verifyMutation.mutate()}
          >
            {verifyMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Verify"}
          </button>
        </div>
      </div>

      {/* Session selector */}
      {activeSessions.length > 1 && (
        <div className="mt-3">
          <select
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
          >
            <option value="">Select session…</option>
            {(sessionsQuery.data || []).map((s) => (
              <option key={s.id} value={s.id} disabled={s.status !== "connected" || s.is_paused}>
                {s.name} {s.phone_number ? `(${s.phone_number})` : ""} {s.status !== "connected" ? "(offline)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Template selector */}
      <div className="mt-3">
        <select
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
          value={selectedTemplate}
          onChange={(e) => handleTemplateChange(e.target.value)}
        >
          <option value="">Select template…</option>
          {groupedTemplates.map((g) => (
            <optgroup key={g.cat} label={CATEGORY_LABELS[g.cat] || g.cat}>
              {g.items.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Message editor */}
      <div className="mt-3">
        <textarea
          className="min-h-[100px] w-full resize-y rounded-xl border border-gray-200 p-3 text-sm focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400/30"
          placeholder="Select a template or type a message…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <p className={cn("text-right text-[11px]", message.length > 1000 ? "text-amber-500" : "text-gray-400")}>
          {message.length} chars
        </p>
      </div>

      {/* Send button */}
      <button
        className={cn(
          "mt-2 w-full min-h-11 rounded-xl font-medium text-white text-sm transition-colors flex items-center justify-center gap-2",
          sendSuccess ? "bg-green-500" : "bg-green-600 hover:bg-green-700",
          (sendMutation.isPending || !message.trim() || !selectedSession) && "opacity-60 pointer-events-none",
        )}
        disabled={sendMutation.isPending || !message.trim() || !selectedSession}
        onClick={() => sendMutation.mutate()}
      >
        {sendMutation.isPending ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
        ) : sendSuccess ? (
          <><CheckCircle2 className="h-4 w-4" /> Sent!</>
        ) : (
          <><Send className="h-4 w-4" /> Send WhatsApp</>
        )}
      </button>

      {/* Recent activity */}
      <div className="mt-4 border-t border-green-100 pt-3">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-gray-400">Recent Activity</p>
        {recentComms.length === 0 ? (
          <p className="text-xs italic text-gray-400">No WhatsApp messages yet</p>
        ) : (
          <div className="space-y-2">
            {recentComms.map((c) => (
              <div key={c.id} className="flex items-start gap-2 text-xs">
                <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", MSG_STATUS_DOT[c.status] || "bg-gray-300")} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-gray-700">{c.body?.slice(0, 60)}</p>
                  <p className="text-gray-400">
                    <Clock className="mb-0.5 inline h-2.5 w-2.5" /> {relativeTime(c.created_at)}
                    {c.direction === "inbound" && <span className="ml-1 text-blue-500">← reply</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminPanel>
    </div>
  );
}
