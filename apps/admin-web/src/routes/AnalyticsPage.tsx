import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminQueryBlock } from "@/components/admin/AdminQueryBlock";

export function AnalyticsPage() {
  const { allowed, denied } = useSuperadminPage("Analytics matches legacy admin: superadmin only.");
  const [period, setPeriod] = useState("30d");

  const q = useQuery({
    queryKey: adminQueryKeys.analytics(period),
    queryFn: () =>
      adminApi.getJson<Record<string, unknown>>(`/api/admin/analytics?period=${encodeURIComponent(period)}`),
    enabled: allowed,
  });

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Analytics"
        description="Period-scoped metrics"
        actions={
          <select
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
            <option value="90d">90 days</option>
          </select>
        }
      />
      <AdminQueryBlock query={q}>
        {(data) => (
          <AdminPanel>
            <p className="text-sm text-gray-600">
              Detailed charts will match legacy parity in a follow-up. Raw payload keys:{" "}
              <code className="text-xs">{data ? Object.keys(data).join(", ") : "—"}</code>
            </p>
          </AdminPanel>
        )}
      </AdminQueryBlock>
    </div>
  );
}
