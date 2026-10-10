import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { adminToast } from "@/lib/adminToast";

type RendobarFutureFeature = {
  feature_key: string;
  effective_enabled: boolean;
  adapter_status: "not_wired_v1_uses_ffmpeg";
};

type RendobarStatus = {
  masked_api_key: string | null;
  has_api_key: boolean;
  has_callback_secret: boolean;
  has_storage_connection_id: boolean;
  env_fallback_api_key: boolean;
  integration_ready: boolean;
  has_public_app_url?: boolean;
  webhook_callback_url?: string | null;
  video_transcode_feature: { feature_key: string; effective_enabled: boolean };
  future_features?: RendobarFutureFeature[];
  api_test?: { ok: boolean; status: number; message?: string };
};

export function RendobarIntegrationPage() {
  useAdminDocumentTitle("Rendobar");
  const { allowed, denied } = useSuperadminPage("Superadmin access is required.");
  const qc = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [callbackSecret, setCallbackSecret] = useState("");
  const [storageConnectionId, setStorageConnectionId] = useState("");

  const query = useQuery({
    queryKey: ["admin", "integrations", "rendobar"],
    enabled: allowed,
    queryFn: () =>
      adminApi.getJson<RendobarStatus>("/api/admin/integrations/rendobar", { timeoutMs: 30_000 }),
  });

  const patchMutation = useMutation({
    mutationFn: (body: Record<string, string>) =>
      adminApi.patchJson("/api/admin/integrations/rendobar", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "integrations", "rendobar"] });
      setApiKey("");
      setCallbackSecret("");
      adminToast.success("Rendobar secrets updated");
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const testMutation = useMutation({
    mutationFn: () =>
      adminApi.getJson<RendobarStatus>("/api/admin/integrations/rendobar?test=1", { timeoutMs: 30_000 }),
    onSuccess: (data) => {
      void qc.setQueryData(["admin", "integrations", "rendobar"], data);
      const t = data.api_test;
      if (t?.ok) adminToast.success("Rendobar API reachable");
      else adminToast.error(t?.message || `Rendobar test failed (${t?.status ?? "?"})`);
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  if (denied) return denied;

  const status = query.data;
  const authFailed = isAdminApiAuthFailure(query.error);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Rendobar"
        description="Explore video probe/encode jobs via Rendobar. Per-job callbacks hit your public webhook URL with callback.verify; use the org callback signing secret from Rendobar (Settings → callback secret), not only a dashboard webhook secret unless they match."
      />
      <AdminPanel>
        {query.isLoading ? (
          <AdminPageSkeleton rows={4} />
        ) : authFailed ? (
          <AdminRetryBlock
            message={query.error instanceof Error ? query.error.message : "Failed to load"}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-gray-500">Integration ready</dt>
              <dd className="font-medium">{status?.integration_ready ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">API key</dt>
              <dd>{status?.masked_api_key ?? (status?.has_api_key ? "Set" : "Missing")}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Callback secret</dt>
              <dd>{status?.has_callback_secret ? "Set" : "Missing"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Storage connection</dt>
              <dd>{status?.has_storage_connection_id ? "Set" : "Missing"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Public APP_URL</dt>
              <dd>{status?.has_public_app_url ? "Set" : "Missing (set APP_URL on web server)"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Webhook callback URL</dt>
              <dd className="font-mono text-xs break-all">
                {status?.webhook_callback_url ?? "Unavailable until APP_URL is configured"}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Video transcode flag</dt>
              <dd>
                {status?.video_transcode_feature.feature_key}:{" "}
                {status?.video_transcode_feature.effective_enabled ? "enabled" : "disabled"}
              </dd>
            </div>
            {status?.api_test ? (
              <div>
                <dt className="text-gray-500">Last API test</dt>
                <dd>
                  {status.api_test.ok ? "OK" : "Failed"} (HTTP {status.api_test.status})
                  {status.api_test.message ? (
                    <span className="mt-1 block text-xs text-red-700">{status.api_test.message}</span>
                  ) : null}
                </dd>
              </div>
            ) : null}
          </dl>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={adminToolbarButtonClass(testMutation.isPending)}
            disabled={testMutation.isPending}
            onClick={() => void testMutation.mutate()}
          >
            Test job types API
          </button>
          <button type="button" className={adminToolbarButtonClass()} onClick={() => void query.refetch()}>
            Refresh
          </button>
        </div>
      </AdminPanel>

      <AdminPanel>
        <h2 className="text-lg font-semibold text-gray-900">Future capabilities (default off)</h2>
        <p className="mt-1 text-sm text-gray-600">
          AI captions, JSON timeline, and smart compression are feature-flagged. Leave disabled until adapters ship;
          v1 Explore always uses ffmpeg encode today.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {(status?.future_features ?? []).map((f) => (
            <li key={f.feature_key} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono text-xs text-gray-800">{f.feature_key}</span>
              <span className={f.effective_enabled ? "text-amber-700" : "text-gray-500"}>
                {f.effective_enabled ? "enabled (still on v1 ffmpeg until adapter)" : "disabled"}
              </span>
            </li>
          ))}
          {!status?.future_features?.length ? (
            <li className="text-gray-500">Run migration 981 to seed future flags.</li>
          ) : null}
        </ul>
      </AdminPanel>

      <AdminPanel>
        <h2 className="text-lg font-semibold text-gray-900">Update secrets</h2>
        <p className="mt-1 text-sm text-gray-600">Leave fields blank to keep existing values.</p>
        <div className="mt-4 grid gap-3 max-w-lg">
          <label className="block text-sm">
            <span className="text-gray-700">API key</span>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">Callback signing secret (Rendobar org callback secret)</span>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={callbackSecret}
              onChange={(e) => setCallbackSecret(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">Storage connection ID</span>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={storageConnectionId}
              onChange={(e) => setStorageConnectionId(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={adminToolbarButtonClass(patchMutation.isPending)}
            disabled={patchMutation.isPending || (!apiKey.trim() && !callbackSecret.trim() && !storageConnectionId.trim())}
            onClick={() => {
              const body: Record<string, string> = {};
              if (apiKey.trim()) body.rendobar_api_key = apiKey.trim();
              if (callbackSecret.trim()) body.rendobar_callback_secret = callbackSecret.trim();
              if (storageConnectionId.trim()) body.rendobar_storage_connection_id = storageConnectionId.trim();
              void patchMutation.mutate(body);
            }}
          >
            Save
          </button>
        </div>
      </AdminPanel>
    </div>
  );
}
