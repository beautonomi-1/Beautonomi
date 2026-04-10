import { Link, useSearchParams } from "react-router-dom";
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminTabButtonClass } from "@/lib/adminUi";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminDataList } from "@/components/admin/AdminDataList";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { adminSpaTo } from "@/lib/adminSpaPath";

type ProviderRow = {
  id: string;
  business_name?: string;
  status?: string;
  verification_status?: string;
  city?: string;
  country?: string;
  owner_email?: string;
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  pending: "bg-amber-100 text-amber-800",
  pending_approval: "bg-amber-100 text-amber-800",
  suspended: "bg-red-100 text-red-800",
  inactive: "bg-gray-100 text-gray-600",
};

export function ProvidersListPage() {
  const qc = useQueryClient();
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PROVIDERS_OPERATIONS,
    "Providers & operations access is required."
  );
  const [sp, setSp] = useSearchParams();
  const status = sp.get("status") || "all";
  const qk = useMemo(() => adminQueryKeys.providers.list(`status=${status}`), [status]);

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = new URLSearchParams();
      if (status !== "all") p.set("status", status);
      const qs = p.toString();
      return adminApi.getJson<ProviderRow[]>(`/api/admin/providers${qs ? `?${qs}` : ""}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const rows = q.data ?? [];

  const changeStatus = useMutation({
    mutationFn: ({ id, newStatus }: { id: string; newStatus: string }) =>
      adminApi.patchJson(`/api/admin/providers/${id}/status`, { status: newStatus }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.navCounts() });
    },
  });

  function setStatus(next: string) {
    const n = new URLSearchParams(sp);
    if (next === "all") n.delete("status");
    else n.set("status", next);
    setSp(n, { replace: true });
  }

  const columns = useMemo(
    () => [
      {
        id: "business",
        header: "Business",
        cell: (p: ProviderRow) => (
          <Link
            className="font-medium text-gray-900 underline decoration-gray-400 underline-offset-2 hover:decoration-gray-900"
            to={adminSpaTo(`/admin/providers/${encodeURIComponent(p.id)}`)}
          >
            {p.business_name ?? p.id}
          </Link>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: (p: ProviderRow) => {
          const s = p.status ?? "—";
          const cls = STATUS_BADGE[s] ?? "bg-gray-100 text-gray-600";
          return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{s}</span>;
        },
      },
      { id: "verification", header: "Verification", cell: (p: ProviderRow) => p.verification_status ?? "—" },
      {
        id: "location",
        header: "Location",
        cell: (p: ProviderRow) => (
          <span className="text-gray-600">
            {p.city ?? "—"}, {p.country ?? "—"}
          </span>
        ),
      },
      { id: "owner", header: "Owner email", cell: (p: ProviderRow) => <span className="text-xs text-gray-600">{p.owner_email ?? "—"}</span> },
      {
        id: "actions",
        header: "Actions",
        cell: (p: ProviderRow) => {
          const s = p.status;
          return (
            <div className="flex gap-1">
              {(s === "pending" || s === "pending_approval") && (
                <button
                  type="button"
                  className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50"
                  disabled={changeStatus.isPending}
                  onClick={() => {
                    if (confirm(`Approve ${p.business_name ?? "this provider"}?`))
                      changeStatus.mutate({ id: p.id, newStatus: "active" });
                  }}
                >
                  Approve
                </button>
              )}
              {s === "active" && (
                <button
                  type="button"
                  className="rounded bg-amber-600 px-2 py-1 text-xs text-white hover:bg-amber-700 disabled:opacity-50"
                  disabled={changeStatus.isPending}
                  onClick={() => {
                    if (confirm(`Suspend ${p.business_name ?? "this provider"}?`))
                      changeStatus.mutate({ id: p.id, newStatus: "suspended" });
                  }}
                >
                  Suspend
                </button>
              )}
              {s === "suspended" && (
                <button
                  type="button"
                  className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50"
                  disabled={changeStatus.isPending}
                  onClick={() => {
                    if (confirm(`Reactivate ${p.business_name ?? "this provider"}?`))
                      changeStatus.mutate({ id: p.id, newStatus: "active" });
                  }}
                >
                  Reactivate
                </button>
              )}
            </div>
          );
        },
      },
    ],
    [changeStatus]
  );

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Providers" />
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

  const tabs = ["all", "active", "pending_approval", "pending", "suspended"] as const;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Providers" description="GET /api/admin/providers" />
      <AdminPanel>
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button key={t} type="button" className={adminTabButtonClass(status === t)} onClick={() => setStatus(t)}>
              {t}
            </button>
          ))}
        </div>
      </AdminPanel>
      <AdminDataList
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        empty={<EmptyState title="No providers" description="Try another status filter." />}
      />
    </div>
  );
}
