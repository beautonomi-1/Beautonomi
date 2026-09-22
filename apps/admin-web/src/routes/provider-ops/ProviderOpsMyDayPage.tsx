import { Link } from "react-router";
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

interface MyDayPayload {
  desk: string | null;
  cases: Array<{
    id: string;
    current_desk: string;
    status: string;
    lead_id: string | null;
    provider_id: string | null;
    provider_leads?: { business_name: string | null; commercial_stage: string | null } | null;
    providers?: { business_name: string | null; status: string | null } | null;
  }>;
  pending_handoffs: Array<{ id: string; from_desk: string; to_desk: string; note: string | null }>;
  overdue_tasks: Array<{ id: string; title: string; due_at: string; lead_id: string | null }>;
  quota_attainment: Record<string, { target: number; actual: number }>;
  period_start: string;
}

export function ProviderOpsMyDayPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_PROVIDER_OPS, "Provider Ops access is required.");
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: adminQueryKeys.providerOps.myDay(),
    queryFn: () => adminApi.getJson<MyDayPayload>("/api/admin/provider-ops/my-day"),
    enabled: allowed,
    refetchInterval: 60_000,
  });

  const acceptHandoff = useMutation({
    mutationFn: (handoffId: string) =>
      adminApi.postJson(`/api/admin/provider-ops/handoffs/${handoffId}/accept`, {}),
    onSuccess: () => {
      adminToast.success("Handoff accepted");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.myDay() });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
    },
    onError: (e: Error) => adminToast.error(e.message || "Could not accept handoff"),
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="My Day" />
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

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="My Day"
        description={
          data.desk
            ? `Your ${data.desk} desk — cases, handoffs, and tasks`
            : "All desks — manager view"
        }
      />

      {Object.keys(data.quota_attainment).length > 0 && (
        <AdminPanel title="Monthly targets">
          <ul className="divide-y divide-gray-100">
            {Object.entries(data.quota_attainment).map(([metric, { target, actual }]) => (
              <li key={metric} className="flex justify-between py-2 text-sm">
                <span className="text-gray-600">{metric.replace(/_/g, " ")}</span>
                <span className="font-medium text-gray-900">
                  {actual} / {target}
                </span>
              </li>
            ))}
          </ul>
        </AdminPanel>
      )}

      {data.pending_handoffs.length > 0 && (
        <AdminPanel title="Pending handoffs">
          <ul className="space-y-2">
            {data.pending_handoffs.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 text-sm"
              >
                <span>
                  {h.from_desk} → {h.to_desk}
                  {h.note ? ` — ${h.note}` : ""}
                </span>
                <button
                  type="button"
                  className="rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                  disabled={acceptHandoff.isPending}
                  onClick={() => acceptHandoff.mutate(h.id)}
                >
                  Accept
                </button>
              </li>
            ))}
          </ul>
        </AdminPanel>
      )}

      {data.overdue_tasks.length > 0 && (
        <AdminPanel title="Overdue tasks">
          <ul className="divide-y divide-gray-100">
            {data.overdue_tasks.map((t) => (
              <li key={t.id} className="py-2 text-sm">
                {t.lead_id ? (
                  <Link
                    to={adminSpaTo(`/admin/provider-ops/leads/${t.lead_id}`)}
                    className="font-medium text-gray-900 hover:underline"
                  >
                    {t.title}
                  </Link>
                ) : (
                  <span className="font-medium text-gray-900">{t.title}</span>
                )}
                <span className="ml-2 text-gray-500">Due {new Date(t.due_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </AdminPanel>
      )}

      <AdminPanel title="My cases">
        {data.cases.length === 0 ? (
          <p className="text-sm text-gray-500">No open cases on your desk.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data.cases.map((c) => {
              const label =
                c.provider_leads?.business_name ||
                c.providers?.business_name ||
                c.lead_id ||
                c.provider_id ||
                c.id;
              const href = c.lead_id
                ? adminSpaTo(`/admin/provider-ops/leads/${c.lead_id}`)
                : c.provider_id
                  ? adminSpaTo(`/admin/provider-ops/providers/${c.provider_id}`)
                  : null;
              return (
                <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    {href ? (
                      <Link to={href} className="font-medium text-gray-900 hover:underline">
                        {label}
                      </Link>
                    ) : (
                      <span className="font-medium text-gray-900">{label}</span>
                    )}
                    <span className="ml-2 text-gray-500">
                      {c.current_desk} · {c.status}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </AdminPanel>
    </div>
  );
}
