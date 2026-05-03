import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { adminSpaTo } from "@/lib/adminSpaPath";

type Channel = "push" | "sms" | "email";
type RecipientType = "all_users" | "all_providers" | "custom";
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

function parseUserIds(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function BroadcastComposePage() {
  useAdminDocumentTitle("Compose Broadcast");
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const [channel, setChannel] = useState<Channel>("push");
  const [recipientType, setRecipientType] = useState<RecipientType>("all_users");
  const [customIds, setCustomIds] = useState("");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("");
  /** OneSignal internal / campaign name (not shown on device) */
  const [internalName, setInternalName] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [sendAfterLocal, setSendAfterLocal] = useState(""); // datetime-local value
  const [priority, setPriority] = useState<"" | "5" | "10">("");
  const [iosInterruption, setIosInterruption] = useState<"" | "passive" | "active" | "time_sensitive" | "critical">(
    "",
  );
  const [additionalDataJson, setAdditionalDataJson] = useState("{\n}");
  const [status, setStatus] = useState<string | null>(null);

  const configQ = useQuery({
    queryKey: ["notifications-config-for-broadcast"],
    queryFn: () => adminApi.getJson<NotificationConfig>("/api/admin/notifications/config", { timeoutMs: 30_000 }),
    enabled: allowed && channel === "push",
  });

  const audiencePreviewQ = useQuery({
    queryKey: ["broadcast-audience-preview", recipientType],
    queryFn: () =>
      adminApi.getJson<{ count?: number; mode?: string }>(
        `/api/admin/broadcast/audience-preview?segment=${recipientType === "all_providers" ? "providers" : "customers"}`,
        { timeoutMs: 25_000 },
      ),
    enabled:
      allowed &&
      (recipientType === "all_users" || recipientType === "all_providers"),
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
      if (recipientType === "custom" && (!user_ids || user_ids.length === 0)) {
        throw new Error("Add at least one user ID for a custom audience.");
      }
      if (!message.trim()) {
        throw new Error("Message / body is required.");
      }
      if (channel === "push") {
        if (!title.trim()) throw new Error("Push notifications require a title.");
        let additional_data: Record<string, unknown> | undefined;
        try {
          const parsed = JSON.parse(additionalDataJson || "{}") as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            additional_data = parsed as Record<string, unknown>;
          } else {
            throw new Error("Additional data must be a JSON object.");
          }
        } catch (e) {
          throw new Error(e instanceof Error ? e.message : "Invalid additional data JSON");
        }
        let send_after: string | undefined;
        if (sendAfterLocal.trim()) {
          const d = new Date(sendAfterLocal);
          if (Number.isNaN(d.getTime())) throw new Error("Invalid schedule date.");
          send_after = d.toISOString();
        }
        return adminApi.postJson<{
          message?: string;
          recipients?: number;
          notification_id?: string;
          delivery?: string;
        }>("/api/admin/broadcast/push", {
          title: title.trim(),
          message: message.trim(),
          recipient_type: recipientType,
          user_ids,
          url: url.trim() || undefined,
          name: internalName.trim() || undefined,
          subtitle: subtitle.trim() || undefined,
          image: imageUrl.trim() || undefined,
          send_after,
          priority: priority === "5" || priority === "10" ? parseInt(priority, 10) : undefined,
          ios_interruption_level: iosInterruption || undefined,
          additional_data: Object.keys(additional_data).length > 0 ? additional_data : undefined,
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
          app_type:
            recipientType === "custom"
              ? "customer" // SMS broadcasts target a phone, not a OneSignal app
              : undefined,
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
        app_type:
          recipientType === "custom"
            ? "customer" // email is a single dedupe channel, app_type is informational
            : undefined,
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
              : `Submitted to OneSignal for ${r.recipients} user account(s) — not queued in Beautonomi; devices usually receive the push within seconds.`,
          );
        } else {
          parts.push("Broadcast request completed.");
        }
        if (typeof r.onesignal_recipients === "number") {
          parts.push(`OneSignal reach: ${r.onesignal_recipients} device(s).`);
          if (r.onesignal_recipients === 0) {
            parts.push(
              "Reach is zero — most likely no targeted user has logged into the right OneSignal app yet.",
            );
          }
        }
        if (Array.isArray(r.onesignal_errors) && r.onesignal_errors.length > 0) {
          parts.push(
            `OneSignal warnings: ${JSON.stringify(r.onesignal_errors).slice(0, 200)}`,
          );
        }
        if (r.notification_id) {
          parts.push(`OneSignal message id: ${r.notification_id}`);
        }
        setStatus(parts.join(" "));
        return;
      }
      // Email / SMS: real Resend / Twilio path. Surface partial failures.
      if (typeof r.message === "string" && r.message.trim()) {
        if (r.first_failure?.error) {
          setStatus(`${r.message.trim()} First failure: ${r.first_failure.error}`);
        } else {
          setStatus(r.message.trim());
        }
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

      <AdminPanel>
        <p className="text-sm text-gray-600">
          Customer and provider broadcasts use the same API: the request is sent to OneSignal immediately. “Queued” was a
          misleading label — we never buffer sends in Beautonomi. Large audiences may see staggered device delivery on
          OneSignal’s side.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600">Channel</label>
            <select
              className="mt-1 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel)}
            >
              <option value="push">Push</option>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600">Audience</label>
            <select
              className="mt-1 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={recipientType}
              onChange={(e) => setRecipientType(e.target.value as RecipientType)}
            >
              <option value="all_users">All customers</option>
              <option value="all_providers">All providers (tenant)</option>
              <option value="custom">Custom user IDs</option>
            </select>
          </div>

          {recipientType === "all_users" || recipientType === "all_providers" ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
              <span className="font-medium">Audience preview: </span>
              {audiencePreviewQ.isLoading
                ? "Counting recipients…"
                : audiencePreviewQ.isError
                  ? "Could not load preview."
                  : typeof audiencePreviewQ.data?.count === "number"
                    ? `${audiencePreviewQ.data.count} user account(s)${audiencePreviewQ.data.mode ? ` (${audiencePreviewQ.data.mode})` : ""}. ${
                        channel === "email"
                          ? "Final reach depends on how many have an email on file."
                          : channel === "sms"
                            ? "Final reach depends on how many have a phone on file."
                            : ""
                      }`
                    : "—"}
            </div>
          ) : null}

          {channel === "push" ? (
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-950">
              <div className="font-medium">OneSignal configuration check</div>
              {recipientType === "custom" ? (
                <p className="mt-1 text-xs">
                  Custom audiences may contain customer and provider users. Make sure both OneSignal apps have App IDs and REST API keys configured.
                </p>
              ) : configQ.isLoading ? (
                <p className="mt-1 text-xs">Checking saved OneSignal app ID and REST key presence…</p>
              ) : activeOneSignalConfig ? (
                <p className="mt-1 text-xs">
                  {recipientType === "all_providers" ? "Provider" : "Customer"} app ID{" "}
                  {activeOneSignalConfig.app_id ? "is set" : "is missing"}; REST API key{" "}
                  {activeOneSignalConfig.rest_api_key_configured ? "is set" : "is missing"}.
                </p>
              ) : (
                <p className="mt-1 text-xs">
                  OneSignal config could not be checked here. Broadcast API will still validate credentials before sending.
                </p>
              )}
              {configQ.data?.diagnostics?.onesignal_missing?.length ? (
                <p className="mt-1 text-xs text-blue-900">
                  Missing: {configQ.data.diagnostics.onesignal_missing.join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}

          {recipientType === "custom" ? (
            <div>
              <label className="block text-xs font-medium text-gray-600">User IDs (comma or whitespace separated)</label>
              <textarea
                className="mt-1 w-full min-h-[88px] rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm"
                value={customIds}
                onChange={(e) => setCustomIds(e.target.value)}
                placeholder="uuid-one, uuid-two"
              />
            </div>
          ) : null}

          {channel === "push" ? (
            <div>
              <label className="block text-xs font-medium text-gray-600">Title</label>
              <input
                className="mt-1 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          ) : null}

          {channel === "push" ? (
            <div>
              <label className="block text-xs font-medium text-gray-600">Internal / campaign name (OneSignal, optional)</label>
              <input
                className="mt-1 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={internalName}
                onChange={(e) => setInternalName(e.target.value)}
                placeholder="e.g. April retention — customers"
                maxLength={128}
              />
            </div>
          ) : null}

          {channel === "push" ? (
            <div>
              <label className="block text-xs font-medium text-gray-600">Subtitle (iOS, optional)</label>
              <input
                className="mt-1 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
              />
            </div>
          ) : null}

          {channel === "email" ? (
            <div>
              <label className="block text-xs font-medium text-gray-600">Subject</label>
              <input
                className="mt-1 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
          ) : null}

          <div>
            <label className="block text-xs font-medium text-gray-600">{channel === "push" ? "Message" : "Body / message"}</label>
            <textarea
              className="mt-1 w-full min-h-[120px] rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600">
              {channel === "push"
                ? "Deep link / launch URL (optional)"
                : channel === "email"
                  ? "In-app deep link recorded with the broadcast (optional)"
                  : "In-app deep link recorded with the broadcast (optional)"}
            </label>
            <input
              className="mt-1 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={channel === "push" ? "https://… or app deep link" : "/account-settings/notifications"}
            />
            {channel !== "push" ? (
              <p className="mt-1 text-xs text-gray-500">
                Tap target for the in-app inbox row mirrored from this broadcast. Leave blank to land on the notifications screen.
              </p>
            ) : null}
          </div>

          {channel === "push" ? (
            <div>
              <label className="block text-xs font-medium text-gray-600">Image URL (optional, big picture / rich push)</label>
              <input
                className="mt-1 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
          ) : null}

          {channel === "push" ? (
            <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-600">Schedule send (optional, local time → UTC)</label>
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={sendAfterLocal}
                  onChange={(e) => setSendAfterLocal(e.target.value)}
                />
                <p className="mt-1 text-xs text-gray-500">Empty = send as soon as OneSignal accepts the message.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Android priority (optional)</label>
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as "" | "5" | "10")}
                >
                  <option value="">Default</option>
                  <option value="5">Normal (5)</option>
                  <option value="10">High (10)</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600">iOS interruption level (optional)</label>
                <select
                  className="mt-1 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={iosInterruption}
                  onChange={(e) =>
                    setIosInterruption(
                      e.target.value as "" | "passive" | "active" | "time_sensitive" | "critical",
                    )
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
          ) : null}

          {channel === "push" ? (
            <div>
              <label className="block text-xs font-medium text-gray-600">
                Additional <code className="text-xs">data</code> fields (JSON object, merged with admin_broadcast)
              </label>
              <textarea
                className="mt-1 w-full min-h-[100px] rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
                value={additionalDataJson}
                onChange={(e) => setAdditionalDataJson(e.target.value)}
                spellCheck={false}
              />
            </div>
          ) : null}

          {status ? (
            <p className={`text-sm ${status.includes("Error") || m.isError ? "text-red-600" : "text-gray-700"}`}>{status}</p>
          ) : null}

          <button
            type="button"
            className={adminToolbarButtonClass(m.isPending)}
            disabled={m.isPending}
            onClick={() => {
              setStatus(null);
              void m.mutate();
            }}
          >
            {m.isPending ? "Sending…" : "Send broadcast"}
          </button>
        </div>
      </AdminPanel>
    </div>
  );
}
