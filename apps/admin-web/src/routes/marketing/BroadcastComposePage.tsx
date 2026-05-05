import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { adminToolbarButtonClass, adminTabButtonClass } from "@/lib/adminUi";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { cn } from "@/lib/cn";

type Channel = "push" | "sms" | "email";
type RecipientType = "all_users" | "all_providers" | "custom";
type AnnouncementType = "general" | "promotion" | "event" | "news";
type MediaType = "" | "image" | "video";

type NotificationConfig = {
  onesignal_apps?: {
    customer?: { app_id?: string | null; rest_api_key_configured?: boolean };
    provider?: { app_id?: string | null; rest_api_key_configured?: boolean };
  };
  diagnostics?: {
    onesignal_configured?: boolean;
    onesignal_missing?: string[];
  };
};

type BroadcastDetailEnvelope = {
  data: {
    broadcast: Record<string, unknown>;
  };
};

function parseUserIds(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function localToIso(local: string): string | undefined {
  if (!local.trim()) return undefined;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

const ANNOUNCEMENT_TYPES: { value: AnnouncementType; label: string; color: string }[] = [
  { value: "general", label: "General", color: "bg-gray-100 text-gray-700" },
  { value: "promotion", label: "Promotion", color: "bg-amber-100 text-amber-700" },
  { value: "event", label: "Event", color: "bg-indigo-100 text-indigo-700" },
  { value: "news", label: "News", color: "bg-blue-100 text-blue-700" },
];

const PUSH_TITLE_MAX = 65;
const PUSH_MSG_MAX = 240;
const SMS_MSG_MAX = 160;

export function BroadcastComposePage() {
  useAdminDocumentTitle("Compose Broadcast");
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const [sp] = useSearchParams();
  const fromId = sp.get("from")?.trim() ?? "";

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [channel, setChannel] = useState<Channel>("push");
  const [recipientType, setRecipientType] = useState<RecipientType>("all_users");
  const [customIds, setCustomIds] = useState("");

  // Core content
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("");

  // Push rich fields
  const [announcementType, setAnnouncementType] = useState<AnnouncementType>("general");
  const [mediaUrl, setMediaUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState(""); // datetime-local
  const [showCta, setShowCta] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Advanced / existing
  const [internalName, setInternalName] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [imageUrl, setImageUrl] = useState(""); // OS banner image (separate from media cover)
  const [sendAfterLocal, setSendAfterLocal] = useState("");
  const [priority, setPriority] = useState<"" | "5" | "10">("");
  const [iosInterruption, setIosInterruption] = useState<"" | "passive" | "active" | "time_sensitive" | "critical">("");
  const [additionalDataJson, setAdditionalDataJson] = useState("{\n}");

  const [status, setStatus] = useState<string | null>(null);

  // Load from ?from= broadcast id
  const fromQ = useQuery({
    queryKey: adminQueryKeys.broadcastDetail(fromId),
    queryFn: () =>
      adminApi.getRawJson<BroadcastDetailEnvelope>(`/api/admin/broadcast/${encodeURIComponent(fromId)}`, {
        timeoutMs: 30_000,
      }),
    enabled: allowed && !!fromId,
  });

  useEffect(() => {
    if (!fromQ.data) return;
    const b = (fromQ.data.data?.broadcast ?? {}) as Record<string, unknown>;
    const meta = (b.metadata && typeof b.metadata === "object" ? b.metadata : {}) as Record<string, unknown>;
    const ch = String(b.channel ?? "push") as Channel;
    setChannel(ch);
    setRecipientType(String(b.recipient_type ?? "all_users") as RecipientType);
    if (ch === "push") {
      setTitle(String(b.subject ?? ""));
      setMessage(String(b.message ?? ""));
      setAnnouncementType((String(meta.announcement_type ?? "general")) as AnnouncementType);
      const mu = String(meta.media_url ?? "");
      const mt = String(meta.media_type ?? "");
      if (mt === "video") {
        setVideoUrl(mu);
        setMediaUrl("");
      } else {
        setMediaUrl(mu);
        setVideoUrl("");
      }
      if (meta.cta_label || meta.cta_url) {
        setCtaLabel(String(meta.cta_label ?? ""));
        setCtaUrl(String(meta.cta_url ?? ""));
        setShowCta(true);
      }
      setExpiresAt(String(meta.expires_at ?? "").slice(0, 16));
      setUrl(String(meta.deep_link ?? ""));
    } else if (ch === "email") {
      setSubject(String(b.subject ?? ""));
      setMessage(String(b.message ?? ""));
    } else {
      setMessage(String(b.message ?? ""));
    }
    setStep(2);
  }, [fromQ.data]);

  const configQ = useQuery({
    queryKey: adminQueryKeys.notificationsConfig(),
    queryFn: () => adminApi.getJson<NotificationConfig>("/api/admin/notifications/config", { timeoutMs: 30_000 }),
    enabled: allowed && channel === "push",
  });

  const audiencePreviewQ = useQuery({
    queryKey: adminQueryKeys.broadcastHistory(`preview:${recipientType}`),
    queryFn: () =>
      adminApi.getJson<{ count?: number; mode?: string }>(
        `/api/admin/broadcast/audience-preview?segment=${recipientType === "all_providers" ? "providers" : "customers"}`,
        { timeoutMs: 25_000 },
      ),
    enabled: allowed && (recipientType === "all_users" || recipientType === "all_providers"),
  });

  const activeOneSignalConfig =
    recipientType === "all_providers"
      ? configQ.data?.onesignal_apps?.provider
      : recipientType === "all_users"
        ? configQ.data?.onesignal_apps?.customer
        : null;

  const m = useMutation({
    mutationFn: async () => {
      const user_ids = recipientType === "custom" ? parseUserIds(customIds) : undefined;
      if (recipientType === "custom" && (!user_ids || user_ids.length === 0))
        throw new Error("Add at least one user ID for a custom audience.");
      if (!message.trim()) throw new Error("Message / body is required.");

      if (channel === "push") {
        if (!title.trim()) throw new Error("Push notifications require a title.");
        let additional_data: Record<string, unknown> | undefined;
        try {
          const parsed = JSON.parse(additionalDataJson || "{}") as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            additional_data = parsed as Record<string, unknown>;
          } else throw new Error("Additional data must be a JSON object.");
        } catch (e) {
          throw new Error(e instanceof Error ? e.message : "Invalid additional data JSON");
        }

        const computedMediaUrl = videoUrl.trim() || mediaUrl.trim();
        const computedMediaType: "image" | "video" | undefined = videoUrl.trim()
          ? "video"
          : mediaUrl.trim()
            ? "image"
            : undefined;

        return adminApi.postJson<{
          message?: string;
          recipients?: number;
          notification_id?: string;
          delivery?: string;
          onesignal_recipients?: number | null;
          onesignal_errors?: unknown[] | null;
        }>("/api/admin/broadcast/push", {
          title: title.trim(),
          message: message.trim(),
          recipient_type: recipientType,
          user_ids,
          url: url.trim() || undefined,
          name: internalName.trim() || undefined,
          subtitle: subtitle.trim() || undefined,
          image: imageUrl.trim() || undefined,
          send_after: localToIso(sendAfterLocal),
          priority: priority === "5" || priority === "10" ? parseInt(priority, 10) : undefined,
          ios_interruption_level: iosInterruption || undefined,
          additional_data: Object.keys(additional_data).length > 0 ? additional_data : undefined,
          // Rich announcement fields
          announcement_type: announcementType,
          media_url: computedMediaUrl || undefined,
          media_type: computedMediaType,
          cta_label: ctaLabel.trim() || undefined,
          cta_url: ctaUrl.trim() || undefined,
          expires_at: localToIso(expiresAt),
        });
      }
      if (channel === "sms") {
        return adminApi.postJson<{
          message?: string;
          recipients?: number;
          intended?: number;
          failures?: number;
          first_failure?: { error?: string } | null;
        }>("/api/admin/broadcast/sms", {
          message: message.trim(),
          recipient_type: recipientType,
          user_ids,
          app_type: recipientType === "custom" ? "customer" : undefined,
          url: url.trim() || undefined,
        });
      }
      if (!subject.trim()) throw new Error("Email broadcasts require a subject line.");
      return adminApi.postJson<{
        message?: string;
        recipients?: number;
        intended?: number;
        failures?: number;
        first_failure?: { error?: string } | null;
      }>("/api/admin/broadcast/email", {
        subject: subject.trim(),
        message: message.trim(),
        recipient_type: recipientType,
        user_ids,
        app_type: recipientType === "custom" ? "customer" : undefined,
        url: url.trim() || undefined,
      });
    },
    onSuccess: (res) => {
      const r = res as {
        recipients?: number;
        intended?: number;
        failures?: number;
        message?: string;
        notification_id?: string;
        delivery?: string;
        first_failure?: { error?: string } | null;
        onesignal_recipients?: number | null;
        onesignal_errors?: unknown[] | null;
      };
      if (channel === "push") {
        const parts: string[] = [];
        if (typeof r.message === "string" && r.message.trim()) {
          parts.push(r.message.trim());
        } else if (typeof r.recipients === "number") {
          parts.push(
            r.delivery === "scheduled"
              ? `Scheduled in OneSignal for ${r.recipients} user account(s).`
              : `Submitted to OneSignal for ${r.recipients} user account(s).`,
          );
        } else {
          parts.push("Broadcast request completed.");
        }
        if (typeof r.onesignal_recipients === "number") {
          parts.push(`OneSignal reach: ${r.onesignal_recipients} device(s).`);
          if (r.onesignal_recipients === 0) {
            parts.push("Reach is zero — most likely no targeted user has logged into the right OneSignal app yet.");
          }
        }
        if (Array.isArray(r.onesignal_errors) && r.onesignal_errors.length > 0) {
          parts.push(`OneSignal warnings: ${JSON.stringify(r.onesignal_errors).slice(0, 200)}`);
        }
        if (r.notification_id) parts.push(`OneSignal message id: ${r.notification_id}`);
        setStatus(parts.join(" "));
        setStep(1);
        return;
      }
      if (typeof r.message === "string" && r.message.trim()) {
        setStatus(r.first_failure?.error ? `${r.message.trim()} First failure: ${r.first_failure.error}` : r.message.trim());
        return;
      }
      if (typeof r.recipients === "number") {
        setStatus(`Sent ${r.recipients} of ${r.intended ?? r.recipients} ${channel}.`);
        return;
      }
      setStatus("Sent.");
    },
    onError: (e: Error) => setStatus(e.message),
  });

  if (denied) return denied;

  /* ------------------------------------------------------------------ */
  /* Step nav helpers                                                     */
  /* ------------------------------------------------------------------ */
  function validateStep1(): string | null {
    if (recipientType === "custom" && parseUserIds(customIds).length === 0)
      return "Add at least one user ID for a custom audience.";
    return null;
  }
  function validateStep2(): string | null {
    if (channel === "push" && !title.trim()) return "Push notifications require a title.";
    if (!message.trim()) return "Message / body is required.";
    return null;
  }
  function goToStep2(): void {
    const err = validateStep1();
    if (err) { setStatus(err); return; }
    setStatus(null);
    setStep(2);
  }
  function goToStep3(): void {
    const err = validateStep2();
    if (err) { setStatus(err); return; }
    setStatus(null);
    setStep(3);
  }

  const audienceLabel =
    recipientType === "all_users"
      ? "All customers"
      : recipientType === "all_providers"
        ? "All providers"
        : `${parseUserIds(customIds).length} custom ID(s)`;

  /* ------------------------------------------------------------------ */
  /* Render                                                               */
  /* ------------------------------------------------------------------ */
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Compose broadcast"
        description="Send push, SMS, or email via the admin broadcast APIs. Delivery is logged to broadcast history."
      />
      <p className="text-sm text-gray-600">
        <Link to={adminSpaTo("/admin/broadcast/history")} className="font-medium text-primary underline">
          View delivery history →
        </Link>
      </p>

      {fromId && fromQ.isLoading ? (
        <AdminPanel>
          <p className="text-sm text-gray-600">Loading broadcast for duplication…</p>
        </AdminPanel>
      ) : null}
      {fromQ.isError ? (
        <AdminPanel>
          <p className="text-sm text-red-600">Could not load source broadcast: {(fromQ.error as Error).message}</p>
        </AdminPanel>
      ) : null}

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {(["1. Audience", "2. Content", "3. Preview & send"] as const).map((label, i) => (
          <span
            key={label}
            className={cn(
              "rounded-full px-3 py-1 font-semibold",
              step === i + 1 ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500",
            )}
          >
            {label}
          </span>
        ))}
      </div>

      <AdminPanel>
        {/* ── STEP 1: Audience ─────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Channel</label>
              <div className="flex gap-2 flex-wrap">
                {(["push", "sms", "email"] as Channel[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={adminTabButtonClass(channel === c)}
                    onClick={() => setChannel(c)}
                  >
                    {c === "push" ? "📣 Push" : c === "sms" ? "💬 SMS" : "✉️ Email"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Audience segment</label>
              <div className="flex gap-2 flex-wrap">
                {(["all_users", "all_providers", "custom"] as RecipientType[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={adminTabButtonClass(recipientType === r)}
                    onClick={() => setRecipientType(r)}
                  >
                    {r === "all_users" ? "All customers" : r === "all_providers" ? "All providers" : "Custom IDs"}
                  </button>
                ))}
              </div>
            </div>

            {(recipientType === "all_users" || recipientType === "all_providers") && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                <span className="font-medium">Audience preview: </span>
                {audiencePreviewQ.isLoading
                  ? "Counting…"
                  : audiencePreviewQ.isError
                    ? "Could not load."
                    : typeof audiencePreviewQ.data?.count === "number"
                      ? `${audiencePreviewQ.data.count} user account(s)${audiencePreviewQ.data.mode ? ` (${audiencePreviewQ.data.mode})` : ""}. ${
                          channel === "email"
                            ? "Final reach depends on email on file."
                            : channel === "sms"
                              ? "Final reach depends on phone on file."
                              : ""
                        }`
                      : "—"}
              </div>
            )}

            {channel === "push" && (
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-950">
                <div className="font-medium">OneSignal config check</div>
                {recipientType === "custom" ? (
                  <p className="mt-1 text-xs">Custom audiences may span both apps — ensure both OneSignal App IDs and REST keys are configured.</p>
                ) : configQ.isLoading ? (
                  <p className="mt-1 text-xs">Checking OneSignal credentials…</p>
                ) : activeOneSignalConfig ? (
                  <p className="mt-1 text-xs">
                    {recipientType === "all_providers" ? "Provider" : "Customer"} App ID{" "}
                    {activeOneSignalConfig.app_id ? "✓ set" : "✗ missing"}; REST API key{" "}
                    {activeOneSignalConfig.rest_api_key_configured ? "✓ set" : "✗ missing"}.
                  </p>
                ) : (
                  <p className="mt-1 text-xs">Config unavailable here — the broadcast API validates before sending.</p>
                )}
                {configQ.data?.diagnostics?.onesignal_missing?.length ? (
                  <p className="mt-1 text-xs text-blue-900">
                    Missing: {configQ.data.diagnostics.onesignal_missing.join(", ")}
                  </p>
                ) : null}
              </div>
            )}

            {recipientType === "custom" && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">User IDs (comma or whitespace separated)</label>
                <textarea
                  className="w-full min-h-[88px] rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm"
                  value={customIds}
                  onChange={(e) => setCustomIds(e.target.value)}
                  placeholder="uuid-one, uuid-two"
                />
              </div>
            )}

            {status ? <p className="text-sm text-red-600">{status}</p> : null}

            <div className="flex justify-end">
              <button type="button" className={adminToolbarButtonClass(false)} onClick={goToStep2}>
                Next: content →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Content ──────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5">
            {channel === "push" && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Title * <span className="text-gray-400">({title.length}/{PUSH_TITLE_MAX})</span>
                </label>
                <input
                  className="w-full max-w-lg rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={title}
                  maxLength={PUSH_TITLE_MAX}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Push notification title…"
                />
              </div>
            )}

            {channel === "email" && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Subject *</label>
                <input
                  className="w-full max-w-lg rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject…"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {channel === "push" ? "Message *" : "Body / message *"}{" "}
                <span className="text-gray-400">
                  ({message.length}/{channel === "sms" ? SMS_MSG_MAX : PUSH_MSG_MAX})
                </span>
              </label>
              <textarea
                className="w-full min-h-[120px] rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={message}
                maxLength={channel === "sms" ? SMS_MSG_MAX : PUSH_MSG_MAX}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your announcement…"
              />
            </div>

            {channel === "push" && (
              <>
                {/* Announcement type */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Announcement type</label>
                  <div className="flex flex-wrap gap-2">
                    {ANNOUNCEMENT_TYPES.map((at) => (
                      <button
                        key={at.value}
                        type="button"
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-semibold border transition",
                          announcementType === at.value
                            ? `${at.color} border-current ring-2 ring-current ring-offset-1`
                            : "bg-gray-100 text-gray-600 border-transparent hover:bg-gray-200",
                        )}
                        onClick={() => setAnnouncementType(at.value)}
                      >
                        {at.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cover image */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Cover image URL (push banner + in-app card)
                  </label>
                  <input
                    className="w-full max-w-lg rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    placeholder="https://…"
                    type="url"
                  />
                  {mediaUrl.trim() && (
                    <img
                      src={mediaUrl.trim()}
                      alt="Preview"
                      className="mt-2 h-24 w-auto max-w-xs rounded-md border border-gray-200 object-cover"
                      onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                    />
                  )}
                </div>

                {/* Video URL */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Video URL (MP4 — in-app only, not on push banner)
                  </label>
                  <input
                    className="w-full max-w-lg rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://…"
                    type="url"
                  />
                </div>

                {/* CTA button */}
                {!showCta ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-indigo-700 hover:underline"
                    onClick={() => setShowCta(true)}
                  >
                    ＋ Add call-to-action button
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-medium text-gray-600">Call-to-action button</label>
                      <button
                        type="button"
                        className="text-xs text-gray-400 hover:underline"
                        onClick={() => { setShowCta(false); setCtaLabel(""); setCtaUrl(""); }}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <input
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        value={ctaLabel}
                        onChange={(e) => setCtaLabel(e.target.value)}
                        placeholder="Button label e.g. Shop now"
                        maxLength={80}
                      />
                      <input
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        value={ctaUrl}
                        onChange={(e) => setCtaUrl(e.target.value)}
                        placeholder="https://…"
                        type="url"
                      />
                    </div>
                  </div>
                )}

                {/* Expiry (only for promotions) */}
                {announcementType === "promotion" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Offer expires at (device local time)
                    </label>
                    <input
                      type="datetime-local"
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                    />
                  </div>
                )}

                {/* Deep link */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Deep link / launch URL (optional)
                  </label>
                  <input
                    className="w-full max-w-lg rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Defaults to /(app)/announcements"
                  />
                </div>

                {/* Advanced */}
                <button
                  type="button"
                  className="text-xs font-medium text-gray-500 hover:underline"
                  onClick={() => setShowAdvanced((v) => !v)}
                >
                  {showAdvanced ? "Hide" : "Show"} advanced options
                </button>
                {showAdvanced && (
                  <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Internal / campaign name (OneSignal)</label>
                      <input
                        className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        value={internalName}
                        onChange={(e) => setInternalName(e.target.value)}
                        placeholder="e.g. April retention"
                        maxLength={128}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Subtitle (iOS)</label>
                      <input
                        className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        value={subtitle}
                        onChange={(e) => setSubtitle(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">OS banner image URL (push big picture, overrides cover image)</label>
                      <input
                        className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        placeholder="https://…"
                        type="url"
                      />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Schedule send (local → UTC)</label>
                        <input
                          type="datetime-local"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          value={sendAfterLocal}
                          onChange={(e) => setSendAfterLocal(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Android priority</label>
                        <select
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          value={priority}
                          onChange={(e) => setPriority(e.target.value as "" | "5" | "10")}
                        >
                          <option value="">Default</option>
                          <option value="5">Normal (5)</option>
                          <option value="10">High (10)</option>
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">iOS interruption level</label>
                        <select
                          className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          value={iosInterruption}
                          onChange={(e) =>
                            setIosInterruption(e.target.value as "" | "passive" | "active" | "time_sensitive" | "critical")
                          }
                        >
                          <option value="">Default</option>
                          <option value="passive">Passive</option>
                          <option value="active">Active</option>
                          <option value="time_sensitive">Time sensitive</option>
                          <option value="critical">Critical</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Raw <code className="text-xs">additional_data</code> override (JSON object)
                      </label>
                      <textarea
                        className="w-full min-h-[80px] rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
                        value={additionalDataJson}
                        onChange={(e) => setAdditionalDataJson(e.target.value)}
                        spellCheck={false}
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            {channel !== "push" && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Deep link recorded with broadcast (optional)
                </label>
                <input
                  className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="/account-settings/notifications"
                />
              </div>
            )}

            {status ? <p className="text-sm text-red-600">{status}</p> : null}

            <div className="flex justify-between gap-2 flex-wrap">
              <button type="button" className={adminToolbarButtonClass(false)} onClick={() => { setStatus(null); setStep(1); }}>
                ← Back
              </button>
              <button type="button" className={adminToolbarButtonClass(false)} onClick={goToStep3}>
                Next: preview →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Preview & Confirm ────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-6">
            {/* Mobile push preview card */}
            {channel === "push" && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2 uppercase tracking-wide">Mobile push preview</p>
                <div className="max-w-sm rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                  {(mediaUrl.trim() || videoUrl.trim()) && (
                    <div className="h-32 bg-gray-100 overflow-hidden">
                      {videoUrl.trim() ? (
                        <div className="flex h-full items-center justify-center text-xs text-gray-500">▶ Video: {videoUrl.trim().slice(0, 40)}</div>
                      ) : (
                        <img
                          src={mediaUrl.trim()}
                          alt="Cover"
                          className="h-full w-full object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="h-4 w-4 rounded bg-indigo-600" />
                      <span className="text-xs font-semibold text-gray-500">Beautonomi</span>
                      {announcementType !== "general" && (
                        <span className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                          ANNOUNCEMENT_TYPES.find((a) => a.value === announcementType)?.color ?? "bg-gray-100 text-gray-700",
                        )}>
                          {announcementType}
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-sm text-gray-900 leading-tight">
                      {title.trim() || "(No title)"}
                    </p>
                    <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                      {message.trim().slice(0, 100) || "(No message)"}
                    </p>
                    {ctaLabel.trim() && ctaUrl.trim() && (
                      <div className="mt-3 rounded-lg bg-indigo-600 px-3 py-1.5 text-center text-xs font-semibold text-white">
                        {ctaLabel.trim()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Audience summary */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 divide-y divide-gray-200 text-sm">
              <div className="px-4 py-3">
                <span className="font-semibold text-gray-900">Audience: </span>
                <span className="text-gray-700">{audienceLabel}</span>
                {(recipientType === "all_users" || recipientType === "all_providers") && typeof audiencePreviewQ.data?.count === "number" ? (
                  <span className="text-gray-500"> (≈ {audiencePreviewQ.data.count} accounts)</span>
                ) : null}
              </div>
              <div className="px-4 py-3">
                <span className="font-semibold text-gray-900">Channel: </span>
                <span className="capitalize text-gray-700">{channel}</span>
              </div>
              {channel === "push" && (
                <>
                  <div className="px-4 py-3">
                    <span className="font-semibold text-gray-900">Type: </span>
                    <span className="text-gray-700 capitalize">{announcementType}</span>
                  </div>
                  {(mediaUrl.trim() || videoUrl.trim()) && (
                    <div className="px-4 py-3">
                      <span className="font-semibold text-gray-900">Media: </span>
                      <span className="text-gray-700">{videoUrl.trim() ? "Video" : "Image"}</span>
                      <span className="ml-1 truncate text-gray-500">{(videoUrl.trim() || mediaUrl.trim()).slice(0, 60)}</span>
                    </div>
                  )}
                  {ctaLabel.trim() && ctaUrl.trim() && (
                    <div className="px-4 py-3">
                      <span className="font-semibold text-gray-900">CTA: </span>
                      <span className="text-gray-700">{ctaLabel.trim()}</span>
                      <span className="text-gray-500"> → {ctaUrl.trim().slice(0, 60)}</span>
                    </div>
                  )}
                  {announcementType === "promotion" && expiresAt.trim() && (
                    <div className="px-4 py-3">
                      <span className="font-semibold text-gray-900">Expires: </span>
                      <span className="text-gray-700">{expiresAt}</span>
                    </div>
                  )}
                  <div className="px-4 py-3">
                    <span className="font-semibold text-gray-900">Deep link: </span>
                    <span className="text-gray-700">{url.trim() || "/(app)/announcements (default)"}</span>
                  </div>
                  {sendAfterLocal.trim() && (
                    <div className="px-4 py-3">
                      <span className="font-semibold text-gray-900">Delivery: </span>
                      <span className="text-gray-700">Scheduled for {sendAfterLocal}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {status ? <p className={`text-sm ${m.isError ? "text-red-600" : "text-gray-700"}`}>{status}</p> : null}

            <div className="flex justify-between gap-2 flex-wrap">
              <button type="button" className={adminToolbarButtonClass(false)} onClick={() => { setStatus(null); setStep(2); }}>
                ← Back to content
              </button>
              <button
                type="button"
                className={cn(
                  "inline-flex min-h-11 min-w-[10rem] touch-manipulation items-center justify-center rounded-xl border border-transparent bg-indigo-600 px-6 text-sm font-semibold text-white transition hover:bg-indigo-700 active:bg-indigo-800",
                  m.isPending && "pointer-events-none opacity-60",
                )}
                disabled={m.isPending}
                onClick={() => {
                  setStatus(null);
                  void m.mutate();
                }}
              >
                {m.isPending ? "Sending…" : "Send broadcast"}
              </button>
            </div>
          </div>
        )}
      </AdminPanel>
    </div>
  );
}
