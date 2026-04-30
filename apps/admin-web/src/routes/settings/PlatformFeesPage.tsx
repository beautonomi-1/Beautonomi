import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { adminToast } from "@/lib/adminToast";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";

interface PlatformFeesData {
  platform_service_fee_type: "percentage" | "fixed";
  platform_service_fee_percentage: number;
  platform_service_fee_fixed: number;
  show_service_fee_to_customer: boolean;
  cash_enabled_on_platform: boolean;
  commission_enabled?: boolean;
  platform_commission_percentage?: number;
}

function Toggle({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
        checked ? "bg-indigo-600" : "bg-gray-200"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function PlatformFeesPage() {
  useAdminDocumentTitle("Platform Fees");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PLATFORM_CONFIG,
    "Platform configuration access is required for platform fees."
  );
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: adminQueryKeys.platformFees(),
    queryFn: () => adminApi.getJson<PlatformFeesData>("/api/admin/platform-fees", { timeoutMs: 30_000 }),
    enabled: allowed,
  });

  const [feeType, setFeeType] = useState<"percentage" | "fixed">("percentage");
  const [feePercentage, setFeePercentage] = useState("5");
  const [feeFixed, setFeeFixed] = useState("0");
  const [showToCustomer, setShowToCustomer] = useState(true);
  const [cashEnabled, setCashEnabled] = useState(false);
  const [commissionEnabled, setCommissionEnabled] = useState(false);
  const [commissionPercentage, setCommissionPercentage] = useState("0");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (q.data) {
      setFeeType(q.data.platform_service_fee_type ?? "fixed");
      setFeePercentage(String(q.data.platform_service_fee_percentage ?? 0));
      setFeeFixed(String(q.data.platform_service_fee_fixed ?? 0));
      setShowToCustomer(q.data.show_service_fee_to_customer !== false);
      setCashEnabled(q.data.cash_enabled_on_platform === true);
      setCommissionEnabled(q.data.commission_enabled === true);
      setCommissionPercentage(String(q.data.platform_commission_percentage ?? 0));
    }
  }, [q.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      adminApi.patchJson<PlatformFeesData>("/api/admin/platform-fees", {
        platform_service_fee_type: feeType,
        platform_service_fee_percentage: parseFloat(feePercentage) || 0,
        platform_service_fee_fixed: parseFloat(feeFixed) || 0,
        show_service_fee_to_customer: showToCustomer,
        cash_enabled_on_platform: cashEnabled,
        commission_enabled: commissionEnabled,
        platform_commission_percentage: parseFloat(commissionPercentage) || 0,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.platformFees() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      adminToast.success("Platform fees saved");
    },
    onError: (e: Error) => adminToast.error(`Failed to save fees: ${e.message}`),
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Platform Fees" />
        <AdminPanel>
          <AdminPageSkeleton rows={6} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Platform Fees" description="GET /api/admin/platform-fees" />
        <AdminPanel>
          <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />
        </AdminPanel>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Platform Fees"
        description="Configure customer-paid platform fees and commission rates applied to bookings."
      />

      {/* ── Customer-Paid Platform Fee ───────────────────────────────────────── */}
      <AdminPanel>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Customer-Paid Platform Fee</h2>
          <button
            type="button"
            className={adminToolbarButtonClass(q.isFetching)}
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            Refresh
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-5">
          A Platform Fee added to the customer's booking total and retained by Beautonomi. It is separate from provider earnings and platform commission.
        </p>

        <div className="space-y-6 max-w-xl">
          {/* Fee type */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Fee Type</label>
            <div className="flex gap-3">
              {(["percentage", "fixed"] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value={t}
                    checked={feeType === t}
                    onChange={() => setFeeType(t)}
                    className="accent-indigo-600"
                  />
                  <span className="text-sm">{t === "percentage" ? "Percentage (%)" : "Fixed amount"}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Fee value */}
          {feeType === "percentage" ? (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Platform Fee Percentage
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={feePercentage}
                  onChange={(e) => setFeePercentage(e.target.value)}
                  className="w-24 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
              <p className="text-xs text-gray-400">Applied to the subtotal of each booking.</p>
            </div>
          ) : (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Fixed Platform Fee Amount
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={feeFixed}
                onChange={(e) => setFeeFixed(e.target.value)}
                className="w-32 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-400">Flat amount added to every booking.</p>
            </div>
          )}

          {/* Toggle: show to customer */}
          <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
            <div>
              <p className="text-sm font-medium text-gray-700">Show Platform Fee to customer</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Displays the Platform Fee as an itemised line on the customer checkout summary.
              </p>
            </div>
            <Toggle checked={showToCustomer} onChange={setShowToCustomer} id="show-fee-toggle" />
          </div>

          {/* Toggle: cash enabled */}
          <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
            <div>
              <p className="text-sm font-medium text-gray-700">Cash payments enabled</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Allows providers and customers to use cash as a payment option at checkout.
              </p>
            </div>
            <Toggle checked={cashEnabled} onChange={setCashEnabled} id="cash-toggle" />
          </div>
        </div>
      </AdminPanel>

      {/* ── Platform Commission ──────────────────────────────────────────────── */}
      <AdminPanel>
        <h2 className="text-sm font-semibold text-gray-800 mb-1">Platform Commission</h2>
        <p className="text-xs text-gray-500 mb-5">
          The percentage of each booking's service value retained by the platform as commission. The remainder goes to the provider as earnings. Applied to all payment paths (card, wallet, gift card, cash).
        </p>

        <div className="space-y-5 max-w-xl">
          {/* Toggle: commission enabled */}
          <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
            <div>
              <p className="text-sm font-medium text-gray-700">Commission enabled</p>
              <p className="text-xs text-gray-400 mt-0.5">
                When off, 100% of booking value flows to the provider (no platform take).
              </p>
            </div>
            <Toggle checked={commissionEnabled} onChange={setCommissionEnabled} id="commission-toggle" />
          </div>

          {/* Commission rate */}
          {commissionEnabled && (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Commission Percentage
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={commissionPercentage}
                  onChange={(e) => setCommissionPercentage(e.target.value)}
                  className="w-24 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
              <p className="text-xs text-gray-400">
                Platform retains this percentage; provider earns the rest. E.g. 15% commission → provider receives 85%.
              </p>
            </div>
          )}
        </div>
      </AdminPanel>

      {/* ── Save ─────────────────────────────────────────────────────────────── */}
      <AdminPanel>
        {saveMutation.error && (
          <p className="text-sm text-red-600 mb-3">{saveMutation.error.message}</p>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saveMutation.isPending ? "Saving…" : "Save changes"}
          </button>
          {saved && (
            <span className="text-sm text-green-600 font-medium">Saved!</span>
          )}
        </div>
      </AdminPanel>
    </div>
  );
}
