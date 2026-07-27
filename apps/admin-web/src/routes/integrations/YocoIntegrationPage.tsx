import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { AlertTriangle, BookOpen, CheckCircle2, ExternalLink, Info, Key, Shield } from "lucide-react";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { adminToast } from "@/lib/adminToast";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import { adminSpaTo } from "@/lib/adminSpaPath";

/** GET /api/admin/integrations/yoco — client unwraps `data` from successResponse. */
interface YocoAdminStatus {
  admin_scope: "global" | "tenant";
  effective_tenant_id: string | null;
  oauth_v2_feature: {
    effective_enabled: boolean;
    global_row_present: boolean;
    global_row_enabled: boolean | null;
    tenant_row_present: boolean;
    tenant_row_enabled: boolean | null;
    feature_key: string;
  };
  platform_env: {
    YOCO_ENV: string | null;
    live_oauth_env_vars: { has_client_id: boolean; has_client_secret: boolean; has_redirect_uri: boolean };
    sandbox_oauth_env_vars: { has_client_id: boolean; has_client_secret: boolean; has_redirect_uri: boolean };
    live_oauth_env_complete: boolean;
    sandbox_oauth_env_complete: boolean;
  };
  tenant_yoco_oauth_apps: {
    live: {
      source: "tenant" | "global";
      masked_client_id: string | null;
      redirect_uri: string | null;
      default_scopes: string | null;
      has_client_secret: boolean;
      is_enabled: boolean;
      updated_at: string | null;
    } | null;
    sandbox: {
      source: "tenant" | "global";
      masked_client_id: string | null;
      redirect_uri: string | null;
      default_scopes: string | null;
      has_client_secret: boolean;
      is_enabled: boolean;
      updated_at: string | null;
    } | null;
  };
  resolution_notes: {
    oauth_client_order: string;
    provider_connect: string;
  };
}

type YocoEnv = "live" | "sandbox";
type YocoAppStatus = NonNullable<YocoAdminStatus["tenant_yoco_oauth_apps"][YocoEnv]>;

const DEFAULT_SCOPES =
  "openid offline_access business/webpos:read business/webpos:write application/webhooks:read application/webhooks:write business/orders:read business/payouts:read";

type YocoOauthForm = {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  default_scopes: string;
  is_enabled: boolean;
};

function YocoOauthAppEditor({
  env,
  app,
  onSave,
  saving,
}: {
  env: YocoEnv;
  app: YocoAppStatus | null;
  onSave: (env: YocoEnv, form: YocoOauthForm) => void;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<YocoOauthForm>({
    client_id: "",
    client_secret: "",
    redirect_uri: app?.redirect_uri ?? "",
    default_scopes: app?.default_scopes ?? DEFAULT_SCOPES,
    is_enabled: app?.is_enabled ?? true,
  });

  const configured = Boolean(app?.masked_client_id && app?.has_client_secret && app?.redirect_uri);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">{env} OAuth app</h3>
          <p className="mt-1 text-sm text-gray-600">
            {configured
              ? `${app?.source ?? "global"} row configured · client ${app?.masked_client_id ?? "—"}`
              : "No complete DB OAuth app row. Runtime may fall back to server env vars."}
          </p>
          {app?.updated_at ? (
            <p className="mt-1 text-xs text-gray-500">Updated {new Date(app.updated_at).toLocaleString()}</p>
          ) : null}
        </div>
        <button
          type="button"
          className={adminToolbarButtonClass(false) + " inline-flex items-center gap-2"}
          onClick={() => {
            setForm({
              client_id: "",
              client_secret: "",
              redirect_uri: app?.redirect_uri ?? "",
              default_scopes: app?.default_scopes ?? DEFAULT_SCOPES,
              is_enabled: app?.is_enabled ?? true,
            });
            setOpen((v) => !v);
          }}
        >
          <Key className="h-4 w-4" />
          {configured ? "Edit app" : "Configure app"}
        </button>
      </div>
      {app?.default_scopes ? (
        <p className="mt-3 break-all rounded-lg bg-gray-50 p-2 text-xs text-gray-600">
          <span className="font-medium text-gray-800">Scopes:</span> {app.default_scopes}
        </p>
      ) : null}
      {open ? (
        <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
          <p className="text-xs text-gray-500">
            Leave client ID or secret blank to keep the current value. Redirect URI and scopes are shown because they
            are operational config, not secrets.
          </p>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.is_enabled}
              onChange={(event) => setForm((f) => ({ ...f, is_enabled: event.target.checked }))}
            />
            Enabled for OAuth resolution
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Client ID</label>
              <input
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
                value={form.client_id}
                placeholder={app?.masked_client_id ?? "Yoco client ID"}
                onChange={(event) => setForm((f) => ({ ...f, client_id: event.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Client secret</label>
              <input
                type="password"
                autoComplete="off"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
                value={form.client_secret}
                placeholder={app?.has_client_secret ? "Set (hidden)" : "Yoco client secret"}
                onChange={(event) => setForm((f) => ({ ...f, client_secret: event.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Redirect URI</label>
            <input
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
              value={form.redirect_uri}
              placeholder="https://app.example.com/api/provider/yoco/oauth/callback"
              onChange={(event) => setForm((f) => ({ ...f, redirect_uri: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Default scopes</label>
            <textarea
              className="mt-1 min-h-[84px] w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
              value={form.default_scopes}
              onChange={(event) => setForm((f) => ({ ...f, default_scopes: event.target.value }))}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={adminToolbarButtonClass(saving)}
              disabled={saving}
              onClick={() => onSave(env, form)}
            >
              {saving ? "Saving..." : "Save OAuth app"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function YocoIntegrationPage() {
  useAdminDocumentTitle("Yoco Web POS (OAuth)");
  const { allowed, denied } = useSuperadminPage("Yoco platform configuration is superadmin-only.");
  void allowed;
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: adminQueryKeys.yocoIntegrationStatus(),
    queryFn: () =>
      adminApi.getJson<YocoAdminStatus>("/api/admin/integrations/yoco", { timeoutMs: 30_000 }),
  });

  const saveOauthApp = useMutation({
    mutationFn: ({ env, form }: { env: YocoEnv; form: YocoOauthForm }) => {
      const body: Record<string, unknown> = {
        environment: env,
        is_enabled: form.is_enabled,
        default_scopes: form.default_scopes.trim(),
      };
      if (form.client_id.trim()) body.client_id = form.client_id.trim();
      if (form.client_secret.trim()) body.client_secret = form.client_secret.trim();
      if (form.redirect_uri.trim()) body.redirect_uri = form.redirect_uri.trim();
      return adminApi.patchJson("/api/admin/integrations/yoco", body);
    },
    onSuccess: async () => {
      adminToast.success("Yoco OAuth app saved");
      await qc.invalidateQueries({ queryKey: adminQueryKeys.yocoIntegrationStatus() });
    },
    onError: (error: Error) => adminToast.error(error.message),
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Yoco" />
        <AdminPanel>
          <AdminPageSkeleton rows={6} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const d = q.data;
  if (!d || typeof d !== "object" || !("oauth_v2_feature" in d)) {
    return <AdminRetryBlock message="Empty or unexpected response from server." onRetry={() => void q.refetch()} />;
  }

  const scopeLabel =
    d.admin_scope === "global"
      ? "Platform-wide (global secrets / global OAuth app rows)"
      : `Tenant-scoped (effective tenant id: ${d.effective_tenant_id ?? "—"})`;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Yoco Web POS & OAuth"
        description="How Beautonomi authenticates Yoco card terminals (api.yoco.com) vs hosted checkout (payments.yoco.com). Superadmin setup for your market or a white-label tenant."
      />
      <AdminMutationAlert errors={[saveOauthApp.error instanceof Error ? saveOauthApp.error : null]} />

      <AdminPanel>
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div className="min-w-0 text-sm text-gray-700">
            <p className="font-medium text-gray-900">Admin scope for this page</p>
            <p className="mt-1 text-gray-600">{scopeLabel}</p>
            <p className="mt-2 text-gray-600">
              Switch the tenant context in the admin shell (host / tenant selector) before opening this page to
              inspect that tenant’s overrides. Use{" "}
              <code className="rounded bg-gray-100 px-1">?scope=global</code> as superadmin when supported to view
              platform defaults only.
            </p>
          </div>
        </div>
      </AdminPanel>

      <AdminPanel>
        <h2 className="text-base font-semibold text-gray-900">OAuth app configuration</h2>
        <p className="mt-1 text-sm text-gray-600">
          Manage the OAuth apps used by provider <em>Connect Yoco</em>. Tenant scoped rows override global rows; if no
          row exists, runtime falls back to server environment variables.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <YocoOauthAppEditor
            env="live"
            app={d.tenant_yoco_oauth_apps.live}
            saving={saveOauthApp.isPending}
            onSave={(env, form) => saveOauthApp.mutate({ env, form })}
          />
          <YocoOauthAppEditor
            env="sandbox"
            app={d.tenant_yoco_oauth_apps.sandbox}
            saving={saveOauthApp.isPending}
            onSave={(env, form) => saveOauthApp.mutate({ env, form })}
          />
        </div>
      </AdminPanel>

      {/* Live status */}
      <AdminPanel>
        <h2 className="text-base font-semibold text-gray-900">Rollout & environment</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Feature flag: Connect Yoco (OAuth)</dt>
            <dd className="flex items-center gap-2 font-medium">
              {d.oauth_v2_feature.effective_enabled ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-green-800">On for this scope</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-amber-800">Off — providers only see Checkout key paste</span>
                </>
              )}
            </dd>
            <dd className="mt-1 text-xs text-gray-500">
              Key: <code className="rounded bg-gray-100 px-1">{d.oauth_v2_feature.feature_key}</code>
              {" · "}
              <Link
                to={adminSpaTo("/admin/settings/feature-flags")}
                className="font-medium text-primary underline"
              >
                Open feature flags
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Server default YOCO_ENV</dt>
            <dd className="font-mono text-sm font-medium">{d.platform_env.YOCO_ENV || "(unset — defaults to live)"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-gray-500">OAuth app rows in DB (tenant_yoco_oauth_apps)</dt>
            <dd className="mt-1 space-y-2 text-gray-800">
              <div>
                <span className="font-medium">Live:</span>{" "}
                {d.tenant_yoco_oauth_apps.live ? (
                  <>
                    {d.tenant_yoco_oauth_apps.live.source} override · client{" "}
                    <code className="rounded bg-gray-100 px-1 text-xs">
                      {d.tenant_yoco_oauth_apps.live.masked_client_id ?? "—"}
                    </code>
                    {d.tenant_yoco_oauth_apps.live.redirect_uri ? (
                      <>
                        {" "}
                        · redirect{" "}
                        <code className="break-all rounded bg-gray-100 px-1 text-xs">
                          {d.tenant_yoco_oauth_apps.live.redirect_uri}
                        </code>
                      </>
                    ) : null}{" "}
                    · {d.tenant_yoco_oauth_apps.live.is_enabled ? "enabled" : "disabled"}
                    {d.tenant_yoco_oauth_apps.live.default_scopes ? (
                      <>
                        {" "}
                        · scopes{" "}
                        <code className="break-all rounded bg-gray-100 px-1 text-xs">
                          {d.tenant_yoco_oauth_apps.live.default_scopes}
                        </code>
                      </>
                    ) : null}
                  </>
                ) : (
                  <span className="text-gray-500">No row — falls back to env vars if set</span>
                )}
              </div>
              <div>
                <span className="font-medium">Sandbox:</span>{" "}
                {d.tenant_yoco_oauth_apps.sandbox ? (
                  <>
                    {d.tenant_yoco_oauth_apps.sandbox.source} · client{" "}
                    <code className="rounded bg-gray-100 px-1 text-xs">
                      {d.tenant_yoco_oauth_apps.sandbox.masked_client_id ?? "—"}
                    </code>
                    {d.tenant_yoco_oauth_apps.sandbox.redirect_uri ? (
                      <>
                        {" "}
                        · redirect{" "}
                        <code className="break-all rounded bg-gray-100 px-1 text-xs">
                          {d.tenant_yoco_oauth_apps.sandbox.redirect_uri}
                        </code>
                      </>
                    ) : null}
                    {d.tenant_yoco_oauth_apps.sandbox.default_scopes ? (
                      <>
                        {" "}
                        · scopes{" "}
                        <code className="break-all rounded bg-gray-100 px-1 text-xs">
                          {d.tenant_yoco_oauth_apps.sandbox.default_scopes}
                        </code>
                      </>
                    ) : null}
                  </>
                ) : (
                  <span className="text-gray-500">No row — use YOCO_OAUTH_*_SANDBOX env vars</span>
                )}
              </div>
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-gray-500">Process env fallback (never shown in full)</dt>
            <dd className="mt-1 text-xs text-gray-600">
              Live vars complete:{" "}
              <strong>{d.platform_env.live_oauth_env_complete ? "yes" : "no"}</strong>
              {" · "}Sandbox vars complete:{" "}
              <strong>{d.platform_env.sandbox_oauth_env_complete ? "yes" : "no"}</strong>
            </dd>
          </div>
        </dl>
      </AdminPanel>

      {/* How it works */}
      <AdminPanel>
        <div className="flex items-start gap-3">
          <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-gray-600" />
          <div className="min-w-0 text-sm text-gray-700">
            <h2 className="text-base font-semibold text-gray-900">Two credentials, two APIs</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                <strong>OAuth JWT</strong> (Connect Yoco in provider settings) talks to{" "}
                <code className="rounded bg-gray-100 px-1">api.yoco.com</code> — Web POS devices, terminal charges,
                refunds on the Yoco API.
              </li>
              <li>
                <strong>Dashboard secret key</strong> (<code className="rounded bg-gray-100 px-1">sk_live_…</code>{" "}
                paste flow) talks to <code className="rounded bg-gray-100 px-1">payments.yoco.com</code> — hosted
                checkout links / QR only. It cannot create real card terminals.
              </li>
            </ul>
            <p className="mt-3 text-gray-600">{d.resolution_notes.oauth_client_order}</p>
            <p className="mt-2 text-gray-600">{d.resolution_notes.provider_connect}</p>
          </div>
        </div>
      </AdminPanel>

      {/* Setup checklist */}
      <AdminPanel>
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">Operator checklist</h2>
            <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm text-gray-700">
              <li>
                <strong>Register a Yoco OAuth application</strong> with Yoco (partner / developer program). Register{" "}
                <em>both</em> redirect URLs for live and staging:{" "}
                <code className="break-all rounded bg-gray-100 px-1 text-xs">
                  https://&lt;your-app-host&gt;/api/provider/yoco/oauth/callback
                </code>
                . Request scopes including{" "}
                <code className="rounded bg-gray-100 px-1 text-xs">
                  openid offline_access business/webpos:read business/webpos:write application/webhooks:read application/webhooks:write
                </code>{" "}
                (plus <code className="rounded bg-gray-100 px-1 text-xs">business/orders:read</code> and{" "}
                <code className="rounded bg-gray-100 px-1 text-xs">business/payouts:read</code> for the reconciliation
                report). Only request scopes listed in the{" "}
                <a
                  href="https://developer.yoco.com/docs/api/authentication/scopes"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary underline"
                >
                  published Yoco scope catalog
                </a>{" "}
                — unknown scopes break the consent flow.
              </li>
              <li>
                <strong>Platform default:</strong> set Vercel / server env{" "}
                <code className="rounded bg-gray-100 px-1 text-xs">YOCO_OAUTH_CLIENT_ID</code>,{" "}
                <code className="rounded bg-gray-100 px-1 text-xs">YOCO_OAUTH_CLIENT_SECRET</code>,{" "}
                <code className="rounded bg-gray-100 px-1 text-xs">YOCO_OAUTH_REDIRECT_URI</code>, plus{" "}
                <code className="rounded bg-gray-100 px-1 text-xs">YOCO_OAUTH_*_SANDBOX</code> for sandbox. See repo
                doc <code className="rounded bg-gray-100 px-1 text-xs">docs/YOCO_OAUTH_SETUP.md</code>.
              </li>
              <li>
                <strong>White-label tenant:</strong> insert a row into{" "}
                <code className="rounded bg-gray-100 px-1 text-xs">tenant_yoco_oauth_apps</code> with that tenant’s
                UUID, <code className="rounded bg-gray-100 px-1 text-xs">environment</code>,{" "}
                <code className="rounded bg-gray-100 px-1 text-xs">client_id</code>,{" "}
                <code className="rounded bg-gray-100 px-1 text-xs">client_secret</code>, and{" "}
                <code className="rounded bg-gray-100 px-1 text-xs">redirect_uri</code> for their branded domain. Tenant
                rows override the global row for that tenant only.
              </li>
              <li>
                <strong>Enable the UI:</strong> turn on feature flag{" "}
                <code className="rounded bg-gray-100 px-1 text-xs">yoco_oauth_v2</code> globally or per tenant in{" "}
                <Link to={adminSpaTo("/admin/settings/feature-flags")} className="font-medium text-primary underline">
                  Feature flags
                </Link>
                . Providers then see <em>Connect Yoco</em> and can add Web POS devices after OAuth completes.
              </li>
              <li>
                <strong>Existing Checkout-only providers:</strong> migration 610 sets{" "}
                <code className="rounded bg-gray-100 px-1 text-xs">credential_mode = checkout</code> where they had
                keys saved. They keep hosted checkout; they must complete OAuth once for terminals. The provider app
                shows a dismissible reconnect banner when the flag is on.
              </li>
            </ol>
          </div>
        </div>
      </AdminPanel>

      {/* SQL template */}
      <AdminPanel>
        <h2 className="text-base font-semibold text-gray-900">SQL template — tenant OAuth app (white-label)</h2>
        <p className="mt-2 text-sm text-gray-600">
          Run in Supabase SQL editor as service role. Replace placeholders. Never commit real secrets to git.
        </p>
        <pre className="mt-3 max-h-[320px] overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed text-gray-800">
{`INSERT INTO tenant_yoco_oauth_apps
  (tenant_id, environment, client_id, client_secret, redirect_uri, default_scopes, is_enabled)
VALUES
  (
    '<TENANT_UUID>'::uuid,
    'live',
    '<from_yoco>',
    '<from_yoco>',
    'https://<tenant-app-host>/api/provider/yoco/oauth/callback',
    'openid offline_access business/webpos:read business/webpos:write application/webhooks:read application/webhooks:write business/orders:read business/payouts:read',
    true
  );
-- Repeat for environment = 'sandbox' if this tenant uses Yoco sandbox.`}
        </pre>
      </AdminPanel>

      <AdminPanel>
        <h2 className="text-base font-semibold text-gray-900">External references</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-700">
          <li>
            <a
              href="https://developer.yoco.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary underline"
            >
              Yoco developer docs <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </li>
          <li>
            Provider-facing flow: Payment settings → Yoco (web) or Settings → Yoco devices (mobile) after the flag is
            enabled.
          </li>
        </ul>
      </AdminPanel>
    </div>
  );
}
