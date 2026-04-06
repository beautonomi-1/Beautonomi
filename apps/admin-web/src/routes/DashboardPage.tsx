import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_OVERVIEW } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminQueryBlock } from "@/components/admin/AdminQueryBlock";

interface DashboardStats {
  total_users: number;
  total_providers: number;
  total_bookings: number;
  total_revenue: number;
  pending_approvals: number;
  active_bookings_today: number;
  revenue_today: number;
  revenue_this_month: number;
}

export function DashboardPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_OVERVIEW,
    "Overview section access is required for the dashboard."
  );

  const q = useQuery({
    queryKey: adminQueryKeys.dashboard(),
    queryFn: () => adminApi.getJson<DashboardStats>("/api/admin/dashboard", { timeoutMs: 45_000 }),
    enabled: allowed,
  });

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Dashboard" description="Key metrics for your tenant scope" />
      <AdminQueryBlock query={q}>
        {(s) => {
          if (!s) return <EmptyState title="No data" />;
          const cards = [
            { label: "Users", value: s.total_users },
            { label: "Providers", value: s.total_providers },
            { label: "Bookings", value: s.total_bookings },
            { label: "Revenue", value: s.total_revenue },
            { label: "Pending approvals", value: s.pending_approvals },
            { label: "Bookings today", value: s.active_bookings_today },
          ];
          return (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((c) => (
                <AdminPanel key={c.label}>
                  <div className="text-sm text-gray-500">{c.label}</div>
                  <div className="mt-1 text-2xl font-semibold text-gray-900">{c.value}</div>
                </AdminPanel>
              ))}
            </div>
          );
        }}
      </AdminQueryBlock>
    </div>
  );
}
