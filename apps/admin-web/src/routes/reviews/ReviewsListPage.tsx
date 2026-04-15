import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminModal } from "@/components/admin/AdminModal";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToast } from "@/lib/adminToast";

type ReviewsPayload = {
  reviews: Record<string, unknown>[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
  statistics: Record<string, unknown>;
};

export function ReviewsListPage() {
  const qc = useQueryClient();
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PROVIDERS_OPERATIONS,
    "Providers & operations access is required."
  );
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const status = sp.get("status") || "all";
  const providerId = sp.get("provider_id")?.trim() || "";
  const customerId = sp.get("customer_id")?.trim() || "";
  const search = sp.get("search")?.trim() || "";
  const [searchInput, setSearchInput] = useState(search);
  const [flagModal, setFlagModal] = useState<{ id: string; reason: string } | null>(null);
  const qk = useMemo(
    () => adminQueryKeys.reviews(`p=${page}|s=${status}|pv=${providerId}|cu=${customerId}|q=${search}`),
    [page, status, providerId, customerId, search]
  );

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("limit", "25");
      if (status !== "all") p.set("status", status);
      if (providerId) p.set("provider_id", providerId);
      if (customerId) p.set("customer_id", customerId);
      if (search) p.set("search", search);
      return adminApi.getJson<ReviewsPayload>(`/api/admin/reviews?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const pcrQ = useQuery({
    queryKey: adminQueryKeys.providerClientRatings(page, 25),
    queryFn: () =>
      adminApi.getJson<{
        reviews?: unknown;
        ratings: Record<string, unknown>[];
        pagination: { page: number; limit: number; total: number; total_pages: number };
      }>(`/api/admin/provider-client-ratings?page=${page}&limit=25`, { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const rows = q.data?.reviews ?? [];
  const pcrRows = pcrQ.data?.ratings ?? [];
  const pcrPag = pcrQ.data?.pagination;
  const pag = q.data?.pagination;
  const stats = q.data?.statistics;

  const moderateReview = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Record<string, unknown> }) =>
      adminApi.patchJson(`/api/admin/reviews/${id}`, updates),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: qk });
      if ("is_flagged" in vars.updates) {
        adminToast.success(vars.updates.is_flagged ? "Review flagged" : "Review unflagged");
      } else if ("is_visible" in vars.updates) {
        adminToast.success(vars.updates.is_visible ? "Review shown" : "Review hidden");
      } else {
        adminToast.success("Review updated");
      }
    },
    onError: (e: Error) => adminToast.error(`Moderation failed: ${e.message}`),
  });

  function setStatus(next: string) {
    const n = new URLSearchParams(sp);
    if (next === "all") n.delete("status");
    else n.set("status", next);
    n.set("page", "1");
    setSp(n, { replace: true });
  }

  function setPage(next: number) {
    const n = new URLSearchParams(sp);
    n.set("page", String(next));
    setSp(n, { replace: true });
  }

  function clearEntityFilters() {
    const n = new URLSearchParams(sp);
    n.delete("provider_id");
    n.delete("customer_id");
    n.set("page", "1");
    setSp(n, { replace: true });
  }

  function applySearch() {
    const n = new URLSearchParams(sp);
    if (searchInput.trim()) n.set("search", searchInput.trim());
    else n.delete("search");
    n.set("page", "1");
    setSp(n, { replace: true });
  }

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Reviews" />
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

  const tabs = ["all", "visible", "hidden", "flagged"] as const;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Reviews & ratings"
        description="Written reviews (`reviews`): customer→provider (`rating`), optional provider→customer text ratings (`customer_rating`), staff stars. Booking-only provider→customer stars live in Provider→customer (booking ratings) below (`provider_client_ratings`)."
      />
      {stats ? (
        <AdminPanel>
          <h2 className="text-sm font-semibold text-gray-900">Summary</h2>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-gray-500">Total reviews</dt>
              <dd className="font-medium tabular-nums">{String(stats.total ?? "—")}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Average (customer→provider)</dt>
              <dd className="font-medium tabular-nums">{String(stats.average_rating ?? "—")}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Visible / hidden / flagged</dt>
              <dd className="font-medium">
                {String(stats.visible ?? "—")} / {String(stats.hidden ?? "—")} / {String(stats.flagged ?? "—")}
              </dd>
            </div>
          </dl>
        </AdminPanel>
      ) : null}
      <AdminPanel>
        <div className="mb-4 flex gap-2">
          <input
            type="search"
            placeholder="Search reviewer name, provider, comment…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
            className="w-full flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={applySearch}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Search
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              className={adminTabButtonClass(status === t)}
              onClick={() => setStatus(t)}
            >
              {t}
            </button>
          ))}
        </div>
        {search && (
          <p className="mt-2 text-sm text-gray-500">
            Search: <strong>"{search}"</strong>{" "}
            <button
              type="button"
              className="text-primary underline"
              onClick={() => { setSearchInput(""); const n = new URLSearchParams(sp); n.delete("search"); setSp(n, { replace: true }); }}
            >
              Clear
            </button>
          </p>
        )}
        {(providerId || customerId) && (
          <p className="mt-3 text-sm text-gray-600">
            Filtered
            {providerId ? (
              <>
                {" "}
                · provider <span className="font-mono text-xs">{providerId}</span>
              </>
            ) : null}
            {customerId ? (
              <>
                {" "}
                · customer <span className="font-mono text-xs">{customerId}</span>
              </>
            ) : null}
            <button type="button" className="ml-2 text-primary underline" onClick={clearEntityFilters}>
              Clear
            </button>
          </p>
        )}
        {pag ? (
          <p className="mt-3 text-sm text-gray-600">
            Page {pag.page} of {Math.max(1, pag.total_pages)} · {pag.total} total
          </p>
        ) : null}
      </AdminPanel>
      {rows.length === 0 ? (
        <EmptyState title="No reviews" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Customer→provider</AdminTh>
              <AdminTh>Provider→customer</AdminTh>
              <AdminTh>Staff</AdminTh>
              <AdminTh>Comment</AdminTh>
              <AdminTh>Provider</AdminTh>
              <AdminTh>Customer</AdminTh>
              <AdminTh>Visible</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const row = r as Record<string, unknown>;
              const prov = row.provider as { id?: string; business_name?: string } | undefined;
              const cust = row.customer as { id?: string; full_name?: string; email?: string } | undefined;
              return (
                <tr key={String(row.id ?? "")}>
                  <AdminTd className="tabular-nums font-medium">{String(row.rating ?? "—")}</AdminTd>
                  <AdminTd className="tabular-nums">{String(row.customer_rating ?? "—")}</AdminTd>
                  <AdminTd className="tabular-nums">{String(row.staff_rating ?? "—")}</AdminTd>
                  <AdminTd className="max-w-xs truncate text-xs">{String(row.comment ?? "")}</AdminTd>
                  <AdminTd className="text-xs">
                    {prov?.id ? (
                      <Link className="text-primary underline" to={adminSpaTo(`/admin/providers/${prov.id}`)}>
                        {String(prov.business_name ?? prov.id)}
                      </Link>
                    ) : (
                      String(prov?.business_name ?? "")
                    )}
                  </AdminTd>
                  <AdminTd className="text-xs">
                    {cust?.id ? (
                      <Link className="text-primary underline" to={adminSpaTo(`/admin/users/${cust.id}`)}>
                        {String(cust.full_name ?? cust.email ?? cust.id)}
                      </Link>
                    ) : (
                      String(cust?.full_name ?? cust?.email ?? "")
                    )}
                  </AdminTd>
                  <AdminTd>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      row.is_visible ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                    }`}>
                      {row.is_visible ? "visible" : "hidden"}
                    </span>
                    {Boolean(row.is_flagged) ? (
                      <span className="ml-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                        flagged
                      </span>
                    ) : null}
                  </AdminTd>
                  <AdminTd>
                    <div className="flex gap-1">
                      {row.is_visible ? (
                        <button
                          type="button"
                          className="rounded bg-gray-500 px-2 py-1 text-xs text-white hover:bg-gray-600 disabled:opacity-50"
                          disabled={moderateReview.isPending}
                          onClick={() => moderateReview.mutate({ id: String(row.id), updates: { is_visible: false } })}
                        >
                          Hide
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50"
                          disabled={moderateReview.isPending}
                          onClick={() => moderateReview.mutate({ id: String(row.id), updates: { is_visible: true } })}
                        >
                          Show
                        </button>
                      )}
                      {!row.is_flagged ? (
                        <button
                          type="button"
                          className="rounded bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600 disabled:opacity-50"
                          disabled={moderateReview.isPending}
                          onClick={() => setFlagModal({ id: String(row.id), reason: "" })}
                        >
                          Flag
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="rounded bg-blue-500 px-2 py-1 text-xs text-white hover:bg-blue-600 disabled:opacity-50"
                          disabled={moderateReview.isPending}
                          onClick={() => moderateReview.mutate({ id: String(row.id), updates: { is_flagged: false, flagged_reason: null } })}
                        >
                          Unflag
                        </button>
                      )}
                    </div>
                  </AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}
      {pag && pag.total_pages > 1 ? (
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={page >= pag.total_pages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      ) : null}

      <AdminPanel>
        <h2 className="text-sm font-semibold text-gray-900">Provider→customer (booking ratings)</h2>
        <p className="mt-1 text-xs text-gray-500">
          Stored in <span className="font-mono">provider_client_ratings</span> when a provider rates a customer after a completed booking — separate from the written-review row in{" "}
          <span className="font-mono">reviews</span>.
        </p>
        {pcrQ.isLoading ? (
          <p className="mt-3 text-sm text-gray-500">Loading booking ratings…</p>
        ) : pcrQ.error ? (
          <p className="mt-3 text-sm text-red-600">{pcrQ.error instanceof Error ? pcrQ.error.message : "Failed to load"}</p>
        ) : pcrRows.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No provider→customer booking ratings in this tenant.</p>
        ) : (
          <>
            {pcrPag ? (
              <p className="mt-3 text-sm text-gray-600">
                Page {pcrPag.page} of {Math.max(1, pcrPag.total_pages)} · {pcrPag.total} total
              </p>
            ) : null}
            <AdminDataTable className="mt-3">
              <AdminTableHead>
                <tr>
                  <AdminTh>Rating</AdminTh>
                  <AdminTh>Comment</AdminTh>
                  <AdminTh>Provider</AdminTh>
                  <AdminTh>Customer</AdminTh>
                  <AdminTh>Booking</AdminTh>
                  <AdminTh>Created</AdminTh>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {pcrRows.map((raw) => {
                  const row = raw as Record<string, unknown>;
                  const prov = row.provider as { id?: string; business_name?: string } | undefined;
                  const cust = row.customer as { id?: string; full_name?: string; email?: string } | undefined;
                  const book = row.booking as { id?: string; booking_number?: string } | undefined;
                  return (
                    <tr key={String(row.id ?? "")}>
                      <AdminTd className="tabular-nums font-medium">{String(row.rating ?? "—")}</AdminTd>
                      <AdminTd className="max-w-xs truncate text-xs">{String(row.comment ?? "")}</AdminTd>
                      <AdminTd className="text-xs">
                        {prov?.id ? (
                          <Link className="text-primary underline" to={adminSpaTo(`/admin/providers/${prov.id}`)}>
                            {String(prov.business_name ?? prov.id)}
                          </Link>
                        ) : (
                          String(prov?.business_name ?? "")
                        )}
                      </AdminTd>
                      <AdminTd className="text-xs">
                        {cust?.id ? (
                          <Link className="text-primary underline" to={adminSpaTo(`/admin/users/${cust.id}`)}>
                            {String(cust.full_name ?? cust.email ?? cust.id)}
                          </Link>
                        ) : (
                          String(cust?.full_name ?? cust?.email ?? "")
                        )}
                      </AdminTd>
                      <AdminTd className="text-xs font-mono">
                        {book?.id ? (
                          <Link className="text-primary underline" to={adminSpaTo(`/admin/bookings/${book.id}`)}>
                            {String(book.booking_number ?? book.id)}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </AdminTd>
                      <AdminTd className="text-xs text-gray-600">
                        {row.created_at ? new Date(String(row.created_at)).toLocaleString() : "—"}
                      </AdminTd>
                    </tr>
                  );
                })}
              </AdminTableBody>
            </AdminDataTable>
          </>
        )}
      </AdminPanel>

      {/* Flag review modal — replaces native prompt() */}
      {flagModal && (
        <AdminModal
          open
          onClose={() => setFlagModal(null)}
          title="Flag review"
          description="This review will be hidden and flagged for admin review."
          footer={
            <>
              <button
                type="button"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                onClick={() => setFlagModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={moderateReview.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                onClick={() => {
                  moderateReview.mutate({
                    id: flagModal.id,
                    updates: { is_flagged: true, is_visible: false, flagged_reason: flagModal.reason || null },
                  });
                  setFlagModal(null);
                }}
              >
                {moderateReview.isPending ? "Flagging…" : "Flag review"}
              </button>
            </>
          }
        >
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Reason (optional)</label>
            <textarea
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              rows={3}
              placeholder="Describe why this review is being flagged…"
              value={flagModal.reason}
              onChange={(e) => setFlagModal((f) => f ? { ...f, reason: e.target.value } : f)}
            />
          </div>
        </AdminModal>
      )}
    </div>
  );
}
