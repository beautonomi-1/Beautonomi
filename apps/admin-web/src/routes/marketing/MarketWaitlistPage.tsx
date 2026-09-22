import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";

type WaitlistRow = {
  id: string;
  city_name: string;
  name: string;
  email: string | null;
  phone: string | null;
  country_code: string | null;
  source: string | null;
  persona: string | null;
  status: string;
  lead_id: string | null;
  created_at: string;
};

type ListResponse = {
  items: WaitlistRow[];
  pagination: { page: number; page_size: number; total: number };
  pending_count: number;
};

export function MarketWaitlistPage() {
  useAdminDocumentTitle("Market waitlist");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_MARKETING_COMMS,
    "Marketing access is required.",
  );
  const [statusFilter, setStatusFilter] = useState("pending");
  const queryClient = useQueryClient();

  const listQ = useQuery({
    queryKey: adminQueryKeys.marketWaitlist({ status: statusFilter }),
    queryFn: () =>
      adminApi.getJson<ListResponse>(
        `/api/admin/city-waitlist?status=${encodeURIComponent(statusFilter)}&page_size=50`,
        { timeoutMs: 30_000 },
      ),
    enabled: allowed,
  });

  const patchM = useMutation({
    mutationFn: (args: { id: string; status: string }) =>
      adminApi.patchJson(`/api/admin/city-waitlist/${args.id}`, { status: args.status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.marketWaitlistRoot() });
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.navCounts() });
    },
  });

  const promoteM = useMutation({
    mutationFn: (id: string) =>
      adminApi.postJson<{ lead_id: string }>(`/api/admin/city-waitlist/${id}/promote-lead`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.marketWaitlistRoot() });
    },
  });

  if (denied) return denied;
  if (listQ.isLoading) {
    return (
      <AdminPanel>
        <AdminPageSkeleton rows={6} />
      </AdminPanel>
    );
  }
  if (listQ.error) {
    if (isAdminApiAuthFailure(listQ.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={listQ.error.message} onRetry={() => void listQ.refetch()} />;
  }

  const data = listQ.data;
  const rows = data?.items ?? [];

  return (
    <div className="space-y-4">
      <AdminPanel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <h1 className="text-lg font-semibold">Market expansion waitlist</h1>
            <p className="text-sm text-muted-foreground">
              City demand from web and mobile gates. Pending: {data?.pending_count ?? 0}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <a
            className="text-sm text-primary underline-offset-2 hover:underline"
            href={`/api/admin/city-waitlist/export?status=${encodeURIComponent(statusFilter)}`}
          >
            Export CSV
          </a>
          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="pending">Pending</option>
            <option value="contacted">Contacted</option>
            <option value="approved">Approved</option>
            <option value="cancelled">Cancelled</option>
          </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pe-3">Name</th>
                <th className="py-2 pe-3">City</th>
                <th className="py-2 pe-3">Country</th>
                <th className="py-2 pe-3">Contact</th>
                <th className="py-2 pe-3">Source</th>
                <th className="py-2 pe-3">Persona</th>
                <th className="py-2 pe-3">Status</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/60">
                  <td className="py-2 pe-3 font-medium">{row.name}</td>
                  <td className="py-2 pe-3">{row.city_name}</td>
                  <td className="py-2 pe-3">{row.country_code ?? "—"}</td>
                  <td className="py-2 pe-3">
                    {row.email ?? row.phone ?? "—"}
                  </td>
                  <td className="py-2 pe-3">{row.source ?? "—"}</td>
                  <td className="py-2 pe-3">{row.persona ?? "—"}</td>
                  <td className="py-2 pe-3">{row.status}</td>
                  <td className="py-2 space-x-3">
                    {row.status === "pending" ? (
                      <button
                        type="button"
                        className="text-primary underline-offset-2 hover:underline"
                        disabled={patchM.isPending}
                        onClick={() => patchM.mutate({ id: row.id, status: "contacted" })}
                      >
                        Mark contacted
                      </button>
                    ) : null}
                    {row.persona === "provider" && !row.lead_id ? (
                      <button
                        type="button"
                        className="text-primary underline-offset-2 hover:underline"
                        disabled={promoteM.isPending}
                        onClick={() => promoteM.mutate(row.id)}
                      >
                        Create lead & invite
                      </button>
                    ) : null}
                    {row.lead_id ? (
                      <span className="text-xs text-muted-foreground">Lead linked</span>
                    ) : null}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    No entries for this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </AdminPanel>
    </div>
  );
}
