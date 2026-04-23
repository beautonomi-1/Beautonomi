import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Key, Shield, AlertTriangle } from "lucide-react";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import { adminToast } from "@/lib/adminToast";

interface PaystackConfig {
  configured: boolean;
  /** True when keys exist on a platform_secrets row (possibly global fallback). */
  configured_in_db?: boolean;
  masked_secret_key: string | null;
  masked_public_key: string | null;
  has_webhook_secret: boolean;
  updated_at?: string;
  inherited_from_global?: boolean;
  secrets_scope?: "global" | "tenant";
  env: { has_env_secret_key: boolean; has_env_public_key: boolean };
}

const BLANK = { secret_key: "", public_key: "", webhook_secret: "" };

export function PaystackConfigPage() {
  useAdminDocumentTitle("Paystack Integration");
  const { allowed, denied } = useSuperadminPage("Paystack key management is superadmin-only.");
  void allowed;
  const qc = useQueryClient();

  const [form, setForm] = useState(BLANK);
  const [showForm, setShowForm] = useState(false);

  const q = useQuery({
    queryKey: adminQueryKeys.paystackConfig(),
    queryFn: () =>
      adminApi.getJson<PaystackConfig>("/api/admin/integrations/paystack", { timeoutMs: 30_000 }),
  });

  const saveMut = useMutation({
    mutationFn: (body: Record<string, string>) =>
      adminApi.patchJson("/api/admin/integrations/paystack", body),
    onSuccess: () => {
      adminToast.success("Paystack keys saved");
      setShowForm(false);
      setForm(BLANK);
      void qc.invalidateQueries({ queryKey: adminQueryKeys.paystackConfig() });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const handleSave = () => {
    const body: Record<string, string> = {};
    if (form.secret_key.trim()) body.paystack_secret_key = form.secret_key.trim();
    if (form.public_key.trim()) body.paystack_public_key = form.public_key.trim();
    if (form.webhook_secret.trim()) body.paystack_webhook_secret = form.webhook_secret.trim();
    if (Object.keys(body).length === 0) {
      adminToast.error("Enter at least one key to update.");
      return;
    }
    saveMut.mutate(body);
  };

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Paystack" />
        <AdminPanel><AdminPageSkeleton rows={4} /></AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const d = q.data!;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Paystack integration"
        description="Manage Paystack API keys for payment processing. Keys are stored encrypted and never returned in full."
      />

      <AdminMutationAlert errors={[saveMut.error instanceof Error ? saveMut.error : null]} />

      {/* Status */}
      <AdminPanel>
        <div className="flex items-start gap-4">
          <div className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${d.configured ? "bg-green-100" : "bg-amber-100"}`}>
            <Shield className={`h-5 w-5 ${d.configured ? "text-green-700" : "text-amber-600"}`} />
          </div>
          <div>
            <p className={`font-medium ${d.configured ? "text-green-800" : "text-amber-800"}`}>
              {d.configured ? "Paystack configured" : "Paystack not configured"}
            </p>
            <p className="mt-0.5 text-sm text-gray-500">
              {d.configured_in_db === false && (d.env.has_env_secret_key || d.env.has_env_public_key)
                ? "No Paystack keys on platform_secrets for this admin scope; runtime uses environment variables."
                : d.configured
                  ? `Keys are available${d.updated_at ? ` (row last updated ${new Date(d.updated_at).toLocaleString()})` : ""}.`
                  : "No Paystack credentials found in the database or env for this view."}
            </p>
          </div>
        </div>

        {d.inherited_from_global ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
            <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-700" />
            <p className="text-sm text-blue-900">
              Showing keys from the <strong>global</strong> platform_secrets row. This market does not have its own row
              yet, or the tenant row has no Paystack keys — runtime still resolves global keys the same way.
            </p>
          </div>
        ) : null}

        {/* ENV fallback banner */}
        {(d.env.has_env_secret_key || d.env.has_env_public_key) && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">
              If <code className="font-mono text-xs">PAYSTACK_SECRET_KEY</code> /{" "}
              <code className="font-mono text-xs">PAYSTACK_PUBLIC_KEY</code> are set in the server environment, Paystack
              server code may prefer them (see paystack-server resolution order).
            </p>
          </div>
        )}

        {/* Current masked keys */}
        {d.masked_secret_key || d.masked_public_key || d.has_webhook_secret ? (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-gray-500">Secret key</dt>
              <dd className="font-mono font-medium">{d.masked_secret_key ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Public key</dt>
              <dd className="font-mono font-medium">{d.masked_public_key ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Webhook secret</dt>
              <dd className="font-mono font-medium">{d.has_webhook_secret ? "Set (hidden)" : "—"}</dd>
            </div>
          </dl>
        ) : null}
      </AdminPanel>

      {/* Edit form */}
      {showForm ? (
        <AdminPanel>
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Key className="h-4 w-4" />
            Update Paystack keys
          </h3>
          <p className="mb-4 text-xs text-gray-500">
            Leave a field blank to keep the existing value. Saving a field will overwrite it.
          </p>
          <div className="space-y-4">
            {[
              { label: "Secret key (sk_...)", key: "secret_key", placeholder: "sk_live_..." },
              { label: "Public key (pk_...)", key: "public_key", placeholder: "pk_live_..." },
              { label: "Webhook secret", key: "webhook_secret", placeholder: "whsec_..." },
            ].map(({ label, key, placeholder }) => (
              <div key={key} className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">{label}</label>
                <input
                  type="password"
                  autoComplete="off"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder={placeholder}
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              className={adminToolbarButtonClass(saveMut.isPending)}
              disabled={saveMut.isPending}
              onClick={handleSave}
            >
              {saveMut.isPending ? "Saving…" : "Save keys"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={() => { setShowForm(false); setForm(BLANK); }}
            >
              Cancel
            </button>
          </div>
        </AdminPanel>
      ) : (
        <button
          type="button"
          className={adminToolbarButtonClass(false) + " inline-flex items-center gap-2"}
          onClick={() => setShowForm(true)}
        >
          <Key className="h-4 w-4" />
          {d.configured ? "Update keys" : "Configure keys"}
        </button>
      )}

      <AdminPanel>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">How it works</h3>
        <ul className="space-y-1 text-sm text-gray-600 list-disc list-inside">
          <li>Database keys take precedence over environment variables at runtime.</li>
          <li>Secret keys are never returned to the browser in full — only masked previews.</li>
          <li>Use test keys (<code className="font-mono text-xs">sk_test_*</code>) for staging; live keys for production.</li>
          <li>Webhook secret is used to verify incoming Paystack webhook payloads.</li>
        </ul>
      </AdminPanel>
    </div>
  );
}
