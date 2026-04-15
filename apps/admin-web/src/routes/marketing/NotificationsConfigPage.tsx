import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_INTEGRATIONS_DEV, ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPageAny } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";

interface NotificationChannel {
  enabled: boolean;
  provider?: string;
  api_key_set?: boolean;
  app_id_set?: boolean;
  from?: string;
  test_mode?: boolean;
}

interface NotificationsConfig {
  email?: NotificationChannel;
  sms?: NotificationChannel;
  push?: NotificationChannel;
  in_app?: NotificationChannel;
  whatsapp?: NotificationChannel;
  onesignal?: { app_id_set?: boolean; api_key_set?: boolean; enabled?: boolean };
  twilio?: { account_sid_set?: boolean; auth_token_set?: boolean; from_number?: string; enabled?: boolean };
  [key: string]: unknown;
}

function ChannelCard({
  label,
  channel,
  color,
}: {
  label: string;
  channel: NotificationChannel | undefined;
  color: string;
}) {
  if (!channel) return null;
  return (
    <div className={`rounded-lg border ${channel.enabled ? "border-green-200 bg-green-50" : "border-gray-200 bg-gray-50"} p-4`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">{label}</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${channel.enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
          {channel.enabled ? "Enabled" : "Disabled"}
        </span>
      </div>
      <dl className="mt-3 space-y-1 text-sm">
        {channel.provider && (
          <div className="flex justify-between">
            <dt className="text-gray-500">Provider</dt>
            <dd className="font-medium text-gray-900">{channel.provider}</dd>
          </div>
        )}
        {channel.from && (
          <div className="flex justify-between">
            <dt className="text-gray-500">From</dt>
            <dd className="font-mono text-xs text-gray-900">{channel.from}</dd>
          </div>
        )}
        {channel.api_key_set !== undefined && (
          <div className="flex justify-between">
            <dt className="text-gray-500">API Key</dt>
            <dd className={channel.api_key_set ? "text-green-700 font-medium" : "text-red-600 font-medium"}>
              {channel.api_key_set ? "✓ Set" : "✗ Missing"}
            </dd>
          </div>
        )}
        {channel.app_id_set !== undefined && (
          <div className="flex justify-between">
            <dt className="text-gray-500">App ID</dt>
            <dd className={channel.app_id_set ? "text-green-700 font-medium" : "text-red-600 font-medium"}>
              {channel.app_id_set ? "✓ Set" : "✗ Missing"}
            </dd>
          </div>
        )}
        {channel.test_mode !== undefined && (
          <div className="flex justify-between">
            <dt className="text-gray-500">Mode</dt>
            <dd className={channel.test_mode ? "text-amber-700 font-medium" : "text-gray-900"}>
              {channel.test_mode ? "Test mode" : "Live"}
            </dd>
          </div>
        )}
      </dl>
      <div className={`mt-2 h-1.5 rounded-full ${color} opacity-60`} />
    </div>
  );
}

export function NotificationsConfigPage() {
  const { allowed, denied } = useAdminSectionPageAny(
    [ADMIN_SECTION_MARKETING_COMMS, ADMIN_SECTION_INTEGRATIONS_DEV],
    "Marketing or Integrations access is required."
  );
  const qc = useQueryClient();
  const [showRaw, setShowRaw] = useState(false);

  const q = useQuery({
    queryKey: adminQueryKeys.notificationsConfig(),
    queryFn: () => adminApi.getJson<NotificationsConfig>("/api/admin/notifications/config", { timeoutMs: 30_000 }),
    enabled: allowed,
  });

  const testMutation = useMutation({
    mutationFn: (channel: string) =>
      adminApi.postJson("/api/admin/notifications/test", { channel }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminQueryKeys.notificationsConfig() }),
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Notifications" />
        <AdminPanel>
          <AdminPageSkeleton rows={3} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const cfg = q.data;
  const channels = [
    { key: "push", label: "Push (OneSignal)", color: "bg-blue-500" },
    { key: "email", label: "Email", color: "bg-indigo-500" },
    { key: "sms", label: "SMS (OneSignal)", color: "bg-green-500" },
    { key: "whatsapp", label: "WhatsApp", color: "bg-emerald-500" },
    { key: "in_app", label: "In-App", color: "bg-purple-500" },
  ];

  const onesignal = cfg?.onesignal;
  const twilio = cfg?.twilio;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Notification configuration"
        description="Push, email, SMS, and in-app channel settings. Credentials are stored as platform secrets."
        actions={
          <button
            type="button"
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
            onClick={() => setShowRaw((v) => !v)}
          >
            {showRaw ? "Hide raw" : "Show raw config"}
          </button>
        }
      />

      {/* Integration status */}
      {(onesignal || twilio) && (
        <AdminPanel>
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Integration credentials</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {onesignal && (
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                <h3 className="font-semibold text-blue-900">OneSignal (Push)</h3>
                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-blue-700">Status</dt>
                    <dd className={onesignal.enabled ? "text-green-700 font-medium" : "text-gray-600"}>
                      {onesignal.enabled ? "Active" : "Inactive"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-blue-700">App ID</dt>
                    <dd className={onesignal.app_id_set ? "text-green-700 font-medium" : "text-red-600 font-medium"}>
                      {onesignal.app_id_set ? "✓ Set" : "✗ Missing"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-blue-700">API Key</dt>
                    <dd className={onesignal.api_key_set ? "text-green-700 font-medium" : "text-red-600 font-medium"}>
                      {onesignal.api_key_set ? "✓ Set" : "✗ Missing"}
                    </dd>
                  </div>
                </dl>
              </div>
            )}
            {twilio && (
              <div className="rounded-lg border border-green-100 bg-green-50 p-4">
                <h3 className="font-semibold text-green-900">Twilio (SMS/Voice)</h3>
                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-green-700">Status</dt>
                    <dd className={twilio.enabled ? "text-green-700 font-medium" : "text-gray-600"}>
                      {twilio.enabled ? "Active" : "Inactive"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-green-700">Account SID</dt>
                    <dd className={twilio.account_sid_set ? "text-green-700 font-medium" : "text-red-600 font-medium"}>
                      {twilio.account_sid_set ? "✓ Set" : "✗ Missing"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-green-700">Auth Token</dt>
                    <dd className={twilio.auth_token_set ? "text-green-700 font-medium" : "text-red-600 font-medium"}>
                      {twilio.auth_token_set ? "✓ Set" : "✗ Missing"}
                    </dd>
                  </div>
                  {twilio.from_number && (
                    <div className="flex justify-between">
                      <dt className="text-green-700">From Number</dt>
                      <dd className="font-mono text-xs text-green-900">{twilio.from_number}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
          </div>
        </AdminPanel>
      )}

      {/* Channel cards */}
      <AdminPanel>
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Notification channels</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {channels.map(({ key, label, color }) => (
            <ChannelCard
              key={key}
              label={label}
              channel={cfg?.[key] as NotificationChannel | undefined}
              color={color}
            />
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          {["push", "email", "sms"].map((ch) => (
            <button
              key={ch}
              type="button"
              className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
              disabled={testMutation.isPending}
              onClick={() => testMutation.mutate(ch)}
            >
              Test {ch}
            </button>
          ))}
        </div>
        {testMutation.isSuccess && (
          <p className="mt-2 text-sm text-green-700">✓ Test notification sent.</p>
        )}
        <AdminMutationAlert errors={[testMutation.error]} />
      </AdminPanel>

      <AdminPanel>
        <p className="text-xs text-gray-500">
          <strong>Note:</strong> Expo / mobile push credentials are managed via OneSignal. Customer broadcast campaigns are under
          Marketing → Broadcast. In-app alerts for ops work appear in the header bell.
        </p>
      </AdminPanel>

      {showRaw && (
        <AdminPanel>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Raw config (GET /api/admin/notifications/config)</h2>
          <pre className="max-h-[320px] overflow-auto rounded bg-gray-50 p-4 text-xs">
            {JSON.stringify(q.data, null, 2)}
          </pre>
        </AdminPanel>
      )}
    </div>
  );
}
