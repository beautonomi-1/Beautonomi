import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_USERS_TRUST } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { adminSpaTo } from "@/lib/adminSpaPath";

type NavCounts = Record<string, number>;

const QUEUE_LINKS = [
  {
    title: "User reports",
    description: "Reports against users (safety hub, customer ↔ provider).",
    href: "/admin/user-reports?status=pending",
    countKey: "/admin/user-reports",
  },
  {
    title: "Content reports",
    description: "UGC reports on posts, comments, messages, and reviews.",
    href: "/admin/content-reports?status=pending",
    countKey: "/admin/content-reports",
  },
  {
    title: "SLA overdue (content)",
    description: "Pending content reports older than 24 hours.",
    href: "/admin/content-reports?sla_overdue=1",
    countKey: "/admin/content-reports/sla-overdue",
    urgent: true,
  },
  {
    title: "Blocked users",
    description: "User block relationships in the current tenant.",
    href: "/admin/user-blocks",
    countKey: "/admin/user-blocks",
  },
  {
    title: "Fraud cases",
    description: "Investigate flagged payment and account fraud signals.",
    href: "/admin/fraud-cases",
  },
  {
    title: "Reviews & ratings",
    description: "Moderate public reviews and provider responses.",
    href: "/admin/reviews",
  },
] as const;

export function TrustSafetyOpsPage() {
  useAdminDocumentTitle("Trust & Safety Ops");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_USERS_TRUST,
    "Users & trust access is required.",
  );

  const countsQ = useQuery({
    queryKey: adminQueryKeys.navCounts(),
    queryFn: () => adminApi.getJson<NavCounts>("/api/admin/nav-counts", { timeoutMs: 30_000 }),
    enabled: allowed,
    refetchInterval: 60_000,
  });

  if (denied) return denied;
  if (countsQ.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Trust & Safety Ops" />
        <AdminPanel>
          <AdminPageSkeleton rows={4} />
        </AdminPanel>
      </div>
    );
  }
  if (countsQ.error) {
    if (isAdminApiAuthFailure(countsQ.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={countsQ.error.message} onRetry={() => void countsQ.refetch()} />;
  }

  const counts = countsQ.data ?? {};
  const pendingUserReports = counts["/admin/user-reports"] ?? 0;
  const pendingContentReports = counts["/admin/content-reports"] ?? 0;
  const slaOverdue = counts["/admin/content-reports/sla-overdue"] ?? 0;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Trust & Safety Ops"
        description="Operational hub for moderation queues, SLA pressure, and enforcement."
      />

      {(pendingUserReports > 0 || pendingContentReports > 0 || slaOverdue > 0) && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-800">Pending user reports</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-amber-900">{pendingUserReports}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-800">Pending content reports</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-amber-900">{pendingContentReports}</p>
          </div>
          <div
            className={`rounded-xl border p-4 ${
              slaOverdue > 0 ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50"
            }`}
          >
            <p
              className={`text-xs font-medium uppercase tracking-wide ${
                slaOverdue > 0 ? "text-red-800" : "text-gray-600"
              }`}
            >
              Content SLA overdue (&gt;24h)
            </p>
            <p
              className={`mt-1 text-3xl font-semibold tabular-nums ${
                slaOverdue > 0 ? "text-red-900" : "text-gray-900"
              }`}
            >
              {slaOverdue}
            </p>
          </div>
        </div>
      )}

      <AdminPanel>
        <h2 className="text-lg font-semibold text-gray-900">Queues</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {QUEUE_LINKS.map((item) => {
            const count = "countKey" in item ? counts[item.countKey] ?? 0 : 0;
            const isUrgent = "urgent" in item && item.urgent && count > 0;
            return (
              <li key={item.href}>
                <Link
                  to={adminSpaTo(item.href)}
                  className={`block rounded-xl border p-4 transition hover:bg-gray-50 ${
                    isUrgent ? "border-red-200 bg-red-50/40" : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900">{item.title}</p>
                      <p className="mt-1 text-sm text-gray-600">{item.description}</p>
                    </div>
                    {"countKey" in item ? (
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
                          isUrgent ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {count}
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </AdminPanel>

      <AdminPanel>
        <h2 className="text-lg font-semibold text-gray-900">Runbook</h2>
        <p className="mt-2 text-sm text-gray-600">
          Content reports older than 24 hours breach the App Store moderation SLA. Resolve or dismiss with
          takedown + optional author suspension when policy violations are confirmed.
        </p>
        <p className="mt-2 text-sm text-gray-500">
          See <span className="font-mono text-xs">docs/TRUST_SAFETY_RUNBOOK.md</span> in the repo for block
          enforcement, age-gating, and auto-hide thresholds.
        </p>
      </AdminPanel>
    </div>
  );
}
