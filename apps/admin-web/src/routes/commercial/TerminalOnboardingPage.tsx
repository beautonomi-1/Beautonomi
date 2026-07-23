import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { cn } from "@/lib/cn";

type ApplicationRow = {
  id: string;
  application_no: string;
  status: string;
  trading_name?: string | null;
  legal_name?: string | null;
  submitted_at?: string | null;
  assigned_admin_id?: string | null;
  providers?: { business_name?: string; slug?: string } | null;
  terminal_orders?: Array<{ commercial_model?: string }> | { commercial_model?: string } | null;
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-800",
  in_review: "bg-indigo-100 text-indigo-800",
  info_required: "bg-amber-100 text-amber-800",
  sent_to_acquirer: "bg-purple-100 text-purple-800",
  awaiting_term_sheet: "bg-violet-100 text-violet-800",
  approved: "bg-green-100 text-green-800",
  declined: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-500",
};

function orderModel(row: ApplicationRow): string {
  const orders = row.terminal_orders;
  if (!orders) return "—";
  const first = Array.isArray(orders) ? orders[0] : orders;
  return first?.commercial_model?.replace(/_/g, " ") ?? "—";
}

export function TerminalOnboardingPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_COMMERCIAL, "Commercial section access required");
  useAdminDocumentTitle("Terminal onboarding");
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [...adminQueryKeys.commercialTerminalOnboarding, statusFilter],
    enabled: allowed,
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      return adminApi.getJson<{ applications: ApplicationRow[]; actionable_count: number }>(
        `/api/admin/terminal-merchant-applications?${params}`,
      );
    },
  });

  const applications = data?.applications ?? [];
  const actionable = data?.actionable_count ?? 0;

  const statusOptions = useMemo(
    () => [
      "",
      "submitted",
      "in_review",
      "info_required",
      "sent_to_acquirer",
      "awaiting_term_sheet",
      "approved",
      "declined",
    ],
    [],
  );

  if (!allowed) {
    return denied;
  }

  if (isLoading) return <AdminPageSkeleton />;
  if (isError) return <AdminRetryBlock onRetry={() => refetch()} message="Failed to load applications" />;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Terminal onboarding"
        description="Review merchant applications before terminals can be dispatched."
        actions={
          actionable > 0 ? (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
              {actionable} need action
            </span>
          ) : undefined
        }
      />

      <AdminPanel>
        <div className="mb-4 flex flex-wrap gap-2">
          {statusOptions.map((s) => (
            <button
              key={s || "all"}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-full px-3 py-1 text-sm",
                statusFilter === s ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700",
              )}
            >
              {s ? s.replace(/_/g, " ") : "All"}
            </button>
          ))}
        </div>

        {applications.length === 0 ? (
          <EmptyState title="No applications" description="Merchant applications will appear here." />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <AdminTh>Application</AdminTh>
              <AdminTh>Business</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Order type</AdminTh>
              <AdminTh>Submitted</AdminTh>
            </AdminTableHead>
            <AdminTableBody>
              {applications.map((row) => (
                <tr key={row.id} className="border-b border-gray-100">
                  <AdminTd>
                    <Link
                      to={adminSpaTo(`/admin/commercial/terminal-onboarding/${row.id}`)}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      {row.application_no}
                    </Link>
                  </AdminTd>
                  <AdminTd>{row.trading_name ?? row.legal_name ?? row.providers?.business_name ?? "—"}</AdminTd>
                  <AdminTd>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_BADGE[row.status] ?? STATUS_BADGE.draft)}>
                      {row.status.replace(/_/g, " ")}
                    </span>
                  </AdminTd>
                  <AdminTd className="capitalize">{orderModel(row)}</AdminTd>
                  <AdminTd>{row.submitted_at ? new Date(row.submitted_at).toLocaleDateString() : "—"}</AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>
    </div>
  );
}
