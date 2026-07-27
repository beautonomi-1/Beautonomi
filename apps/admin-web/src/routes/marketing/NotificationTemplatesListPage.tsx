import { Link, useSearchParams } from "react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { cn } from "@/lib/cn";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminModal } from "@/components/admin/AdminModal";
import { Bell, Edit, Mail, MessageSquare, Plus, Search, Smartphone, Trash2 } from "lucide-react";
import { NotificationDeliveryLogsTab } from "./NotificationDeliveryLogsTab";

type Template = {
  id: string;
  key?: string;
  name?: string;
  type?: string;
  title?: string;
  title_template?: string;
  body?: string;
  message_template?: string;
  email_subject?: string;
  email_body?: string;
  sms_body?: string;
  whatsapp_body?: string;
  whatsapp_content_sid?: string;
  whatsapp_category?: string;
  whatsapp_template_status?: string;
  whatsapp_approval_name?: string;
  whatsapp_content_error?: string;
  whatsapp_content_variables?: WhatsappVarMapping[];
  whatsapp_content_type?: string;
  whatsapp_content_definition?: { media_url?: string };
  whatsapp_content_hash?: string;
  channel_waterfall?: string[];
  channels?: string[];
  enabled?: boolean;
  description?: string;
  url?: string;
  variables?: string[];
};

type Payload = { templates: Template[] };

/** Stable reference so create-mode `TemplateEditor` does not reset on parent re-renders. */
const EMPTY_TEMPLATE_INITIAL: Partial<Template> = {};

/** Preset keys aligned with legacy Next admin (single source for notification content). */
const NOTIFICATION_TYPE_PRESETS = [
  { value: "appointment_reminder", label: "Appointment Reminder" },
  { value: "appointment_cancelled", label: "Appointment Cancelled" },
  { value: "appointment_rescheduled", label: "Appointment Rescheduled" },
  { value: "new_appointment", label: "New Appointment" },
  { value: "payment_received", label: "Payment Received" },
  { value: "payout_processed", label: "Payout Processed" },
  { value: "refund_processed", label: "Refund Processed" },
  { value: "new_client", label: "New Client" },
  { value: "client_message", label: "Client Message" },
  { value: "staff_clock_in", label: "Staff Clock In" },
  { value: "staff_clock_out", label: "Staff Clock Out" },
  { value: "shift_reminder", label: "Shift Reminder" },
  { value: "service_booking", label: "Service Booking" },
  { value: "product_order", label: "Product Order" },
  { value: "team_member_added", label: "Team Member Added" },
  { value: "team_member_updated", label: "Team Member Updated" },
  { value: "system_update", label: "System Update" },
  { value: "maintenance", label: "Maintenance" },
  { value: "report_ready", label: "Report Ready" },
  { value: "document_ready", label: "Document Ready" },
  { value: "payment_failed", label: "Payment Failed" },
  { value: "subscription_expiring", label: "Subscription Expiring" },
  { value: "account_verification", label: "Account Verification" },
  { value: "high_priority", label: "High Priority" },
] as const;

const CHANNEL_KEYS = ["email", "sms", "push", "in_app", "whatsapp"] as const;

const WATERFALL_CHANNELS = ["whatsapp", "sms", "email"] as const;

type WhatsappVarMapping = { ordinal: number; var: string; sample?: string };

function extractNamedVars(text: string): string[] {
  const re = /\{\{([^}]+)\}\}/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const v = m[1].trim();
    if (v && !/^\d+$/.test(v) && !out.includes(v)) out.push(v);
  }
  return out;
}

function parseVarMappings(raw: unknown): WhatsappVarMapping[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row, i) => {
      const r = row as { ordinal?: number; var?: string; sample?: string };
      return {
        ordinal: typeof r.ordinal === "number" ? r.ordinal : i + 1,
        var: String(r.var ?? ""),
        sample: r.sample,
      };
    })
    .filter((m) => m.var);
}

function normalizeWaterfall(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...WATERFALL_CHANNELS];
  const allowed = new Set<string>(WATERFALL_CHANNELS);
  const out = raw.map(String).filter((c) => allowed.has(c));
  return out.length > 0 ? out : [...WATERFALL_CHANNELS];
}

function normalizeChannelsForApi(ch: string[]): string[] {
  const allowed = new Set(["push", "email", "sms", "live_activities", "whatsapp"]);
  const mapped = ch.map((c) => (c === "in_app" ? "push" : c));
  const out = Array.from(new Set(mapped.filter((c) => allowed.has(c))));
  return out.length > 0 ? out : ["push"];
}

function channelsForForm(stored?: string[]): string[] {
  const base = Array.isArray(stored) ? [...stored] : ["push"];
  return base;
}

function TemplateEditor({
  mode,
  initial,
  onSave,
  onCancel,
  isSaving,
  error,
}: {
  mode: "create" | "edit";
  initial: Partial<Template>;
  onSave: (d: Record<string, unknown>) => void;
  onCancel: () => void;
  isSaving: boolean;
  error?: string | null;
}) {
  const [key, setKey] = useState(initial.key ?? initial.name ?? "");
  const [typePreset, setTypePreset] = useState(initial.type ?? initial.key ?? "");
  const [title, setTitle] = useState(initial.title ?? initial.title_template ?? "");
  const [body, setBody] = useState(initial.body ?? initial.message_template ?? "");
  const [emailSubject, setEmailSubject] = useState(initial.email_subject ?? "");
  const [emailBody, setEmailBody] = useState(initial.email_body ?? "");
  const [smsBody, setSmsBody] = useState(initial.sms_body ?? "");
  const [whatsappBody, setWhatsappBody] = useState(initial.whatsapp_body ?? initial.sms_body ?? "");
  const [whatsappCategory, setWhatsappCategory] = useState(initial.whatsapp_category ?? "utility");
  const [whatsappApprovalName, setWhatsappApprovalName] = useState(initial.whatsapp_approval_name ?? "");
  const [whatsappStatus, setWhatsappStatus] = useState(initial.whatsapp_template_status ?? "unknown");
  const [whatsappContentSid, setWhatsappContentSid] = useState(initial.whatsapp_content_sid ?? "");
  const [whatsappContentType, setWhatsappContentType] = useState(
    initial.whatsapp_content_type ?? "twilio/text",
  );
  const [whatsappMediaUrl, setWhatsappMediaUrl] = useState(
    initial.whatsapp_content_definition?.media_url ?? "",
  );
  const [whatsappVarMappings, setWhatsappVarMappings] = useState<WhatsappVarMapping[]>(() =>
    parseVarMappings(initial.whatsapp_content_variables),
  );
  const [channelWaterfall, setChannelWaterfall] = useState<string[]>(() =>
    normalizeWaterfall(initial.channel_waterfall),
  );
  const [whatsappPushBusy, setWhatsappPushBusy] = useState(false);
  const [readinessScore, setReadinessScore] = useState<number | null>(null);
  const [readinessFatal, setReadinessFatal] = useState<string[]>([]);
  const [readinessWarnings, setReadinessWarnings] = useState<string[]>([]);
  const [channels, setChannels] = useState<string[]>(() => channelsForForm(initial.channels));
  const [enabled, setEnabled] = useState(initial.enabled !== false);
  const [description, setDescription] = useState(initial.description ?? "");
  const [url, setUrl] = useState(initial.url ?? "");
  const [variablesStr, setVariablesStr] = useState(
    () => (Array.isArray(initial.variables) ? initial.variables.join(", ") : ""),
  );

  useEffect(() => {
    setKey(initial.key ?? initial.name ?? "");
    setTypePreset(initial.type ?? initial.key ?? "");
    setTitle(initial.title ?? initial.title_template ?? "");
    setBody(initial.body ?? initial.message_template ?? "");
    setEmailSubject(initial.email_subject ?? "");
    setEmailBody(initial.email_body ?? "");
    setSmsBody(initial.sms_body ?? "");
    setWhatsappBody(initial.whatsapp_body ?? initial.sms_body ?? "");
    setWhatsappCategory(initial.whatsapp_category ?? "utility");
    setWhatsappApprovalName(initial.whatsapp_approval_name ?? "");
    setWhatsappStatus(initial.whatsapp_template_status ?? "unknown");
    setWhatsappContentSid(initial.whatsapp_content_sid ?? "");
    setWhatsappContentType(initial.whatsapp_content_type ?? "twilio/text");
    setWhatsappMediaUrl(initial.whatsapp_content_definition?.media_url ?? "");
    setWhatsappVarMappings(parseVarMappings(initial.whatsapp_content_variables));
    setChannelWaterfall(normalizeWaterfall(initial.channel_waterfall));
    setChannels(channelsForForm(initial.channels));
    setEnabled(initial.enabled !== false);
    setDescription(initial.description ?? "");
    setUrl(initial.url ?? "");
    setVariablesStr(Array.isArray(initial.variables) ? initial.variables.join(", ") : "");
  }, [initial]);

  const toggleChannel = (ch: string) => {
    setChannels((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));
  };

  const applyPreset = (value: string) => {
    setTypePreset(value);
    if (mode === "create" && value && !key.trim()) {
      setKey(value);
    }
  };

  const handleSubmit = () => {
    const k = key.trim().replace(/\s+/g, "_").toLowerCase();
    if (!k) return;
    if (!title.trim()) return;
    const variables = variablesStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const payload: Record<string, unknown> = {
      key: k,
      title: title.trim(),
      body: body.trim(),
      channels: normalizeChannelsForApi(channels),
      enabled,
      variables,
      email_subject: emailSubject.trim() || null,
      email_body: emailBody.trim() || null,
      sms_body: smsBody.trim() || null,
      whatsapp_body: whatsappBody.trim() || null,
      whatsapp_category: whatsappCategory,
      whatsapp_approval_name: whatsappApprovalName.trim() || null,
      whatsapp_content_sid: whatsappContentSid.trim() || null,
      whatsapp_content_type: whatsappContentType,
      whatsapp_content_definition:
        whatsappContentType === "twilio/media" && whatsappMediaUrl.trim()
          ? { media_url: whatsappMediaUrl.trim() }
          : null,
      whatsapp_content_variables: whatsappVarMappings,
      channel_waterfall: channelWaterfall,
      url: url.trim() || null,
      description: description.trim() || null,
    };
    onSave(payload);
  };

  const emailOn = channels.includes("email");
  const smsOn = channels.includes("sms");
  const whatsappOn = channels.includes("whatsapp");

  useEffect(() => {
    if (!whatsappOn) return;
    const t = window.setTimeout(() => {
      void adminApi
        .postJson<{ fatal?: string[]; warnings?: string[]; score?: number }>(
          "/api/admin/notification-templates/whatsapp/validate-readiness",
          {
            key: key || typePreset,
            body,
            whatsapp_body: whatsappBody,
            whatsapp_category: whatsappCategory,
            whatsapp_approval_name: whatsappApprovalName,
            whatsapp_content_variables: whatsappVarMappings,
            whatsapp_content_type: whatsappContentType,
          },
        )
        .then((res) => {
          setReadinessFatal(res.fatal ?? []);
          setReadinessWarnings(res.warnings ?? []);
          setReadinessScore(typeof res.score === "number" ? res.score : null);
        })
        .catch(() => {
          setReadinessFatal([]);
          setReadinessWarnings([]);
          setReadinessScore(null);
        });
    }, 400);
    return () => window.clearTimeout(t);
  }, [
    whatsappOn,
    key,
    typePreset,
    body,
    whatsappBody,
    whatsappCategory,
    whatsappApprovalName,
    whatsappVarMappings,
    whatsappContentType,
  ]);

  const buildVarMappingsFromBody = () => {
    const vars = extractNamedVars(whatsappBody);
    setWhatsappVarMappings(
      vars.map((v, i) => ({
        ordinal: i + 1,
        var: v,
        sample: `Sample ${v.replace(/_/g, " ")}`,
      })),
    );
  };

  const toggleWaterfallChannel = (ch: string) => {
    setChannelWaterfall((prev) => {
      if (prev.includes(ch)) {
        const next = prev.filter((c) => c !== ch);
        return next.length > 0 ? next : prev;
      }
      return [...prev, ch];
    });
  };

  const pushToTwilio = async () => {
    if (!initial.id) return;
    setWhatsappPushBusy(true);
    try {
      const res = await adminApi.postJson<{ data?: { content_sid?: string; status?: string } }>(
        `/api/admin/notification-templates/${initial.id}/whatsapp/push`,
        { submit: true },
      );
      const sid = res.data?.content_sid;
      const st = res.data?.status;
      if (sid) setWhatsappContentSid(sid);
      if (st) setWhatsappStatus(st);
    } finally {
      setWhatsappPushBusy(false);
    }
  };

  const syncTwilioStatus = async () => {
    if (!initial.id) return;
    setWhatsappPushBusy(true);
    try {
      const res = await adminApi.getJson<{ data?: { status?: string } }>(
        `/api/admin/notification-templates/${initial.id}/whatsapp/push`,
      );
      if (res.data?.status) setWhatsappStatus(res.data.status);
    } finally {
      setWhatsappPushBusy(false);
    }
  };

  const deleteRemoteTwilio = async () => {
    if (!initial.id) return;
    if (!window.confirm("Delete the remote Twilio Content template? You can push a new version after saving.")) {
      return;
    }
    setWhatsappPushBusy(true);
    try {
      await adminApi.deleteJson(`/api/admin/notification-templates/${initial.id}/whatsapp/push`);
      setWhatsappContentSid("");
      setWhatsappStatus("unknown");
    } finally {
      setWhatsappPushBusy(false);
    }
  };

  return (
    <div className="space-y-5 text-sm">
      <div>
        <label className="block text-xs font-medium text-gray-700">Template key *</label>
        <input
          className="mt-1.5 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm touch-manipulation"
          value={key}
          onChange={(e) => setKey(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
          placeholder="e.g. booking_confirmed"
          disabled={mode === "edit"}
          readOnly={mode === "edit"}
        />
        <p className="mt-1 text-xs text-gray-500">
          {mode === "edit" ? "Key cannot be changed after creation." : "Lowercase, underscores. Must be unique."}
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700">Notification type (preset)</label>
        <select
          className="mt-1.5 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 touch-manipulation"
          value={NOTIFICATION_TYPE_PRESETS.some((p) => p.value === typePreset) ? typePreset : ""}
          onChange={(e) => applyPreset(e.target.value)}
        >
          <option value="">— Custom / other —</option>
          {NOTIFICATION_TYPE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">Choosing a preset fills the key on new templates. You can still edit the key.</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700">Push title *</label>
        <input
          className="mt-1.5 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 touch-manipulation"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder='e.g. Appointment reminder: {{service_name}}'
        />
        <p className="mt-1 text-xs text-gray-500">Use {"{{variable_name}}"} for dynamic content.</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700">Push / in-app body *</label>
        <textarea
          rows={4}
          className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm touch-manipulation"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Your appointment for {{service_name}} is on {{date}}."
        />
      </div>

      <div>
        <p className="text-xs font-medium text-gray-700">Channels *</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CHANNEL_KEYS.map((channel) => (
            <button
              key={channel}
              type="button"
              onClick={() => toggleChannel(channel)}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition-colors touch-manipulation",
                channels.includes(channel)
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
              )}
            >
              {channel === "email" && <Mail className="h-3.5 w-3.5 shrink-0" />}
              {channel === "sms" && <MessageSquare className="h-3.5 w-3.5 shrink-0" />}
              {channel === "push" && <Smartphone className="h-3.5 w-3.5 shrink-0" />}
              {channel === "in_app" && <Bell className="h-3.5 w-3.5 shrink-0" />}
              {channel === "whatsapp" && <MessageSquare className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
              <span className="capitalize">{channel.replace("_", " ")}</span>
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-500">In-app uses the same push pipeline as the legacy admin.</p>
      </div>

      {emailOn && (
        <div className="space-y-3 border-t border-gray-200 pt-4">
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
            <Mail className="h-4 w-4" /> Email
          </h4>
          <div>
            <label className="text-xs font-medium text-gray-700">Email subject</label>
            <input
              className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="Subject line (supports {{vars}})"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700">Email body (HTML)</label>
            <textarea
              rows={5}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              placeholder="<p>Dear {{customer_name}}, …</p>"
            />
          </div>
        </div>
      )}

      {smsOn && (
        <div className="space-y-3 border-t border-gray-200 pt-4">
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
            <MessageSquare className="h-4 w-4" /> SMS
          </h4>
          <textarea
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={smsBody}
            onChange={(e) => setSmsBody(e.target.value)}
            placeholder="Short SMS; ~160 chars for one segment."
          />
        </div>
      )}

      {whatsappOn && (
        <div className="space-y-3 border-t border-gray-200 pt-4">
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
            <MessageSquare className="h-4 w-4" /> WhatsApp (Twilio Content)
          </h4>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize">
              {whatsappStatus.replace("_", " ")}
            </span>
          </div>
          {initial.whatsapp_content_error && (
            <p className="text-xs text-red-600">{initial.whatsapp_content_error}</p>
          )}
          {readinessScore != null && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs">
              <p className="font-medium text-gray-800">
                Approval readiness: {readinessScore}/100
                {readinessFatal.length > 0 && (
                  <span className="ml-2 text-red-600">({readinessFatal.length} blocking)</span>
                )}
              </p>
              {readinessFatal.map((f) => (
                <p key={f} className="mt-1 text-red-600">
                  • {f}
                </p>
              ))}
              {readinessWarnings.map((w) => (
                <p key={w} className="mt-1 text-amber-700">
                  • {w}
                </p>
              ))}
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-700">Category</label>
            <select
              className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={whatsappCategory}
              onChange={(e) => setWhatsappCategory(e.target.value)}
            >
              <option value="utility">Utility (transactional)</option>
              <option value="authentication">Authentication</option>
              <option value="marketing">Marketing</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700">Twilio approval name</label>
            <input
              className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
              value={whatsappApprovalName}
              onChange={(e) => setWhatsappApprovalName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
              placeholder="booking_confirmed_utility"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700">WhatsApp body</label>
            <textarea
              rows={3}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={whatsappBody}
              onChange={(e) => setWhatsappBody(e.target.value)}
              placeholder="Hi {{customer_name}}, your appointment is confirmed for {{booking_date}}."
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700">Content type</label>
            <select
              className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={whatsappContentType}
              onChange={(e) => setWhatsappContentType(e.target.value)}
            >
              <option value="twilio/text">Text</option>
              <option value="twilio/media">Media (image/video header)</option>
            </select>
          </div>
          {whatsappContentType === "twilio/media" && (
            <div>
              <label className="text-xs font-medium text-gray-700">Media URL</label>
              <input
                className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
                value={whatsappMediaUrl}
                onChange={(e) => setWhatsappMediaUrl(e.target.value)}
                placeholder="https://cdn.example.com/header.jpg"
              />
            </div>
          )}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-medium text-gray-700">Variable mapping (ordinal → named var)</label>
              <button
                type="button"
                className="text-xs font-medium text-emerald-700 underline"
                onClick={buildVarMappingsFromBody}
              >
                Auto-map from body
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Twilio Content uses {"{{1}}"}, {"{{2}}"} ordinals. Map each to your template variable for sends.
            </p>
            <div className="mt-2 space-y-2">
              {whatsappVarMappings.map((row, idx) => (
                <div key={`${row.ordinal}-${idx}`} className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    className="w-16 rounded border border-gray-300 px-2 py-1 text-xs"
                    value={row.ordinal}
                    onChange={(e) => {
                      const ordinal = Number(e.target.value) || 1;
                      setWhatsappVarMappings((prev) =>
                        prev.map((m, i) => (i === idx ? { ...m, ordinal } : m)),
                      );
                    }}
                  />
                  <input
                    className="min-w-[120px] flex-1 rounded border border-gray-300 px-2 py-1 font-mono text-xs"
                    value={row.var}
                    onChange={(e) => {
                      const v = e.target.value;
                      setWhatsappVarMappings((prev) =>
                        prev.map((m, i) => (i === idx ? { ...m, var: v } : m)),
                      );
                    }}
                    placeholder="customer_name"
                  />
                  <input
                    className="min-w-[120px] flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
                    value={row.sample ?? ""}
                    onChange={(e) => {
                      const sample = e.target.value;
                      setWhatsappVarMappings((prev) =>
                        prev.map((m, i) => (i === idx ? { ...m, sample } : m)),
                      );
                    }}
                    placeholder="Sample value"
                  />
                  <button
                    type="button"
                    className="text-xs text-red-600"
                    onClick={() => setWhatsappVarMappings((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-xs font-medium text-gray-700 underline"
                onClick={() =>
                  setWhatsappVarMappings((prev) => [
                    ...prev,
                    { ordinal: prev.length + 1, var: "", sample: "" },
                  ])
                }
              >
                Add mapping
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700">Content SID (manual override)</label>
            <input
              className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
              value={whatsappContentSid}
              onChange={(e) => setWhatsappContentSid(e.target.value)}
              placeholder="HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            />
            <p className="mt-1 text-xs text-gray-500">
              Usually set by Push to Twilio. Override only if linking an existing approved template.
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700">Failure waterfall</label>
            <p className="mt-1 text-xs text-gray-500">
              If WhatsApp delivery fails (template/session errors), try these channels in order via status callback.
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              {WATERFALL_CHANNELS.map((ch) => (
                <label key={ch} className="flex items-center gap-2 text-xs capitalize">
                  <input
                    type="checkbox"
                    checked={channelWaterfall.includes(ch)}
                    onChange={() => toggleWaterfallChannel(ch)}
                    className="h-4 w-4 accent-gray-900"
                  />
                  {ch}
                </label>
              ))}
            </div>
          </div>
          {initial.whatsapp_content_hash && (
            <p className="text-xs text-amber-700">
              Save changes and push again if body, variables, or content type changed (local drift from Twilio).
            </p>
          )}
          {mode === "edit" && initial.id && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={whatsappPushBusy || readinessFatal.length > 0}
                onClick={() => void pushToTwilio()}
                className={adminToolbarButtonClass(whatsappPushBusy)}
              >
                {whatsappPushBusy ? "Working…" : "Push to Twilio & submit"}
              </button>
              <button
                type="button"
                disabled={whatsappPushBusy || !whatsappContentSid}
                onClick={() => void syncTwilioStatus()}
                className={adminToolbarButtonClass(whatsappPushBusy)}
              >
                Re-sync status
              </button>
              <button
                type="button"
                disabled={whatsappPushBusy || !whatsappContentSid}
                onClick={() => void deleteRemoteTwilio()}
                className={adminToolbarButtonClass(whatsappPushBusy)}
              >
                Delete remote Content
              </button>
            </div>
          )}
        </div>
      )}

      <div className="space-y-3 border-t border-gray-200 pt-4">
        <div>
          <label className="text-xs font-medium text-gray-700">Deep link URL</label>
          <input
            className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="/account-settings/bookings/{{booking_id}}"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700">Internal description</label>
          <input
            className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="When this fires and who receives it"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700">Variables (comma-separated)</label>
          <input
            className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
            value={variablesStr}
            onChange={(e) => setVariablesStr(e.target.value)}
            placeholder="customer_name, booking_id, service_name"
          />
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-gray-900"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span>
          <span className="font-medium text-gray-900">Enabled</span>
          <span className="mt-0.5 block text-xs text-gray-500">When off, this template is not used for sends.</span>
        </span>
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
        <button type="button" className={adminToolbarButtonClass(false)} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          disabled={isSaving || !key.trim() || !title.trim()}
          onClick={handleSubmit}
          className="min-h-11 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {isSaving ? "Saving…" : mode === "edit" ? "Save changes" : "Create template"}
        </button>
      </div>
    </div>
  );
}

export function NotificationTemplatesListPage() {
  useAdminDocumentTitle("Notification Templates");
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const [sp, setSp] = useSearchParams();
  const channel = sp.get("channel") || "";
  const enabledFilter = sp.get("enabled") || "";
  const tab = sp.get("tab") === "logs" ? "logs" : "templates";
  const qc = useQueryClient();

  const setTab = useCallback(
    (value: "templates" | "logs") => {
      setSp(
        (prev) => {
          const n = new URLSearchParams(prev);
          if (value === "templates") n.delete("tab");
          else n.set("tab", value);
          return n;
        },
        { replace: true },
      );
    },
    [setSp],
  );

  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editRow, setEditRow] = useState<Template | null>(null);
  const [mutError, setMutError] = useState<string | null>(null);

  const setFilter = useCallback(
    (key: "channel" | "enabled", value: string) => {
      setSp(
        (prev) => {
          const n = new URLSearchParams(prev);
          if (!value) n.delete(key);
          else n.set(key, value);
          return n;
        },
        { replace: true },
      );
    },
    [setSp],
  );

  const hasFilters = Boolean(channel) || enabledFilter === "true" || enabledFilter === "false";

  const qk = useMemo(() => adminQueryKeys.notificationTemplates(`c=${channel}|e=${enabledFilter}`), [channel, enabledFilter]);

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = new URLSearchParams();
      if (channel) p.set("channel", channel);
      if (enabledFilter === "true" || enabledFilter === "false") p.set("enabled", enabledFilter);
      const qs = p.toString();
      return adminApi.getJson<Payload>(`/api/admin/notification-templates${qs ? `?${qs}` : ""}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: [...adminQueryKeys.root, "notification-templates"] });

  const createMut = useMutation({
    mutationFn: (d: Record<string, unknown>) => adminApi.postJson("/api/admin/notification-templates", d),
    onSuccess: () => {
      invalidate();
      setModal(null);
      setMutError(null);
    },
    onError: (e: Error) => setMutError(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      adminApi.patchJson(`/api/admin/notification-templates/${id}`, body),
    onSuccess: () => {
      invalidate();
      setModal(null);
      setEditRow(null);
      setMutError(null);
    },
    onError: (e: Error) => setMutError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/notification-templates/${id}`),
    onSuccess: () => {
      invalidate();
      setMutError(null);
    },
    onError: (e: Error) => setMutError(e.message),
  });

  const rows = q.data?.templates ?? [];

  const filteredRows = useMemo(() => {
    const qv = search.trim().toLowerCase();
    if (!qv) return rows;
    return rows.filter((r) => {
      const hay = [
        r.key,
        r.name,
        r.type,
        r.title,
        r.title_template,
        r.description,
        Array.isArray(r.channels) ? r.channels.join(" ") : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(qv);
    });
  }, [rows, search]);

  if (denied) return denied;

  const headerEl = (
    <AdminPageHeader
      title="Notification templates"
      description={
        <span className="max-w-3xl text-sm font-normal leading-relaxed text-gray-600">
          Single place for push, email, and SMS copy. Keys are stable identifiers; use{" "}
          <code className="rounded bg-gray-100 px-1">{"{{variable}}"}</code> in titles and bodies. Matches the legacy Next.js admin
          workflow.
        </span>
      }
    />
  );

  const tabBarEl = (
    <div className="flex gap-1 border-b border-gray-200">
      {([
        { id: "templates", label: "Templates" },
        { id: "logs", label: "Delivery logs" },
      ] as const).map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTab(t.id)}
          className={cn(
            "-mb-px min-h-11 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
            tab === t.id
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-800",
          )}
          aria-selected={tab === t.id}
          role="tab"
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  if (tab === "logs") {
    return (
      <div className="space-y-6">
        {headerEl}
        {tabBarEl}
        <NotificationDeliveryLogsTab enabled={allowed && tab === "logs"} />
      </div>
    );
  }

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        {headerEl}
        {tabBarEl}
        <AdminPanel>
          <AdminPageSkeleton rows={5} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return (
      <div className="space-y-6">
        {headerEl}
        {tabBarEl}
        <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {headerEl}
      {tabBarEl}

      <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
        <strong>Note:</strong> Email and SMS are edited per template here (<code className="rounded bg-amber-100/80 px-1">email_subject</code>,{" "}
        <code className="rounded bg-amber-100/80 px-1">email_body</code>, <code className="rounded bg-amber-100/80 px-1">sms_body</code>).
        Enable the channel below to reveal those fields.
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50/90 px-4 py-3 text-sm text-blue-950">
        <strong>Which app (customer vs provider)?</strong> Rows in this list are <em>shared</em> message definitions (same keys for everyone). At send time,
        the platform picks the right channel; for <strong>push</strong>, devices use the OneSignal app that matches their build (customer Expo app vs provider Expo app).
        Configure both OneSignal App IDs and REST keys under{" "}
        <Link to={adminSpaTo("/admin/notifications")} className="font-medium text-blue-900 underline">
          Notifications
        </Link>
        {" "}so broadcasts and automated sends work.
      </div>

      <AdminPanel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search key, title, description, channels…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-3 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={channel}
              onChange={(e) => setFilter("channel", e.target.value)}
              className="min-h-11 rounded-xl border border-gray-300 px-3 py-2 text-sm"
              aria-label="Channel"
            >
              <option value="">All channels</option>
              <option value="push">Push</option>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="in_app">In-app</option>
            </select>
            <select
              value={enabledFilter === "true" || enabledFilter === "false" ? enabledFilter : ""}
              onChange={(e) => setFilter("enabled", e.target.value)}
              className="min-h-11 rounded-xl border border-gray-300 px-3 py-2 text-sm"
              aria-label="Enabled"
            >
              <option value="">All</option>
              <option value="true">Enabled only</option>
              <option value="false">Disabled only</option>
            </select>
            {hasFilters ? (
              <button
                type="button"
                className="min-h-11 rounded-xl border border-gray-300 px-3 text-sm"
                onClick={() => {
                  setSp(
                    (prev) => {
                      const n = new URLSearchParams(prev);
                      n.delete("channel");
                      n.delete("enabled");
                      return n;
                    },
                    { replace: true },
                  );
                }}
              >
                Clear filters
              </button>
            ) : null}
            <button
              type="button"
              className={adminToolbarButtonClass(q.isFetching)}
              disabled={q.isFetching}
              onClick={() => void q.refetch()}
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => {
                setEditRow(null);
                setMutError(null);
                setModal("create");
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
            >
              <Plus className="h-4 w-4" />
              Create template
            </button>
          </div>
        </div>
      </AdminPanel>

      {mutError && !modal ? <p className="text-sm text-red-600">{mutError}</p> : null}

      {filteredRows.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? "No templates" : "No matches"}
          description={rows.length === 0 ? "Create a template to get started." : "Try a different search or filters."}
        />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Key</AdminTh>
              <AdminTh>Title</AdminTh>
              <AdminTh>Channels</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh className="text-right">Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {filteredRows.map((r) => (
              <tr key={r.id}>
                <AdminTd className="font-mono text-xs text-gray-900">{r.key ?? r.name ?? "—"}</AdminTd>
                <AdminTd className="max-w-xs">
                  <span className="line-clamp-2 text-sm text-gray-800">{r.title ?? r.title_template ?? "—"}</span>
                </AdminTd>
                <AdminTd>
                  <div className="flex flex-wrap gap-1">
                    {(r.channels ?? []).map((ch) => (
                      <span
                        key={ch}
                        className="inline-flex rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-gray-700"
                      >
                        {ch}
                      </span>
                    ))}
                  </div>
                </AdminTd>
                <AdminTd>
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                      r.enabled !== false ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600",
                    )}
                  >
                    {r.enabled !== false ? "Enabled" : "Disabled"}
                  </span>
                </AdminTd>
                <AdminTd className="text-right">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                      aria-label="Edit"
                      onClick={() => {
                        setEditRow(r);
                        setMutError(null);
                        setModal("edit");
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-red-100 text-red-600 hover:bg-red-50 disabled:opacity-50"
                      aria-label="Delete"
                      disabled={deleteMut.isPending}
                      onClick={() => {
                        if (confirm(`Delete template "${r.key ?? r.name}"?`)) deleteMut.mutate(r.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}

      <AdminModal
        open={modal !== null}
        onClose={() => {
          setModal(null);
          setEditRow(null);
          setMutError(null);
        }}
        title={modal === "edit" ? "Edit notification template" : "Create notification template"}
        description="Push title/body are required; enable email or SMS to edit those channels."
        size="xl"
        footer={null}
      >
        {modal === "create" ? (
          <TemplateEditor
            key="template-create"
            mode="create"
            initial={EMPTY_TEMPLATE_INITIAL}
            isSaving={createMut.isPending}
            error={mutError}
            onCancel={() => {
              setModal(null);
              setMutError(null);
            }}
            onSave={(payload) => createMut.mutate(payload)}
          />
        ) : modal === "edit" && editRow ? (
          <TemplateEditor
            key={editRow.id}
            mode="edit"
            initial={editRow}
            isSaving={updateMut.isPending}
            error={mutError}
            onCancel={() => {
              setModal(null);
              setEditRow(null);
              setMutError(null);
            }}
            onSave={(payload) => {
              const { key: _k, ...rest } = payload;
              updateMut.mutate({ id: editRow.id, body: rest });
            }}
          />
        ) : null}
      </AdminModal>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600">
        <strong>API</strong>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            <code className="rounded bg-gray-100 px-1">POST</code> / <code className="rounded bg-gray-100 px-1">PATCH</code>{" "}
            <code className="rounded bg-gray-100 px-1">/api/admin/notification-templates</code>
          </li>
          <li>
            The in-app toggle is saved as <code className="rounded bg-gray-100 px-1">push</code> in <code className="rounded bg-gray-100 px-1">channels</code> (same as the legacy Next admin).
          </li>
        </ul>
      </div>
    </div>
  );
}
