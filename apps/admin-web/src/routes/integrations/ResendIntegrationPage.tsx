import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Mail, Shield } from "lucide-react";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import { adminToast } from "@/lib/adminToast";
import { adminSpaTo } from "@/lib/adminSpaPath";

interface ResendConfig {
  configured: boolean;
  configured_in_db?: boolean;
  enabled: boolean;
  masked_api_key: string | null;
  from_address: string | null;
  has_from_address: boolean;
  updated_at?: string;
  inherited_from_global?: boolean;
  secrets_scope?: "global" | "tenant";
  env: { has_env_api_key: boolean; has_env_from_address: boolean };
  usage_note?: string;
}

export function ResendIntegrationPage() {
  useAdminDocumentTitle("Resend");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_INTEGRATIONS_DEV,
    "Integrations & dev access is required.",
  );
  const qc = useQueryClient();

  const [apiKey, setApiKey] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [testEmail, setTestEmail] = useState("");
  const [showForm, setShowForm] = useState(false);

  const q = useQuery({
    queryKey: adminQueryKeys.resendConfig(),
    queryFn: () =>
      adminApi.getJson<ResendConfig>("/api/admin/integrations/resend", { timeoutMs: 30_000 }),
    enabled: allowed,
  });

  useEffect(() => {
    const d = q.data;
    if (!d) return;
    setFromAddress(d.from_address ?? "");
    setEnabled(d.enabled !== false);
  }, [q.data]);

  const saveMut = useMutation({
    mutationFn: (body: Record<string, string | boolean>) =>
      adminApi.patchJson("/api/admin/integrations/resend", body),
    onSuccess: () => {
      adminToast.success("Resend settings saved");
      setShowForm(false);
      setApiKey("");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.resendConfig() });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.notificationsConfig() });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const testMut = useMutation({
    mutationFn: (to: string) =>
      adminApi.postJson("/api/admin/integrations/resend/test", { to }),
    onSuccess: () => adminToast.success("Test email sent"),
    onError: (e: Error) => adminToast.error(e.message),
  });

  const handleToggleEnabled = (next: boolean) => {
    setEnabled(next);
    saveMut.mutate({ enabled: next });
  };

  const handleSaveCredentials = () => {
    const body: Record<string, string | boolean> = {};
    if (apiKey.trim()) body.resend_api_key = apiKey.trim();
    if (fromAddress.trim()) body.resend_from_address = fromAddress.trim();
    if (Object.keys(body).length === 0) {
      adminToast.error("Enter an API key or from address to update.");
      return;
    }
    saveMut.mutate(body);
  };

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Resend" />
        <AdminPanel>
          <AdminPageSkeleton rows={4} />
        </AdminPanel>
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
        title="Resend integration"
        description="Transactional email for the notification queue, admin broadcasts, guest portal links, and shadow-account claim invites."
        actions={
          <Link
            to={adminSpaTo("/admin/notifications")}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            Notifications config →
          </Link>
        }
      />

      <AdminMutationAlert errors={[saveMut.error, testMut.error]} />

      <AdminPanel>
        <div className="flex items-start gap-4">
          <div
            className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${d.configured ? "bg-green-100" : "bg-amber-100"}`}
          >
            <Shield className={`h-5 w-5 ${d.configured ? "text-green-700" : "text-amber-600"}`} />
          </div>
          <div>
            <p className={`font-medium ${d.configured ? "text-green-800" : "text-amber-800"}`}>
              {d.configured ? "Resend configured" : "Resend not configured"}
            </p>
            <p className="mt-0.5 text-sm text-gray-500">
              {d.configured_in_db === false && d.env.has_env_api_key
                ? "No Resend key on platform_secrets for this scope; runtime uses RESEND_API_KEY from the server environment."
                : d.configured
                  ? `API key is available${d.updated_at ? ` (row last updated ${new Date(d.updated_at).toLocaleString()})` : ""}.`
                  : "No Resend credentials found in the database or environment for this view."}
            </p>
            {d.usage_note ? <p className="mt-2 text-xs text-gray-600">{d.usage_note}</p> : null}
          </div>
        </div>

        {d.inherited_from_global ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
            <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-700" />
            <p className="text-sm text-blue-900">
              Showing keys from the <strong>global</strong> platform_secrets row. This market does not have its own
              Resend keys yet — runtime still resolves global keys the same way.
            </p>
          </div>
        ) : null}

        {d.env.has_env_api_key || d.env.has_env_from_address ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">
              Server environment may also define{" "}
              <code className="font-mono text-xs">RESEND_API_KEY</code> /{" "}
              <code className="font-mono text-xs">EMAIL_FROM_ADDRESS</code> as fallbacks when DB keys are absent.
            </p>
          </div>
        ) : null}

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">API key</dt>
            <dd className="font-mono font-medium">{d.masked_api_key ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">From address</dt>
            <dd className="font-mono text-xs">{d.from_address ?? "—"}</dd>
          </div>
        </dl>

        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-gray-800">
          <input
            type="checkbox"
            className="rounded border-gray-300"
            checked={enabled}
            disabled={saveMut.isPending}
            onChange={(e) => handleToggleEnabled(e.target.checked)}
          />
          Enable Resend for transactional email
        </label>
        <p className="mt-1 text-[11px] text-gray-500">Saved immediately when toggled.</p>
      </AdminPanel>

      <AdminPanel>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-900">Credentials</h2>
          <button
            type="button"
            className="text-sm font-medium text-indigo-700 underline"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancel" : d.configured ? "Update keys" : "Add keys"}
          </button>
        </div>

        {showForm ? (
          <div className="grid max-w-xl gap-4">
            <label className="block text-xs font-medium text-gray-700">
              Resend API key
              <input
                type="password"
                autoComplete="off"
                placeholder={d.masked_api_key ? "Leave blank to keep saved key" : "re_…"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-gray-700">
              From address
              <input
                type="text"
                placeholder='Beautonomi <notifications@yourdomain.com>'
                value={fromAddress}
                onChange={(e) => setFromAddress(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-[11px] text-gray-500">
                Must match a verified sender domain in your Resend dashboard.
              </span>
            </label>
            <button
              type="button"
              className={adminToolbarButtonClass(saveMut.isPending)}
              disabled={saveMut.isPending}
              onClick={handleSaveCredentials}
            >
              {saveMut.isPending ? "Saving…" : "Save Resend settings"}
            </button>
          </div>
        ) : (
          <p className="text-sm text-gray-600">
            Keys are stored in <code className="rounded bg-gray-100 px-1">platform_secrets</code> and never returned in
            full after save.
          </p>
        )}
      </AdminPanel>

      <AdminPanel>
        <div className="mb-3 flex items-center gap-2">
          <Mail className="h-4 w-4 text-gray-600" />
          <h2 className="text-sm font-semibold text-gray-900">Send test email</h2>
        </div>
        <div className="flex max-w-lg flex-wrap items-end gap-2">
          <label className="min-w-[220px] flex-1 text-xs font-medium text-gray-700">
            Recipient
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            className={adminToolbarButtonClass(testMut.isPending)}
            disabled={testMut.isPending || !testEmail.trim() || !d.configured}
            onClick={() => testMut.mutate(testEmail.trim())}
          >
            {testMut.isPending ? "Sending…" : "Send test"}
          </button>
        </div>
        {!d.configured ? (
          <p className="mt-2 text-xs text-amber-700">Configure Resend before sending a test email.</p>
        ) : null}
      </AdminPanel>
    </div>
  );
}
