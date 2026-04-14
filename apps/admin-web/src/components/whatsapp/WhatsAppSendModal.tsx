import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { AdminModal } from "@/components/admin/AdminModal";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { Loader2, Send, CheckCircle2, MessageCircle } from "lucide-react";
import { cn } from "@/lib/cn";

interface WhatsAppSendModalProps {
  open: boolean;
  onClose: () => void;
  lead: {
    id: string;
    contact_person_name?: string | null;
    lead_name?: string | null;
    business_name?: string | null;
    phone_e164?: string | null;
    email?: string | null;
    whatsapp_status?: string;
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

export function WhatsAppSendModal({ open, onClose, lead }: WhatsAppSendModalProps) {
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const sessionsQuery = useQuery({
    queryKey: adminQueryKeys.whatsapp.sessions(),
    queryFn: () => adminApi.getJson<Session[]>("/api/admin/whatsapp/sessions"),
    enabled: open,
  });

  const templatesQuery = useQuery({
    queryKey: adminQueryKeys.whatsapp.templates(),
    queryFn: () => adminApi.getJson<Template[]>("/api/admin/whatsapp/templates"),
    enabled: open,
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      adminApi.postJson("/api/admin/whatsapp/send", {
        lead_id: lead.id,
        session_id: sessionId,
        template_id: templateId || undefined,
        message: message || undefined,
      }),
    onSuccess: () => {
      const name = lead.contact_person_name || lead.lead_name || lead.business_name || "Lead";
      adminToast.success(`Message sent to ${name}`);
      setSent(true);
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadActivities(lead.id) });
      setTimeout(() => {
        onClose();
        setSent(false);
        setMessage("");
        setTemplateId("");
      }, 1500);
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

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

  const handleTemplateChange = (tid: string) => {
    setTemplateId(tid);
    const tpl = (templatesQuery.data || []).find((t) => t.id === tid);
    if (tpl) setMessage(resolveLocal(tpl.body));
    else setMessage("");
  };

  // Auto-select session
  useEffect(() => {
    if (!open) return;
    const active = (sessionsQuery.data || []).filter((s) => s.status === "connected" && !s.is_paused);
    if (active.length === 1 && !sessionId) setSessionId(active[0].id);
  }, [open, sessionsQuery.data, sessionId]);

  const leadName = lead.contact_person_name || lead.lead_name || lead.business_name || "Lead";
  const sessions = sessionsQuery.data || [];
  const templates = templatesQuery.data || [];

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Send WhatsApp"
      size="lg"
      footer={
        sent ? null : (
          <div className="flex gap-3">
            <button className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm" onClick={onClose}>Cancel</button>
            <button
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-medium text-white",
                "bg-green-600 hover:bg-green-700 disabled:opacity-50",
              )}
              disabled={sendMutation.isPending || !message.trim() || !sessionId}
              onClick={() => sendMutation.mutate()}
            >
              {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sendMutation.isPending ? "Sending…" : "Send"}
            </button>
          </div>
        )
      }
    >
      {sent ? (
        <div className="flex flex-col items-center gap-3 py-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-7 w-7 text-green-600" />
          </div>
          <p className="text-sm font-medium text-gray-900">Message sent to {leadName}!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Lead info */}
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-3">
            <MessageCircle className="h-4 w-4 text-green-600" />
            <div>
              <p className="text-sm font-medium text-gray-900">{leadName}</p>
              <p className="text-xs text-gray-500">{lead.phone_e164 || "No phone"}</p>
            </div>
          </div>

          {/* Session selector */}
          {sessions.length > 1 && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Sending from</label>
              <select
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
              >
                <option value="">Select session…</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id} disabled={s.status !== "connected" || s.is_paused}>
                    {s.name} {s.phone_number ? `(${s.phone_number})` : ""} {s.status !== "connected" ? "(offline)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Template selector */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Template</label>
            <select
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
              value={templateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
            >
              <option value="">Choose template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name} — {t.body.slice(0, 40)}…</option>
              ))}
            </select>
          </div>

          {/* Message */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Message</label>
            <textarea
              className="min-h-[100px] w-full resize-y rounded-xl border border-gray-200 p-3 text-sm focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400/30"
              placeholder="Select a template or type a message…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </div>
      )}
    </AdminModal>
  );
}
