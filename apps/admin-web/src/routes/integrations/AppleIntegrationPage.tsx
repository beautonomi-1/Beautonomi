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

type AppleIntegrationStatus = {
  configured: boolean;
  finance_configured: boolean;
  issuer_id: string | null;
  key_id: string | null;
  private_key: string | null;
  bundle_id: string;
  commission_rate: number;
  vendor_number: string | null;
  finance_region_code: string;
  connect_issuer_id: string | null;
  connect_key_id: string | null;
  connect_private_key: string | null;
  enabled: boolean;
  jws_verification_enabled: boolean;
};

export function AppleIntegrationPage() {
  useAdminDocumentTitle("Apple App Store Connect");
  const { allowed, denied } = useSuperadminPage("Apple IAP credentials are superadmin-only.");
  void allowed;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    issuer_id: "",
    key_id: "",
    private_key: "",
    bundle_id: "com.beautonomi.partner",
    commission_rate: "0.15",
    vendor_number: "",
    finance_region_code: "ZZ",
    connect_issuer_id: "",
    connect_key_id: "",
    connect_private_key: "",
  });

  const q = useQuery({
    queryKey: adminQueryKeys.appleIntegration(),
    queryFn: () =>
      adminApi.getJson<AppleIntegrationStatus>("/api/admin/integrations/apple", { timeoutMs: 30_000 }),
  });

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        apple_app_store_bundle_id: form.bundle_id.trim(),
        apple_iap_commission_rate: parseFloat(form.commission_rate) || 0.15,
      };
      if (form.issuer_id.trim()) body.apple_app_store_issuer_id = form.issuer_id.trim();
      if (form.key_id.trim()) body.apple_app_store_key_id = form.key_id.trim();
      if (form.private_key.trim()) body.apple_app_store_private_key = form.private_key.trim();
      if (form.vendor_number.trim()) body.apple_asc_vendor_number = form.vendor_number.trim();
      if (form.finance_region_code.trim()) body.apple_finance_region_code = form.finance_region_code.trim();
      if (form.connect_issuer_id.trim()) body.apple_connect_issuer_id = form.connect_issuer_id.trim();
      if (form.connect_key_id.trim()) body.apple_connect_key_id = form.connect_key_id.trim();
      if (form.connect_private_key.trim()) body.apple_connect_private_key = form.connect_private_key.trim();
      return adminApi.patchJson("/api/admin/integrations/apple", body);
    },
    onSuccess: async () => {
      adminToast.success("Apple credentials saved");
      setOpen(false);
      await qc.invalidateQueries({ queryKey: adminQueryKeys.appleIntegration() });
    },
    onError: (error: Error) => adminToast.error(error.message),
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Apple App Store Connect" />
        <AdminPanel>
          <AdminPageSkeleton rows={5} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const d = q.data;
  if (!d) return <AdminRetryBlock message="Empty response" onRetry={() => void q.refetch()} />;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Apple App Store Connect"
        description="App Store Connect API credentials for IAP verification, server notifications, and ASC sync."
      />
      <AdminMutationAlert errors={[save.error instanceof Error ? save.error : null]} />

      <AdminPanel>
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div className="text-sm text-gray-700">
            <p>
              Credentials are stored in <code className="rounded bg-gray-100 px-1">platform_secrets</code>. In-app
              purchase checkout is on by default; set{" "}
              <code className="rounded bg-gray-100 px-1">APPLE_IAP_ENABLED=false</code> in the web app environment only
              to switch it off in an emergency, because iOS has no permitted fallback to Paystack.
            </p>
            <p className="mt-2">
              <Link to={adminSpaTo("/admin/monetization/apple/setup-sheet")} className="font-medium text-primary underline">
                Open setup sheet
              </Link>
              {" · "}
              <Link to={adminSpaTo("/admin/monetization/apple/products")} className="font-medium text-primary underline">
                Product registry
              </Link>
            </p>
          </div>
        </div>
      </AdminPanel>

      <AdminPanel>
        <h2 className="text-base font-semibold text-gray-900">Status</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {[
            { ok: d.configured, label: "App Store Connect credentials configured" },
            { ok: d.finance_configured, label: "Finance reports vendor number configured" },
            { ok: d.enabled, label: "In-app purchase checkout enabled for iOS providers" },
            {
              ok: d.jws_verification_enabled,
              label: d.jws_verification_enabled
                ? "App Store signature verification enforced"
                : "App Store signature verification is OFF (APPLE_IAP_VERIFY_JWS=false) — local StoreKit testing only, never production",
            },
            { ok: Boolean(d.bundle_id), label: `Bundle ID: ${d.bundle_id}` },
          ].map((row) => (
            <li key={row.label} className="flex items-center gap-2">
              {row.ok ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              )}
              <span className={row.ok ? "text-green-800" : "text-amber-900"}>{row.label}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Issuer ID</dt>
            <dd className="font-mono text-xs">{d.issuer_id ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Key ID</dt>
            <dd className="font-mono text-xs">{d.key_id ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Private key</dt>
            <dd className="font-mono text-xs">{d.private_key ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Commission rate</dt>
            <dd>{(d.commission_rate * 100).toFixed(1)}%</dd>
          </div>
          <div>
            <dt className="text-gray-500">Vendor number</dt>
            <dd className="font-mono text-xs">{d.vendor_number ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Finance region</dt>
            <dd className="font-mono text-xs">{d.finance_region_code}</dd>
          </div>
        </dl>
        <button
          type="button"
          className={adminToolbarButtonClass(false) + " mt-4 inline-flex items-center gap-2"}
          onClick={() => {
            setForm({
              issuer_id: d.issuer_id ?? "",
              key_id: d.key_id ?? "",
              private_key: "",
              bundle_id: d.bundle_id ?? "com.beautonomi.partner",
              commission_rate: String(d.commission_rate ?? 0.15),
              vendor_number: d.vendor_number ?? "",
              finance_region_code: d.finance_region_code ?? "ZZ",
              connect_issuer_id: d.connect_issuer_id ?? "",
              connect_key_id: d.connect_key_id ?? "",
              connect_private_key: "",
            });
            setOpen((v) => !v);
          }}
        >
          <Key className="h-4 w-4" />
          {d.configured ? "Edit credentials" : "Configure credentials"}
        </button>
        {open ? (
          <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-500">Leave private key blank to keep the current value.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                Issuer ID
                <input
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
                  value={form.issuer_id}
                  onChange={(e) => setForm((f) => ({ ...f, issuer_id: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                Key ID
                <input
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
                  value={form.key_id}
                  onChange={(e) => setForm((f) => ({ ...f, key_id: e.target.value }))}
                />
              </label>
              <label className="text-sm sm:col-span-2">
                Private key (.p8 contents)
                <textarea
                  className="mt-1 min-h-[84px] w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
                  value={form.private_key}
                  placeholder={d.private_key ? "Set (hidden)" : "-----BEGIN PRIVATE KEY-----"}
                  onChange={(e) => setForm((f) => ({ ...f, private_key: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                Bundle ID
                <input
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
                  value={form.bundle_id}
                  onChange={(e) => setForm((f) => ({ ...f, bundle_id: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                Commission rate (0.05–0.35)
                <input
                  type="number"
                  step="0.01"
                  min={0.05}
                  max={0.35}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  value={form.commission_rate}
                  onChange={(e) => setForm((f) => ({ ...f, commission_rate: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                App Store Connect vendor number
                <input
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
                  value={form.vendor_number}
                  onChange={(e) => setForm((f) => ({ ...f, vendor_number: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                Finance report region code (ZZ = consolidated FINANCIAL file)
                <input
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
                  value={form.finance_region_code}
                  onChange={(e) => setForm((f) => ({ ...f, finance_region_code: e.target.value }))}
                />
                <span className="mt-1 block text-xs text-gray-500">
                  ZZ downloads All Countries as one FINANCIAL file. Sync also pulls FINANCE_DETAIL with region Z1.
                </span>
              </label>
              <label className="text-sm">
                Connect API issuer ID (optional if same as IAP key)
                <input
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
                  value={form.connect_issuer_id}
                  onChange={(e) => setForm((f) => ({ ...f, connect_issuer_id: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                Connect API key ID
                <input
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
                  value={form.connect_key_id}
                  onChange={(e) => setForm((f) => ({ ...f, connect_key_id: e.target.value }))}
                />
              </label>
              <label className="text-sm sm:col-span-2">
                Connect API private key (Finance reports)
                <textarea
                  className="mt-1 min-h-[84px] w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
                  value={form.connect_private_key}
                  placeholder={d.connect_private_key ? "Set (hidden)" : "Leave blank to reuse the IAP key"}
                  onChange={(e) => setForm((f) => ({ ...f, connect_private_key: e.target.value }))}
                />
              </label>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                className={adminToolbarButtonClass(save.isPending)}
                disabled={save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? "Saving…" : "Save credentials"}
              </button>
              <button
                type="button"
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </AdminPanel>
    </div>
  );
}
