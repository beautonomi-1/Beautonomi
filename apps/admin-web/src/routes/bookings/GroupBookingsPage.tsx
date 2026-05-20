import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@beautonomi/admin-access";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { EmptyState } from "@/components/ui/EmptyState";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { adminApi } from "@/lib/adminClient";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToast } from "@/lib/adminToast";

type GroupBookingRow = {
  id: string;
  ref_number: string;
  title: string;
  status: string;
  scheduled_at: string | null;
  provider_id: string | null;
  provider_name: string | null;
  participant_count: number;
  max_participants: number | null;
  total_price: number;
};

type GroupBookingDetail = GroupBookingRow & {
  notes?: string | null;
  participants?: Array<{
    id: string;
    booking_id: string | null;
    participant_name: string;
    participant_email: string | null;
    participant_phone: string | null;
    is_primary_contact: boolean;
    service_name: string;
    price: number;
    checked_in_at: string | null;
    checked_out_at: string | null;
  }>;
  bookings?: Array<{
    id: string;
    booking_number?: string | null;
    status?: string | null;
    payment_status?: string | null;
    total_amount?: number | null;
  }>;
};

type GroupBookingsPayload = {
  group_bookings: GroupBookingRow[];
  total: number;
  page: number;
  limit: number;
};

const LIMIT = 50;

function fmtDate(value: string | null) {
  if (!value) return "Not scheduled";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "Invalid date";
  return d.toLocaleString();
}

function money(value: number | null | undefined) {
  return `R ${Number(value ?? 0).toFixed(2)}`;
}

function pillClass(status: string) {
  switch (status) {
    case "completed":
      return "bg-blue-50 text-blue-700";
    case "cancelled":
      return "bg-red-50 text-red-700";
    case "started":
    case "in_progress":
      return "bg-indigo-50 text-indigo-700";
    case "confirmed":
    case "booked":
      return "bg-green-50 text-green-700";
    case "pending":
    case "waiting":
      return "bg-amber-50 text-amber-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "pending": return "Pending";
    case "confirmed": return "Confirmed";
    case "booked": return "Booked";
    case "started": return "In progress";
    case "in_progress": return "In progress";
    case "completed": return "Completed";
    case "cancelled": return "Cancelled";
    case "waiting": return "Waiting";
    default: return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
  }
}

function canStart(status: string): boolean {
  return ["pending", "confirmed", "booked", "waiting"].includes(status);
}

function canComplete(status: string): boolean {
  return ["started", "in_progress"].includes(status);
}

function canCancel(status: string): boolean {
  return !["cancelled", "completed"].includes(status);
}

export function GroupBookingsPage() {
  useAdminDocumentTitle("Group bookings");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PROVIDERS_OPERATIONS,
    "Providers & operations access is required for group bookings."
  );
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["admin", "group-bookings", status, search],
    enabled: allowed,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", String(LIMIT));
      params.set("page", "0");
      if (status !== "all") params.set("status", status);
      if (search.trim()) params.set("search", search.trim());
      return adminApi.getJson<GroupBookingsPayload>(`/api/admin/group-bookings?${params.toString()}`);
    },
  });

  const rows = useMemo(() => listQuery.data?.group_bookings ?? [], [listQuery.data]);
  const selected = selectedId ?? rows[0]?.id ?? null;

  const detailQuery = useQuery({
    queryKey: ["admin", "group-bookings", selected],
    enabled: allowed && Boolean(selected),
    queryFn: () => adminApi.getJson<GroupBookingDetail>(`/api/admin/group-bookings/${selected}`),
  });

  const actionMutation = useMutation({
    mutationFn: async (payload: { id: string; action: "start_service" | "complete_service" | "cancel" }) => {
      if (payload.action === "cancel") {
        await adminApi.deleteJson(`/api/admin/group-bookings/${payload.id}`);
      } else {
        await adminApi.postJson(`/api/admin/group-bookings/${payload.id}?action=${payload.action}`, {});
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "group-bookings"] });
      adminToast.success("Group booking updated");
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  if (denied) return denied;
  if (listQuery.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Group bookings" description="Manage group sessions across providers" />
        <AdminPanel>
          <AdminPageSkeleton rows={6} />
        </AdminPanel>
      </div>
    );
  }
  if (listQuery.error) {
    if (isAdminApiAuthFailure(listQuery.error)) return <PermissionDenied />;
    return (
      <AdminPanel>
        <AdminRetryBlock message={listQuery.error.message} onRetry={() => void listQuery.refetch()} />
      </AdminPanel>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Group bookings"
        description="Monitor, inspect, cancel, start, and complete provider group sessions."
      />

      <AdminPanel>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ref or title"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm md:max-w-sm"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            {[
              { value: "all", label: "All statuses" },
              { value: "pending", label: "Pending" },
              { value: "confirmed", label: "Confirmed" },
              { value: "booked", label: "Booked" },
              { value: "started", label: "In progress" },
              { value: "completed", label: "Completed" },
              { value: "cancelled", label: "Cancelled" },
            ].map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </AdminPanel>

      {rows.length === 0 ? (
        <AdminPanel>
          <EmptyState title="No group bookings found" description="Try clearing filters or search terms." />
        </AdminPanel>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <AdminPanel className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Group</th>
                    <th className="px-4 py-3">Provider</th>
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">People</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={row.id === selected ? "bg-pink-50/70" : "hover:bg-gray-50"}
                      onClick={() => setSelectedId(row.id)}
                    >
                      <td className="px-4 py-3">
                        <button className="text-left font-medium text-gray-900" type="button">
                          {row.title}
                        </button>
                        <div className="text-xs text-gray-500">{row.ref_number}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{row.provider_name ?? "Provider"}</td>
                      <td className="px-4 py-3 text-gray-700">{fmtDate(row.scheduled_at)}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {row.participant_count}
                        {row.max_participants ? ` / ${row.max_participants}` : ""}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{money(row.total_price)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${pillClass(row.status)}`}>
                          {statusLabel(row.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AdminPanel>

          <AdminPanel>
            {!selected ? (
              <EmptyState title="Select a group booking" description="Choose a row to inspect participants." />
            ) : detailQuery.isLoading ? (
              <AdminPageSkeleton rows={5} />
            ) : detailQuery.error ? (
              <AdminRetryBlock message={detailQuery.error.message} onRetry={() => void detailQuery.refetch()} />
            ) : detailQuery.data ? (
              <div className="space-y-5">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Selected group</div>
                  <h2 className="mt-1 text-lg font-semibold text-gray-900">{detailQuery.data.title}</h2>
                  <p className="text-sm text-gray-500">{detailQuery.data.ref_number}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-gray-50 p-3">
                    <div className="text-xs text-gray-500">Provider</div>
                    <div className="font-medium text-gray-900">{detailQuery.data.provider_name ?? "Provider"}</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <div className="text-xs text-gray-500">Status</div>
                    <div className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${pillClass(detailQuery.data.status)}`}>
                      {statusLabel(detailQuery.data.status)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <div className="text-xs text-gray-500">Participants</div>
                    <div className="font-medium text-gray-900">
                      {detailQuery.data.participant_count}
                      {detailQuery.data.max_participants
                        ? ` / ${detailQuery.data.max_participants}`
                        : ""}
                      {detailQuery.data.max_participants &&
                        detailQuery.data.participant_count >= detailQuery.data.max_participants && (
                          <span className="ml-1 text-xs font-normal text-red-600">Full</span>
                        )}
                    </div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <div className="text-xs text-gray-500">Total</div>
                    <div className="font-medium text-gray-900">{money(detailQuery.data.total_price)}</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {canStart(detailQuery.data.status) && (
                    <button
                      type="button"
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
                      disabled={actionMutation.isPending}
                      onClick={() => actionMutation.mutate({ id: detailQuery.data!.id, action: "start_service" })}
                    >
                      Start
                    </button>
                  )}
                  {canComplete(detailQuery.data.status) && (
                    <button
                      type="button"
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
                      disabled={actionMutation.isPending}
                      onClick={() => actionMutation.mutate({ id: detailQuery.data!.id, action: "complete_service" })}
                    >
                      Complete
                    </button>
                  )}
                  {canCancel(detailQuery.data.status) && (
                    <button
                      type="button"
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 disabled:opacity-50"
                      disabled={actionMutation.isPending}
                      onClick={() => {
                        if (window.confirm("Cancel this group booking and child bookings?")) {
                          actionMutation.mutate({ id: detailQuery.data!.id, action: "cancel" });
                        }
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold text-gray-900">Participants</h3>
                  {(detailQuery.data.participants ?? []).length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No participants linked yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {(detailQuery.data.participants ?? []).map((p) => (
                        <div key={p.id} className="rounded-lg border border-gray-200 p-3 text-sm">
                          <div className="flex items-center gap-1.5 font-medium text-gray-900">
                            {p.participant_name}
                            {p.is_primary_contact && (
                              <span className="rounded-full bg-pink-50 px-1.5 py-0.5 text-[10px] font-semibold text-pink-700">
                                primary
                              </span>
                            )}
                          </div>
                          <div className="text-gray-500">{p.service_name} · {money(p.price)}</div>
                          <div className="text-xs text-gray-500">
                            {p.checked_in_at
                              ? `Checked in ${new Date(p.checked_in_at).toLocaleTimeString()}`
                              : "Not checked in"}
                            {" · "}
                            {p.checked_out_at
                              ? `Checked out ${new Date(p.checked_out_at).toLocaleTimeString()}`
                              : "Not checked out"}
                          </div>
                          {p.booking_id && (
                            <Link
                              to={adminSpaTo(`/admin/bookings/${p.booking_id}`)}
                              className="mt-2 inline-block text-xs font-medium text-pink-700"
                            >
                              Open child booking →
                            </Link>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </AdminPanel>
        </div>
      )}
    </div>
  );
}
