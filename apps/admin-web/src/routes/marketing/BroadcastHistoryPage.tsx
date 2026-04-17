import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { adminSpaTo } from "@/lib/adminSpaPath";

type BroadcastEnvelope = {
  data: { broadcasts: Record<string, unknown>[]; meta: { page: number; limit: number; total: number; has_more: boolean } };
};

export function BroadcastHistoryPage() {
  useAdminDocumentTitle("Broadcast History");
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const channel = sp.get("channel") || "all";
  const qk = useMemo(() => adminQueryKeys.broadcastHistory(`p=${page}|c=${channel}`), [page, channel]);

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("limit", "25");
      if (channel !== "all") p.set("channel", channel);
      return adminApi.getRawJson<BroadcastEnvelope>(`/api/admin/broadcast/history?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const inner = q.data?.data;
  const rows = inner?.broadcasts ?? [];
  const meta = inner?.meta;

  function setPage(next: number) {
    const n = new URLSearchParams(sp);
    n.set("page", String(next));
    setSp(n, { replace: true });
  }

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Broadcast history" description="Paginated delivery log" />
        <AdminPanel>
          <AdminPageSkeleton rows={5} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Broadcast history" description="GET /api/admin/broadcast/history" />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link
          to={adminSpaTo("/admin/broadcast")}
          className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 font-medium text-gray-900 shadow-sm ring-1 ring-gray-950/[0.04] transition hover:border-gray-300 hover:bg-gray-50"
        >
          ← Broadcast hub
        </Link>
        <Link
          to={adminSpaTo("/admin/broadcast/compose")}
          className="inline-flex min-h-11 items-center font-medium text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-gray-900"
        >
          Compose broadcast
        </Link>
      </div>
      {meta ? (
        <AdminPanel>
          <p className="text-sm text-gray-600">
            Page {meta.page} · {meta.total} total
          </p>
        </AdminPanel>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title="No broadcasts" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Channel</AdminTh>
              <AdminTh>Subject / Title</AdminTh>
              <AdminTh>Recipients</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Sent at</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const row = r as Record<string, unknown>;
              const statusColors: Record<string, string> = {
                sent: "bg-green-100 text-green-800",
                delivered: "bg-green-100 text-green-800",
                failed: "bg-red-100 text-red-800",
                partial: "bg-amber-100 text-amber-800",
                pending: "bg-gray-100 text-gray-700",
                scheduled: "bg-blue-100 text-blue-800",
              };
              const status = String(row.status ?? row.delivery_status ?? "—");
              const statusClass = statusColors[status] ?? "bg-gray-100 text-gray-700";
              const subject =
                String(row.subject ?? row.title ?? row.message_preview ?? row.body ?? "—").slice(0, 80);
              const recipientCount =
                row.recipient_count ?? row.total_recipients ?? row.sent_count ?? "—";
              return (
                <tr key={String(row.id ?? "")}>
                  <AdminTd>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium capitalize text-gray-700">
                      {String(row.channel ?? "—")}
                    </span>
                  </AdminTd>
                  <AdminTd className="max-w-xs truncate text-xs text-gray-700">{subject}</AdminTd>
                  <AdminTd className="tabular-nums text-xs">{String(recipientCount)}</AdminTd>
                  <AdminTd>
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusClass}`}>{status}</span>
                  </AdminTd>
                  <AdminTd className="text-xs text-gray-500">
                    {String(row.sent_at ?? row.created_at ?? "").slice(0, 16).replace("T", " ")}
                  </AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}
      {meta && (meta.has_more || page > 1) ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={adminToolbarButtonClass(page <= 1)}
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            className={adminToolbarButtonClass(!meta.has_more)}
            disabled={!meta.has_more}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
