import { useMemo, useCallback } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ADMIN_SECTION_PROVIDERS_OPERATIONS,
  ADMIN_SECTION_PROVIDER_OPS,
  ADMIN_SECTION_USERS_TRUST,
  ADMIN_SECTION_COMMERCIAL,
  ADMIN_SECTION_FINANCE,
} from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { adminToast } from "@/lib/adminToast";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { useAdminBreadcrumbLeaf } from "@/providers/AdminBreadcrumbProvider";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminTabButtonClass } from "@/lib/adminUi";

import { ProviderOverviewTab } from "./tabs/ProviderOverviewTab";
import { ProviderCommercialTab } from "./tabs/ProviderCommercialTab";
import { ProviderFinanceTab } from "./tabs/ProviderFinanceTab";
import { ProviderBookingsTab } from "./tabs/ProviderBookingsTab";
import { ProviderTeamServicesTab } from "./tabs/ProviderTeamServicesTab";
import { ProviderGrowthTab } from "./tabs/ProviderGrowthTab";
import { type ProviderDetail, str } from "./tabs/types";

// ── Tab config ────────────────────────────────────────────────────────────────

const TABS = [
  { key: "overview",    label: "Overview" },
  { key: "commercial",  label: "Commercial",     section: ADMIN_SECTION_COMMERCIAL },
  { key: "finance",     label: "Finance",        section: ADMIN_SECTION_FINANCE },
  { key: "bookings",    label: "Bookings" },
  { key: "team",        label: "Team & Services" },
  { key: "growth",      label: "Growth" },
] as const;

type TabKey = (typeof TABS)[number]["key"];
const TAB_KEYS = TABS.map((t) => t.key) as TabKey[];

function normalizeTab(raw: string | null): TabKey {
  if (raw && (TAB_KEYS as string[]).includes(raw)) return raw as TabKey;
  return "overview";
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProviderDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const tab = useMemo(() => normalizeTab(sp.get("tab")), [sp]);

  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PROVIDERS_OPERATIONS,
    "Providers & operations access is required.",
  );
  const { canAccess, bootstrap } = useAdminSession();
  const canOpenLifecycle = canAccess(ADMIN_SECTION_PROVIDER_OPS);
  const canOpenVerifications = canAccess(ADMIN_SECTION_USERS_TRUST);
  const hasCommercialAccess = canAccess(ADMIN_SECTION_COMMERCIAL);
  const hasFinanceAccess = canAccess(ADMIN_SECTION_FINANCE);

  const setTab = useCallback(
    (next: TabKey) => {
      const n = new URLSearchParams(sp);
      n.set("tab", next);
      setSp(n, { replace: true });
    },
    [sp, setSp],
  );

  const q = useQuery({
    queryKey: adminQueryKeys.providers.detail(id),
    queryFn: () =>
      adminApi.getJson<ProviderDetail>(`/api/admin/providers/${encodeURIComponent(id)}`, {
        timeoutMs: 60_000,
      }),
    enabled: allowed && !!id,
  });

  useAdminBreadcrumbLeaf(
    typeof q.data?.business_name === "string" ? q.data.business_name : undefined,
  );

  const providerCanonicalId = q.data?.id != null ? str(q.data.id) : "";
  const row = q.data;
  const business = row ? (str(row.business_name) || str(row.slug) || id) : id;

  // ── Global mutations (header actions) ────────────────────────────────────────

  const changeStatus = useMutation({
    mutationFn: (newStatus: string) =>
      adminApi.patchJson(`/api/admin/providers/${encodeURIComponent(id)}/status`, { status: newStatus }),
    onSuccess: (_data, newStatus) => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providers.detail(id) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providers.all() });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.navCounts() });
      adminToast.success(`Provider status updated to ${newStatus}`);
    },
    onError: (e: Error) => adminToast.error(`Failed to update status: ${e.message}`),
  });

  const verifyProvider = useMutation({
    mutationFn: (verified: boolean) =>
      adminApi.patchJson(
        `/api/admin/providers/${encodeURIComponent(providerCanonicalId || id)}/verify`,
        { verified },
      ),
    onSuccess: async (_data, verified) => {
      await qc.invalidateQueries({ queryKey: adminQueryKeys.providers.detail(id) });
      await qc.invalidateQueries({ queryKey: adminQueryKeys.providers.all() });
      await qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
      await qc.invalidateQueries({ queryKey: adminQueryKeys.navCounts() });
      adminToast.success(verified ? "Provider verified" : "Verification removed");
    },
    onError: (e: Error) => adminToast.error(`Failed to update verification: ${e.message}`),
  });

  // ── Guards ────────────────────────────────────────────────────────────────────

  if (denied) return denied;
  if (!id) return <AdminRetryBlock message="Missing provider id" onRetry={() => {}} />;

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Provider" />
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

  if (!row) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Provider" />
        <AdminPanel>
          <p className="text-sm text-gray-600">Provider not found.</p>
        </AdminPanel>
      </div>
    );
  }

  // ── Visible tabs (filter RBAC-gated ones) ────────────────────────────────────

  const visibleTabs = TABS.filter((t) => {
    if (t.key === "commercial") return hasCommercialAccess;
    if (t.key === "finance") return true; // Finance tab shown to all, subscriptions use enabled flag
    return true;
  });

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <AdminPageHeader
        title={business}
        description={
          <span className="flex items-center gap-2">
            <span className="font-mono text-xs text-gray-400">{str(row.id) || id}</span>
            {str(row.status) ? (
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                  row.status === "active"
                    ? "bg-green-100 text-green-800"
                    : row.status === "suspended"
                      ? "bg-red-100 text-red-800"
                      : "bg-amber-100 text-amber-800"
                }`}
              >
                {str(row.status)}
              </span>
            ) : null}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {(str(row.status) === "pending" || str(row.status) === "pending_approval") && (
              <button
                type="button"
                className="rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                disabled={changeStatus.isPending}
                onClick={() => { if (confirm(`Approve ${business}?`)) changeStatus.mutate("active"); }}
              >
                Approve
              </button>
            )}
            {str(row.status) === "active" && (
              <button
                type="button"
                className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                disabled={changeStatus.isPending}
                onClick={() => { if (confirm(`Suspend ${business}?`)) changeStatus.mutate("suspended"); }}
              >
                Suspend
              </button>
            )}
            {str(row.status) === "suspended" && (
              <button
                type="button"
                className="rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                disabled={changeStatus.isPending}
                onClick={() => { if (confirm(`Reactivate ${business}?`)) changeStatus.mutate("active"); }}
              >
                Reactivate
              </button>
            )}
            {str(row.status) === "active" && row.is_verified !== true ? (
              <button
                type="button"
                className="rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                disabled={verifyProvider.isPending}
                onClick={() => verifyProvider.mutate(true)}
              >
                Verify
              </button>
            ) : null}
            {row.is_verified === true ? (
              <button
                type="button"
                className="rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                disabled={verifyProvider.isPending}
                onClick={() => { if (confirm(`Remove verified badge for ${business}?`)) verifyProvider.mutate(false); }}
              >
                Unverify
              </button>
            ) : null}
            <Link
              to={adminSpaTo("/admin/providers")}
              className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 shadow-sm ring-1 ring-gray-950/[0.04] hover:bg-gray-50"
            >
              ← Providers
            </Link>
          </div>
        }
      />

      <AdminMutationAlert
        errors={[
          changeStatus.error instanceof Error ? changeStatus.error : null,
          verifyProvider.error instanceof Error ? verifyProvider.error : null,
        ]}
      />

      {/* ── Tab row ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-px">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={adminTabButtonClass(tab === t.key)}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ─────────────────────────────────────────────── */}
      {tab === "overview" && (
        <ProviderOverviewTab
          id={id}
          providerCanonicalId={providerCanonicalId}
          row={row}
          canOpenLifecycle={canOpenLifecycle}
          canOpenVerifications={canOpenVerifications}
        />
      )}

      {tab === "commercial" && hasCommercialAccess && (
        <ProviderCommercialTab
          id={id}
          providerCanonicalId={providerCanonicalId}
          row={row}
          hasCommercialAccess={hasCommercialAccess}
        />
      )}

      {tab === "finance" && (
        <ProviderFinanceTab
          id={id}
          providerCanonicalId={providerCanonicalId}
          marketingUsePlatformCredentials={
            (row.marketing_use_platform_credentials as boolean | null | undefined) ?? null
          }
          hasFinanceAccess={hasFinanceAccess}
        />
      )}

      {tab === "bookings" && providerCanonicalId && (
        <ProviderBookingsTab providerCanonicalId={providerCanonicalId} />
      )}

      {tab === "team" && (
        <ProviderTeamServicesTab
          staff={row.staff}
          offerings={row.offerings}
        />
      )}

      {tab === "growth" && providerCanonicalId && (
        <ProviderGrowthTab providerCanonicalId={providerCanonicalId} />
      )}
    </div>
  );
}
