import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDER_OPS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToast } from "@/lib/adminToast";

const TABS = [
  { id: "active", label: "Active" },
  { id: "no_booking", label: "No first booking" },
  { id: "at_risk", label: "At risk" },
  { id: "churned", label: "Churned" },
] as const;

type RetentionTab = (typeof TABS)[number]["id"];

interface RetentionPayload {
  tab: string;
  cases: Array<{
    id: string;
    provider_id: string | null;
    status: string;
    first_booking_at: string | null;
    at_risk_saved_at?: string | null;
    providers?: { id: string; business_name: string | null; status: string | null } | null;
    booking_trend?: { previous30d: number; recent30d: number; concerning: boolean };
  }>;
}

function parseTab(raw: string | null): RetentionTab {
  const found = TABS.find((t) => t.id === raw);
  return found?.id ?? "active";
}

export function ProviderOpsRetentionPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_PROVIDER_OPS, "Provider Ops access is required.");
  const [sp, setSp] = useSearchParams();
  const tab = parseTab(sp.get("tab"));
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: adminQueryKeys.providerOps.retention(tab),
    queryFn: () =>
      adminApi.getJson<RetentionPayload>(`/api/admin/provider-ops/retention?tab=${tab}`),
    enabled: allowed,
  });

  const recordSave = useMutation({
    mutationFn: (caseId: string) =>
      adminApi.postJson<{ at_risk_saved_at: string }>(
        `/api/admin/provider-ops/cases/${caseId}/record-at-risk-save`,
        {},
      ),
    onSuccess: () => {
      adminToast.success("At-risk save recorded");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
    },
    onError: (e: Error) => adminToast.error(e.message || "Could not record save"),
  });

  const setTab = (next: RetentionTab) => {
    const n = new URLSearchParams(sp);
    if (next === "active") n.delete("tab");
    else n.set("tab", next);
    setSp(n, { replace: true });
  };

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Retention queue" />
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

  const data = q.data;
  if (!data) return <AdminRetryBlock message="No data" onRetry={() => void q.refetch()} />;

  const tabMeta = TABS.find((t) => t.id === tab);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Retention queue"
        description={
          tab === "active"
            ? "Open and activated providers on the retention desk"
            : tab === "no_booking"
              ? "Activated but no first marketplace booking yet"
              : tab === "at_risk"
                ? "Booking volume down ≥50% vs prior 30 days (min 5 prior bookings)"
                : "Churned subscription cases"
        }
      />

      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === t.id
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <AdminPanel title={tabMeta?.label ?? "Cases"}>
        {data.cases.length === 0 ? (
          <p className="text-sm text-gray-500">No cases in this queue.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data.cases.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  {c.provider_id ? (
                    <Link
                      to={adminSpaTo(`/admin/provider-ops/providers/${c.provider_id}`)}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {c.providers?.business_name || c.provider_id}
                    </Link>
                  ) : (
                    <span>{c.id}</span>
                  )}
                  <span className="ml-2 text-gray-500">
                    {c.status}
                    {tab === "no_booking" || tab === "active"
                      ? c.first_booking_at
                        ? " · first booking recorded"
                        : " · no first booking yet"
                      : null}
                    {tab === "at_risk" && c.booking_trend ? (
                      <>
                        {" "}
                        · {c.booking_trend.previous30d} → {c.booking_trend.recent30d} bookings (30d)
                      </>
                    ) : null}
                  </span>
                </div>
                {tab === "at_risk" && !c.at_risk_saved_at ? (
                  <button
                    type="button"
                    className="rounded-md bg-emerald-700 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                    disabled={recordSave.isPending}
                    onClick={() => recordSave.mutate(c.id)}
                  >
                    Record save
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>
    </div>
  );
}
