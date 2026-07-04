import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_COMMERCIAL } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";

type ReportingData = {
  providers_with_terminals: number;
  providers_without_terminals: number;
  providers_planning: number;
  providers_interested: number;
  providers_maybe_interested: number;
  total_captured: number;
  vendor_breakdown: Record<string, number>;
  orders_by_status: Record<string, number>;
  revenue_by_model: Record<string, number>;
  total_order_revenue: number;
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{typeof value === "number" ? value.toLocaleString() : value}</p>
    </div>
  );
}

export function TerminalReportingPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_COMMERCIAL, "Commercial section access required");
  useAdminDocumentTitle("Terminal Reporting");

  const { data, isLoading, isError, refetch } = useQuery<ReportingData>({
    queryKey: adminQueryKeys.commercialTerminalReporting,
    queryFn: () => adminApi.getJson("/api/admin/commercial/terminal-reporting"),
    enabled: allowed,
  });

  if (denied) return denied;
  if (isLoading) return <AdminPageSkeleton />;
  if (isError) return <AdminRetryBlock message="Failed to load terminal reporting" onRetry={() => refetch()} />;

  const d = data!;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Terminal Reporting"
        description="Revenue counts paid invoices only. Provider terminal profiles drive opportunity metrics."
      />

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total captured" value={d.total_captured} />
        <StatCard label="Have terminal" value={d.providers_with_terminals} />
        <StatCard label="No terminal" value={d.providers_without_terminals} />
        <StatCard label="Planning to get" value={d.providers_planning} />
        <StatCard label="Interested in platform" value={d.providers_interested} />
      </div>

      {/* Vendor breakdown */}
      {Object.keys(d.vendor_breakdown).length > 0 && (
        <AdminPanel>
          <div className="p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Terminal provider breakdown</h3>
            <div className="space-y-2">
              {Object.entries(d.vendor_breakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([vendor, count]) => (
                  <div key={vendor} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-slate-700">{vendor.replace(/_/g, " ")}</span>
                    <span className="font-medium text-slate-900">{count.toLocaleString()}</span>
                  </div>
                ))}
            </div>
          </div>
        </AdminPanel>
      )}

      {/* Order revenue */}
      <AdminPanel>
        <div className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Orders by status</h3>
          {Object.keys(d.orders_by_status).length === 0 ? (
            <p className="text-sm text-gray-500">No terminal orders recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(d.orders_by_status)
                .sort(([, a], [, b]) => b - a)
                .map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-slate-700">{status.replace(/_/g, " ")}</span>
                    <span className="font-medium text-slate-900">{count.toLocaleString()}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </AdminPanel>

      {Object.keys(d.revenue_by_model).length > 0 && (
        <AdminPanel>
          <div className="p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Revenue by commercial model</h3>
            <div className="space-y-2">
              {Object.entries(d.revenue_by_model)
                .sort(([, a], [, b]) => b - a)
                .map(([model, revenue]) => (
                  <div key={model} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-slate-700">{model.replace(/_/g, " ")}</span>
                    <span className="font-medium text-slate-900">ZAR {revenue.toLocaleString()}</span>
                  </div>
                ))}
            </div>
            <div className="mt-3 border-t border-gray-100 pt-3 flex items-center justify-between text-sm font-semibold">
              <span>Total</span>
              <span>ZAR {d.total_order_revenue.toLocaleString()}</span>
            </div>
          </div>
        </AdminPanel>
      )}
    </div>
  );
}
