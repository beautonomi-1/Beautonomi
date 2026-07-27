import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Info, Key } from "lucide-react";
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

const RSA_PRIVATE_KEY_PLACEHOLDER = ["-----BEGIN ", "RSA PRIVATE KEY", "-----"].join("");
const PUBLIC_KEY_PLACEHOLDER = ["-----BEGIN ", "PUBLIC KEY", "-----"].join("");

type PaycloudEnv = "live" | "sandbox";

interface PaycloudFeatureFlag {
  effective_enabled: boolean;
  global_row_present: boolean;
  global_row_enabled: boolean | null;
  tenant_row_present: boolean;
  tenant_row_enabled: boolean | null;
  feature_key: string;
}

interface PaycloudAppStatus {
  source: "tenant" | "global";
  row_id?: string | null;
  masked_app_id: string | null;
  api_base_url: string | null;
  has_app_rsa_private_key: boolean;
  has_gateway_rsa_public_key: boolean;
  is_enabled: boolean;
  updated_at: string | null;
}

interface PaycloudAdminStatus {
  admin_scope: "global" | "tenant";
  effective_tenant_id: string | null;
  payment_paycloud_feature: PaycloudFeatureFlag;
  payment_paycloud_qr_feature: PaycloudFeatureFlag;
  payment_paycloud_cashback_feature: PaycloudFeatureFlag;
  payment_paycloud_same_terminal_feature?: PaycloudFeatureFlag;
  platform_env: {
    PAYCLOUD_API_BASE_LIVE: string | null;
    PAYCLOUD_API_BASE_SANDBOX: string | null;
    default_api_base: { live: string; sandbox: string };
  };
  tenant_paycloud_apps: {
    live: PaycloudAppStatus | null;
    sandbox: PaycloudAppStatus | null;
  };
  counts: { merchants: number; terminals: number };
  resolution_notes: {
    credentials_order: string;
    provider_connect: string;
  };
}

type PaycloudAppForm = {
  app_id: string;
  app_rsa_private_key: string;
  gateway_rsa_public_key: string;
  api_base_url: string;
  is_enabled: boolean;
};

function PaycloudAppEditor({
  env,
  app,
  defaultApiBase,
  onSave,
  saving,
}: {
  env: PaycloudEnv;
  app: PaycloudAppStatus | null;
  defaultApiBase: string;
  onSave: (env: PaycloudEnv, form: PaycloudAppForm) => void;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PaycloudAppForm>({
    app_id: "",
    app_rsa_private_key: "",
    gateway_rsa_public_key: "",
    api_base_url: app?.api_base_url ?? defaultApiBase,
    is_enabled: app?.is_enabled ?? true,
  });

  const configured = Boolean(
    app?.masked_app_id && app?.has_app_rsa_private_key && app?.has_gateway_rsa_public_key && app?.api_base_url,
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">{env} app</h3>
          <p className="mt-1 text-sm text-gray-600">
            {configured
              ? `${app?.source ?? "global"} row configured · app ${app?.masked_app_id ?? "—"}`
              : "No complete DB app row. Configure credentials before assigning terminals."}
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
              app_id: "",
              app_rsa_private_key: "",
              gateway_rsa_public_key: "",
              api_base_url: app?.api_base_url ?? defaultApiBase,
              is_enabled: app?.is_enabled ?? true,
            });
            setOpen((v) => !v);
          }}
        >
          <Key className="h-4 w-4" />
          {configured ? "Edit app" : "Configure app"}
        </button>
      </div>
      {app?.api_base_url ? (
        <p className="mt-3 break-all rounded-lg bg-gray-50 p-2 text-xs text-gray-600">
          <span className="font-medium text-gray-800">API base:</span> {app.api_base_url}
        </p>
      ) : null}
      {open ? (
        <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
          <p className="text-xs text-gray-500">
            Leave app ID or RSA keys blank to keep the current value. API base URL is operational config, not a secret.
          </p>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.is_enabled}
              onChange={(event) => setForm((f) => ({ ...f, is_enabled: event.target.checked }))}
            />
            Enabled for credential resolution
          </label>
          <div>
            <label className="block text-sm font-medium text-gray-700">App ID</label>
            <input
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
              value={form.app_id}
              placeholder={app?.masked_app_id ?? "PayCloud app ID"}
              onChange={(event) => setForm((f) => ({ ...f, app_id: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">App RSA private key</label>
            <textarea
              className="mt-1 min-h-[84px] w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
              value={form.app_rsa_private_key}
              placeholder={app?.has_app_rsa_private_key ? "Set (hidden)" : RSA_PRIVATE_KEY_PLACEHOLDER}
              onChange={(event) => setForm((f) => ({ ...f, app_rsa_private_key: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Gateway RSA public key</label>
            <textarea
              className="mt-1 min-h-[84px] w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
              value={form.gateway_rsa_public_key}
              placeholder={app?.has_gateway_rsa_public_key ? "Set (hidden)" : PUBLIC_KEY_PLACEHOLDER}
              onChange={(event) => setForm((f) => ({ ...f, gateway_rsa_public_key: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">API base URL</label>
            <input
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
              value={form.api_base_url}
              placeholder={defaultApiBase}
              onChange={(event) => setForm((f) => ({ ...f, api_base_url: event.target.value }))}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={adminToolbarButtonClass(saving)}
              disabled={saving}
              onClick={() => onSave(env, form)}
            >
              {saving ? "Saving..." : "Save app credentials"}
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

export function PayCloudIntegrationPage() {
  useAdminDocumentTitle("PayCloud Card Machines");
  const { allowed, denied } = useSuperadminPage("PayCloud platform configuration is superadmin-only.");
  void allowed;
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: adminQueryKeys.paycloudIntegrationStatus(),
    queryFn: () =>
      adminApi.getJson<PaycloudAdminStatus>("/api/admin/integrations/paycloud", { timeoutMs: 30_000 }),
  });

  const saveApp = useMutation({
    mutationFn: ({ env, form }: { env: PaycloudEnv; form: PaycloudAppForm }) => {
      const body: Record<string, unknown> = {
        environment: env,
        is_enabled: form.is_enabled,
        api_base_url: form.api_base_url.trim(),
      };
      if (form.app_id.trim()) body.app_id = form.app_id.trim();
      if (form.app_rsa_private_key.trim()) body.app_rsa_private_key = form.app_rsa_private_key.trim();
      if (form.gateway_rsa_public_key.trim()) body.gateway_rsa_public_key = form.gateway_rsa_public_key.trim();
      return adminApi.patchJson("/api/admin/integrations/paycloud", body);
    },
    onSuccess: async () => {
      adminToast.success("PayCloud app credentials saved");
      await qc.invalidateQueries({ queryKey: adminQueryKeys.paycloudIntegrationStatus() });
    },
    onError: (error: Error) => adminToast.error(error.message),
  });

  const testCredentials = useMutation({
    mutationFn: (environment: PaycloudEnv) =>
      adminApi.postJson<{ ok: boolean; message: string }>(
        "/api/admin/integrations/paycloud/test-credentials",
        { environment },
      ),
    onSuccess: (data) => {
      if (data.ok) adminToast.success(data.message || "Credentials OK");
      else adminToast.error(data.message || "Credential test failed");
    },
    onError: (error: Error) => adminToast.error(error.message),
  });

  const runReconcile = useMutation({
    mutationFn: () =>
      adminApi.postJson<{ payment_count: number }>("/api/admin/paycloud-operations/reconcile", {}),
    onSuccess: (data) => {
      adminToast.success(`Reconcile ran for ${data.payment_count ?? 0} pending payments`);
    },
    onError: (error: Error) => adminToast.error(error.message),
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="PayCloud" />
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
  if (!d || typeof d !== "object" || !("payment_paycloud_feature" in d)) {
    return <AdminRetryBlock message="Empty or unexpected response from server." onRetry={() => void q.refetch()} />;
  }

  const scopeLabel =
    d.admin_scope === "global"
      ? "Platform-wide (global credentials)"
      : `Tenant-scoped (effective tenant id: ${d.effective_tenant_id ?? "—"})`;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="PayCloud Card Machines"
        description="Platform credentials for Beautonomi card machines (WiseCashier Cloud Mode). Superadmin setup per market or white-label tenant."
      />
      <AdminMutationAlert
        errors={[
          saveApp.error instanceof Error ? saveApp.error : null,
          testCredentials.error instanceof Error ? testCredentials.error : null,
          runReconcile.error instanceof Error ? runReconcile.error : null,
        ]}
      />

      <AdminPanel>
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div className="min-w-0 text-sm text-gray-700">
            <p className="font-medium text-gray-900">Admin scope for this page</p>
            <p className="mt-1 text-gray-600">{scopeLabel}</p>
            <p className="mt-2 text-gray-600">
              Switch the tenant context in the admin shell before opening this page to inspect that tenant&apos;s
              overrides. Use <code className="rounded bg-gray-100 px-1">?scope=global</code> as superadmin when
              supported to view platform defaults only.
            </p>
          </div>
        </div>
      </AdminPanel>

      <AdminPanel>
        <h2 className="text-base font-semibold text-gray-900">App credentials</h2>
        <p className="mt-1 text-sm text-gray-600">
          Manage PayCloud RSA app credentials used when providers collect in-person card payments. Tenant rows override
          global rows.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <PaycloudAppEditor
            env="live"
            app={d.tenant_paycloud_apps.live}
            defaultApiBase={d.platform_env.default_api_base.live}
            saving={saveApp.isPending}
            onSave={(env, form) => saveApp.mutate({ env, form })}
          />
          <PaycloudAppEditor
            env="sandbox"
            app={d.tenant_paycloud_apps.sandbox}
            defaultApiBase={d.platform_env.default_api_base.sandbox}
            saving={saveApp.isPending}
            onSave={(env, form) => saveApp.mutate({ env, form })}
          />
        </div>
      </AdminPanel>

      <AdminPanel>
        <h2 className="text-base font-semibold text-gray-900">Rollout & fleet</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Feature flag: PayCloud card machines</dt>
            <dd className="flex items-center gap-2 font-medium">
              {d.payment_paycloud_feature.effective_enabled ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-green-800">On for this scope</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-amber-800">Off — providers cannot use card machines</span>
                </>
              )}
            </dd>
            <dd className="mt-1 text-xs text-gray-500">
              Key:{" "}
              <code className="rounded bg-gray-100 px-1">{d.payment_paycloud_feature.feature_key}</code>
              {" · "}
              <Link to={adminSpaTo("/admin/settings/feature-flags")} className="font-medium text-primary underline">
                Open feature flags
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Merchants registered</dt>
            <dd className="font-medium">{d.counts.merchants}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Terminals in fleet</dt>
            <dd className="font-medium">{d.counts.terminals}</dd>
          </div>
          <div>
            <dt className="text-gray-500">QR wallets sub-flag</dt>
            <dd className="font-medium">
              {d.payment_paycloud_qr_feature.effective_enabled ? "On" : "Off"}
              <span className="ml-1 text-xs text-gray-500">({d.payment_paycloud_qr_feature.feature_key})</span>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Cashback sub-flag</dt>
            <dd className="font-medium">
              {d.payment_paycloud_cashback_feature.effective_enabled ? "On" : "Off"}
              <span className="ml-1 text-xs text-gray-500">
                ({d.payment_paycloud_cashback_feature.feature_key})
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Same-device (P5) sub-flag</dt>
            <dd className="font-medium">
              {d.payment_paycloud_same_terminal_feature?.effective_enabled ? "On" : "Off"}
              <span className="ml-1 text-xs text-gray-500">
                ({d.payment_paycloud_same_terminal_feature?.feature_key ?? "payment_paycloud_same_terminal"})
              </span>
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={adminToolbarButtonClass(testCredentials.isPending)}
            disabled={testCredentials.isPending}
            onClick={() => testCredentials.mutate("sandbox")}
          >
            {testCredentials.isPending ? "Testing…" : "Test sandbox credentials"}
          </button>
          <button
            type="button"
            className={adminToolbarButtonClass(testCredentials.isPending)}
            disabled={testCredentials.isPending}
            onClick={() => testCredentials.mutate("live")}
          >
            Test live credentials
          </button>
          <button
            type="button"
            className={adminToolbarButtonClass(runReconcile.isPending)}
            disabled={runReconcile.isPending}
            onClick={() => runReconcile.mutate()}
          >
            {runReconcile.isPending ? "Reconciling…" : "Run reconcile now"}
          </button>
          <Link
            to={adminSpaTo("/admin/integrations/paycloud-operations")}
            className={adminToolbarButtonClass(false) + " inline-flex items-center"}
          >
            Open operations
          </Link>
        </div>
        <p className="mt-4 text-sm text-gray-600">{d.resolution_notes.credentials_order}</p>
        <p className="mt-2 text-sm text-gray-600">{d.resolution_notes.provider_connect}</p>
      </AdminPanel>

      <PaycloudMerchantsPanel />
    </div>
  );
}

type PaycloudMerchantRow = {
  id: string;
  label: string;
  merchant_no: string;
  store_no: string;
  environment: "live" | "sandbox";
  is_active: boolean;
  paycloud_app_id: string | null;
  app?: { id: string; environment: string; app_id: string; is_enabled: boolean } | null;
};

function PaycloudMerchantsPanel() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    label: "",
    merchant_no: "",
    store_no: "",
    environment: "live" as "live" | "sandbox",
    paycloud_app_id: "" as string,
    is_active: true,
  });

  const statusQ = useQuery({
    queryKey: adminQueryKeys.paycloudIntegrationStatus(),
    queryFn: () =>
      adminApi.getJson<{
        tenant_paycloud_apps: {
          live: { row_id?: string | null; masked_app_id: string | null; is_enabled: boolean } | null;
          sandbox: { row_id?: string | null; masked_app_id: string | null; is_enabled: boolean } | null;
        };
      }>("/api/admin/integrations/paycloud", { timeoutMs: 30_000 }),
  });

  const merchantsQ = useQuery({
    queryKey: adminQueryKeys.paycloudOperations.merchants(),
    queryFn: () =>
      adminApi.getJson<{ items: PaycloudMerchantRow[] }>(
        "/api/admin/paycloud-operations/merchants?limit=100",
        { timeoutMs: 30_000 },
      ),
  });

  const saveMerchant = useMutation({
    mutationFn: () => {
      if (editingId) {
        return adminApi.patchJson("/api/admin/paycloud-operations/merchants", {
          id: editingId,
          ...form,
          paycloud_app_id: form.paycloud_app_id || null,
        });
      }
      return adminApi.postJson("/api/admin/paycloud-operations/merchants", {
        ...form,
        paycloud_app_id: form.paycloud_app_id || null,
      });
    },
    onSuccess: async () => {
      adminToast.success(editingId ? "Merchant updated" : "Merchant created");
      setShowForm(false);
      setEditingId(null);
      setForm({ label: "", merchant_no: "", store_no: "", environment: "live", paycloud_app_id: "", is_active: true });
      await qc.invalidateQueries({ queryKey: adminQueryKeys.paycloudOperations.merchants() });
      await qc.invalidateQueries({ queryKey: adminQueryKeys.paycloudIntegrationStatus() });
    },
    onError: (error: Error) => adminToast.error(error.message),
  });

  const items = merchantsQ.data?.items ?? [];

  return (
    <AdminPanel>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Merchants</h2>
          <p className="mt-1 text-sm text-gray-600">
            Register PayCloud merchant and store numbers before assigning terminals. Each terminal must link to a
            merchant.
          </p>
        </div>
        <button
          type="button"
          className={adminToolbarButtonClass(false)}
          onClick={() => {
            setEditingId(null);
            setForm({ label: "", merchant_no: "", store_no: "", environment: "live", paycloud_app_id: "", is_active: true });
            setShowForm(true);
          }}
        >
          Add merchant
        </button>
      </div>

      {showForm ? (
        <div className="mt-4 space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Label</label>
              <input
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Salon main store"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Environment</label>
              <select
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                value={form.environment}
                onChange={(e) =>
                  setForm((f) => ({ ...f, environment: e.target.value as "live" | "sandbox" }))
                }
              >
                <option value="live">Live</option>
                <option value="sandbox">Sandbox</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">PayCloud app (optional)</label>
              <select
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                value={form.paycloud_app_id}
                onChange={(e) => setForm((f) => ({ ...f, paycloud_app_id: e.target.value }))}
              >
                <option value="">Auto (tenant → global for env)</option>
                {form.environment === "live" && statusQ.data?.tenant_paycloud_apps.live?.row_id ? (
                  <option value={statusQ.data.tenant_paycloud_apps.live.row_id}>
                    Live app {statusQ.data.tenant_paycloud_apps.live.masked_app_id ?? ""}
                  </option>
                ) : null}
                {form.environment === "sandbox" && statusQ.data?.tenant_paycloud_apps.sandbox?.row_id ? (
                  <option value={statusQ.data.tenant_paycloud_apps.sandbox.row_id}>
                    Sandbox app {statusQ.data.tenant_paycloud_apps.sandbox.masked_app_id ?? ""}
                  </option>
                ) : null}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Merchant no</label>
              <input
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
                value={form.merchant_no}
                onChange={(e) => setForm((f) => ({ ...f, merchant_no: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Store no</label>
              <input
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
                value={form.store_no}
                onChange={(e) => setForm((f) => ({ ...f, store_no: e.target.value }))}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            Active
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className={adminToolbarButtonClass(saveMerchant.isPending)}
              disabled={saveMerchant.isPending || !form.label || !form.merchant_no || !form.store_no}
              onClick={() => saveMerchant.mutate()}
            >
              {saveMerchant.isPending ? "Saving…" : editingId ? "Update merchant" : "Create merchant"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {merchantsQ.isLoading ? (
        <p className="mt-4 text-sm text-gray-500">Loading merchants…</p>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm text-amber-700">
          No merchants yet. Add at least one before assigning terminals to providers.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2 pr-3 font-medium">Label</th>
                <th className="py-2 pr-3 font-medium">Merchant no</th>
                <th className="py-2 pr-3 font-medium">Store no</th>
                <th className="py-2 pr-3 font-medium">Env</th>
                <th className="py-2 pr-3 font-medium">Active</th>
                <th className="py-2 pr-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3">{m.label}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{m.merchant_no}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{m.store_no}</td>
                  <td className="py-2 pr-3">{m.environment}</td>
                  <td className="py-2 pr-3">{m.is_active ? "Yes" : "No"}</td>
                  <td className="py-2 pr-3">
                    <button
                      type="button"
                      className="text-sm font-medium text-primary underline"
                      onClick={() => {
                        setEditingId(m.id);
                        setForm({
                          label: m.label,
                          merchant_no: m.merchant_no,
                          store_no: m.store_no,
                          environment: m.environment,
                          paycloud_app_id: m.paycloud_app_id ?? "",
                          is_active: m.is_active,
                        });
                        setShowForm(true);
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminPanel>
  );
}
