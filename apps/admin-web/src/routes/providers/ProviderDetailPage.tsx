import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { adminToast } from "@/lib/adminToast";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";

type PayoutAccountRow = Record<string, unknown> & {
  id?: string;
  type?: string;
  account_name?: string | null;
  account_number_last4?: string | null;
  bank_name?: string | null;
  bank_code?: string | null;
  currency?: string;
  active?: boolean;
  is_primary?: boolean;
  created_at?: string;
};

type ProviderDetail = Record<string, unknown> & {
  owner?: { id?: string; full_name?: string | null; email?: string | null; phone?: string | null } | null;
  stats?: { booking_count?: number; review_count?: number; average_rating?: number };
  locations?: Record<string, unknown>[];
  yoco_summary?: {
    integration?: {
      enabled?: boolean;
      connected_at?: string | null;
      last_sync?: string | null;
      has_public_key?: boolean;
    } | null;
    web_pos_devices?: Record<string, unknown>[];
    legacy_terminals?: Record<string, unknown>[];
    derived?: Record<string, unknown>;
  };
};

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

type Draft = {
  business_name: string;
  email: string;
  phone: string;
  description: string;
  business_type: string;
};

export function ProviderDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PROVIDERS_OPERATIONS,
    "Providers & operations access is required."
  );

  const [draft, setDraft] = useState<Draft>({
    business_name: "",
    email: "",
    phone: "",
    description: "",
    business_type: "",
  });
  const [deductPoints, setDeductPoints] = useState("");
  const [deductReason, setDeductReason] = useState("");
  const [showDeduct, setShowDeduct] = useState(false);

  const q = useQuery({
    queryKey: adminQueryKeys.providers.detail(id),
    queryFn: () =>
      adminApi.getJson<ProviderDetail>(`/api/admin/providers/${encodeURIComponent(id)}`, { timeoutMs: 60_000 }),
    enabled: allowed && !!id,
  });

  const providerCanonicalId = q.data?.id != null ? str(q.data.id) : "";

  const payoutAccountsQ = useQuery({
    queryKey: adminQueryKeys.providers.payoutAccounts(providerCanonicalId),
    queryFn: () =>
      adminApi.getJson<PayoutAccountRow[]>(
        `/api/admin/providers/${encodeURIComponent(providerCanonicalId)}/payout-accounts`,
        { timeoutMs: 60_000 }
      ),
    enabled: allowed && !!providerCanonicalId,
  });

  const gamificationQ = useQuery({
    queryKey: adminQueryKeys.providerGamification(providerCanonicalId),
    queryFn: () =>
      adminApi.getJson<Record<string, unknown>>(
        `/api/admin/providers/${encodeURIComponent(providerCanonicalId)}/gamification`,
        { timeoutMs: 30_000 }
      ),
    enabled: allowed && !!providerCanonicalId,
  });

  const deductPointsMutation = useMutation({
    mutationFn: (payload: { points: number; reason: string }) =>
      adminApi.postJson(
        `/api/admin/providers/${encodeURIComponent(providerCanonicalId)}/gamification/deduct`,
        payload
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerGamification(providerCanonicalId) });
      adminToast.success("Points deducted successfully");
    },
    onError: (e: Error) => adminToast.error(`Failed to deduct points: ${e.message}`),
  });

  useEffect(() => {
    const d = q.data;
    if (!d) return;
    setDraft({
      business_name: str(d.business_name),
      email: str(d.email),
      phone: str(d.phone),
      description: str(d.description),
      business_type: str(d.business_type),
    });
  }, [q.data]);

  const save = useMutation({
    mutationFn: () =>
      adminApi.patchJson(`/api/admin/providers/${encodeURIComponent(id)}`, {
        business_name: draft.business_name.trim() || undefined,
        email: draft.email.trim() || undefined,
        phone: draft.phone.trim() || undefined,
        description: draft.description.trim() || undefined,
        business_type: draft.business_type.trim() || undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providers.detail(id) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providers.all() });
      adminToast.success("Provider details saved");
    },
    onError: (e: Error) => adminToast.error(`Failed to save provider: ${e.message}`),
  });

  const changeStatus = useMutation({
    mutationFn: (newStatus: string) =>
      adminApi.patchJson(`/api/admin/providers/${encodeURIComponent(id)}/status`, { status: newStatus }),
    onSuccess: (_data, newStatus) => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providers.detail(id) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providers.all() });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.navCounts() });
      adminToast.success(`Provider status updated to ${newStatus}`);
    },
    onError: (e: Error) => adminToast.error(`Failed to update status: ${e.message}`),
  });

  if (denied) return denied;
  if (!id) {
    return <AdminRetryBlock message="Missing provider id" onRetry={() => {}} />;
  }

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Provider" />
        <AdminPanel>
          <AdminPageSkeleton rows={4} />
        </AdminPanel>
      </div>
    );
  }

  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const row = q.data;
  if (!row) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Provider" />
        <AdminPanel>
          <p className="text-sm text-gray-600">Provider not found.</p>
        </AdminPanel>
      </div>
    );
  }

  const stats = row.stats;
  const business = str(row.business_name) || str(row.slug) || id;
  const locations = Array.isArray(row.locations) ? row.locations : [];
  const yoco = row.yoco_summary;
  const yocoDerived = yoco?.derived ?? {};

  function formatLocationAddress(loc: Record<string, unknown>): string {
    const parts = [
      loc.address_line1,
      loc.address_line2,
      [loc.city, loc.state, loc.postal_code].filter(Boolean).join(", "),
      loc.country,
    ].filter(Boolean);
    return parts.map((p) => str(p)).join(" · ") || "—";
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={business}
        description={
          <span className="flex items-center gap-2">
            <span className="text-gray-500">ID: {str(row.id) || id}</span>
            {str(row.status) ? (
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                row.status === "active" ? "bg-green-100 text-green-800" :
                row.status === "suspended" ? "bg-red-100 text-red-800" :
                "bg-amber-100 text-amber-800"
              }`}>
                {str(row.status)}
              </span>
            ) : null}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {(str(row.status) === "pending" || str(row.status) === "pending_approval") && (
              <button
                type="button"
                className="rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                disabled={changeStatus.isPending}
                onClick={() => {
                  if (confirm(`Approve ${business}?`))
                    changeStatus.mutate("active");
                }}
              >
                Approve
              </button>
            )}
            {str(row.status) === "active" && (
              <button
                type="button"
                className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                disabled={changeStatus.isPending}
                onClick={() => {
                  if (confirm(`Suspend ${business}?`))
                    changeStatus.mutate("suspended");
                }}
              >
                Suspend
              </button>
            )}
            {str(row.status) === "suspended" && (
              <button
                type="button"
                className="rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                disabled={changeStatus.isPending}
                onClick={() => {
                  if (confirm(`Reactivate ${business}?`))
                    changeStatus.mutate("active");
                }}
              >
                Reactivate
              </button>
            )}
            <Link
              to={adminSpaTo("/admin/providers")}
              className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 shadow-sm ring-1 ring-gray-950/[0.04] hover:bg-gray-50"
            >
              ← Providers
            </Link>
          </div>
        }
      />

      <AdminMutationAlert
        errors={[
          save.error instanceof Error ? save.error : null,
          payoutAccountsQ.error instanceof Error ? payoutAccountsQ.error : null,
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <AdminPanel className="lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900">Business details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-gray-600">Business name</span>
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={draft.business_name}
                onChange={(e) => setDraft((d) => ({ ...d, business_name: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Business type</span>
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={draft.business_type}
                onChange={(e) => setDraft((d) => ({ ...d, business_type: e.target.value }))}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-gray-600">Email</span>
              <input
                type="email"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={draft.email}
                onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-gray-600">Phone</span>
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={draft.phone}
                onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-gray-600">Description</span>
              <textarea
                className="mt-1 w-full min-h-[100px] rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              />
            </label>
          </div>
          <button
            type="button"
            className={`mt-6 ${adminToolbarButtonClass(save.isPending)}`}
            disabled={save.isPending}
            onClick={() => void save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save changes"}
          </button>
        </AdminPanel>

        <AdminPanel>
          <h2 className="text-lg font-semibold text-gray-900">Owner & stats</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-gray-500">Owner</dt>
              <dd>
                {row.owner?.id ? (
                  <Link className="font-medium text-primary underline" to={adminSpaTo(`/admin/users/${row.owner.id}`)}>
                    {row.owner.full_name || row.owner.email || row.owner.id}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Bookings</dt>
              <dd className="font-medium">{stats?.booking_count ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Reviews</dt>
              <dd className="font-medium">{stats?.review_count ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Avg rating</dt>
              <dd className="font-medium">
                {stats?.average_rating != null ? Number(stats.average_rating).toFixed(2) : "—"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-gray-500">All reviews for this provider</dt>
              <dd>
                <Link
                  className="text-sm font-medium text-primary underline"
                  to={adminSpaTo(`/admin/reviews?provider_id=${encodeURIComponent(id)}`)}
                >
                  Open reviews list
                </Link>
              </dd>
            </div>
          </dl>
        </AdminPanel>
      </div>

      <AdminPanel>
        <h2 className="text-lg font-semibold text-gray-900">Payout accounts</h2>
        <p className="mt-1 text-sm text-gray-600">
          Bank / transfer recipients on file for payouts (masked account details).
        </p>
        {payoutAccountsQ.isLoading ? (
          <p className="mt-4 text-sm text-gray-500">Loading payout accounts…</p>
        ) : (payoutAccountsQ.data ?? []).length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No payout accounts.</p>
        ) : (
          <AdminDataTable className="mt-4">
            <AdminTableHead>
              <tr>
                <AdminTh>Type</AdminTh>
                <AdminTh>Bank</AdminTh>
                <AdminTh>Account</AdminTh>
                <AdminTh>Currency</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Created</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {(payoutAccountsQ.data ?? []).map((acc) => (
                <tr key={str(acc.id)}>
                  <AdminTd>{str(acc.type)}</AdminTd>
                  <AdminTd>{str(acc.bank_name) || str(acc.bank_code) || "—"}</AdminTd>
                  <AdminTd>
                    {str(acc.account_name) || "—"}
                    {acc.account_number_last4 ? (
                      <span className="text-gray-600"> · •••• {str(acc.account_number_last4)}</span>
                    ) : null}
                  </AdminTd>
                  <AdminTd>{str(acc.currency) || "—"}</AdminTd>
                  <AdminTd>
                    {acc.active === false ? "Inactive" : "Active"}
                    {acc.is_primary ? <span className="ml-2 text-xs text-primary">primary</span> : null}
                  </AdminTd>
                  <AdminTd>
                    {acc.created_at ? new Date(String(acc.created_at)).toLocaleString() : "—"}
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>

      <AdminPanel>
        <h2 className="text-lg font-semibold text-gray-900">Yoco terminals & integration</h2>
        <p className="mt-1 text-sm text-gray-600">
          Operational view from stored integration and device rows (not a live ping to Yoco).
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Integration record</dt>
            <dd className="font-medium">{yoco?.integration ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Integration enabled</dt>
            <dd className="font-medium">{yoco?.integration?.enabled ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Has public key configured</dt>
            <dd className="font-medium">{yoco?.integration?.has_public_key ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Connected at</dt>
            <dd className="font-medium">
              {yoco?.integration?.connected_at
                ? new Date(String(yoco.integration.connected_at)).toLocaleString()
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Last sync</dt>
            <dd className="font-medium">
              {yoco?.integration?.last_sync
                ? new Date(String(yoco.integration.last_sync)).toLocaleString()
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Web POS devices</dt>
            <dd className="font-medium">{Array.isArray(yoco?.web_pos_devices) ? yoco!.web_pos_devices!.length : 0}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Legacy terminals (rows)</dt>
            <dd className="font-medium">
              {Array.isArray(yoco?.legacy_terminals) ? yoco!.legacy_terminals!.length : 0}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-gray-500">Likely ready for terminal payments</dt>
            <dd className="font-medium">{yocoDerived.likely_ready_for_terminal_payments ? "Yes" : "No"}</dd>
          </div>
        </dl>
        {Array.isArray(yoco?.web_pos_devices) && yoco!.web_pos_devices!.length > 0 ? (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 font-medium">Yoco device ID</th>
                  <th className="py-2 pr-3 font-medium">Location</th>
                  <th className="py-2 pr-3 font-medium">Active</th>
                  <th className="py-2 pr-3 font-medium">Last used</th>
                </tr>
              </thead>
              <tbody>
                {yoco!.web_pos_devices!.map((d) => (
                  <tr key={str(d.id)} className="border-b border-gray-100">
                    <td className="py-2 pr-3">{str(d.name)}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{str(d.yoco_device_id)}</td>
                    <td className="py-2 pr-3">{str(d.location_name) || "—"}</td>
                    <td className="py-2 pr-3">{d.is_active === false ? "No" : "Yes"}</td>
                    <td className="py-2 pr-3">
                      {d.last_used ? new Date(String(d.last_used)).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </AdminPanel>

      <AdminPanel>
        <h2 className="text-lg font-semibold text-gray-900">Locations (addresses & coordinates)</h2>
        {locations.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No locations on file.</p>
        ) : (
          <ul className="mt-4 space-y-6">
            {locations.map((loc) => {
              const lat = loc.latitude;
              const lng = loc.longitude;
              const mapHref =
                lat != null &&
                lng != null &&
                String(lat) !== "" &&
                String(lng) !== "" &&
                !Number.isNaN(Number(lat)) &&
                !Number.isNaN(Number(lng))
                  ? `https://www.openstreetmap.org/?mlat=${encodeURIComponent(String(lat))}&mlon=${encodeURIComponent(String(lng))}#map=16/${lat}/${lng}`
                  : null;
              return (
                <li
                  key={str(loc.id)}
                  className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 text-sm"
                >
                  <p className="font-semibold text-gray-900">{str(loc.name) || "Location"}</p>
                  <p className="mt-1 text-gray-700">{formatLocationAddress(loc)}</p>
                  {str(loc.phone) ? <p className="mt-1 text-gray-600">Phone: {str(loc.phone)}</p> : null}
                  <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div>
                      <dt className="text-gray-500">Type</dt>
                      <dd className="font-mono text-xs">{str(loc.location_type) || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Active</dt>
                      <dd>{loc.is_active === false ? "No" : "Yes"}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Latitude</dt>
                      <dd className="font-mono text-xs">{lat != null && String(lat) !== "" ? str(lat) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Longitude</dt>
                      <dd className="font-mono text-xs">{lng != null && String(lng) !== "" ? str(lng) : "—"}</dd>
                    </div>
                  </dl>
                  {mapHref ? (
                    <a
                      href={mapHref}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-sm font-medium text-primary underline"
                    >
                      Open map
                    </a>
                  ) : (
                    <p className="mt-2 text-xs text-amber-800">Coordinates missing — geocoding may not have run.</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </AdminPanel>

      {/* Gamification Panel */}
      <AdminPanel>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Gamification & badges</h2>
          {providerCanonicalId && (
            <button
              type="button"
              className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
              onClick={() => setShowDeduct((v) => !v)}
            >
              {showDeduct ? "Cancel" : "Deduct Points"}
            </button>
          )}
        </div>
        {gamificationQ.isLoading ? (
          <p className="mt-2 text-sm text-gray-400">Loading…</p>
        ) : gamificationQ.data ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: "Current Badge", value: String(gamificationQ.data.badge ?? gamificationQ.data.current_badge ?? gamificationQ.data.tier ?? "—") },
                { label: "Total Points", value: String(gamificationQ.data.total_points ?? gamificationQ.data.points ?? "—") },
                { label: "Lifetime Points", value: String(gamificationQ.data.lifetime_points ?? gamificationQ.data.lifetime_earned ?? "—") },
                { label: "Next Milestone", value: String(gamificationQ.data.next_milestone ?? gamificationQ.data.points_to_next ?? "—") },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">{label}</div>
                  <div className="mt-1 text-xl font-bold text-gray-900">{value}</div>
                </div>
              ))}
            </div>
            {showDeduct && (
              <div className="rounded-lg border border-red-100 bg-red-50 p-4 space-y-3">
                <p className="text-sm font-medium text-red-800">Deduct points from provider</p>
                <div className="flex gap-3">
                  <input
                    type="number"
                    min="1"
                    value={deductPoints}
                    onChange={(e) => setDeductPoints(e.target.value)}
                    placeholder="Points to deduct"
                    className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    value={deductReason}
                    onChange={(e) => setDeductReason(e.target.value)}
                    placeholder="Reason for deduction"
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="button"
                  className="rounded-lg bg-red-700 px-4 py-2 text-sm text-white disabled:opacity-50"
                  disabled={deductPointsMutation.isPending || !deductPoints || parseInt(deductPoints, 10) <= 0}
                  onClick={() => {
                    const pts = parseInt(deductPoints, 10);
                    if (!isNaN(pts) && pts > 0) {
                      deductPointsMutation.mutate({ points: pts, reason: deductReason.trim() || "Admin deduction" });
                      setDeductPoints("");
                      setDeductReason("");
                      setShowDeduct(false);
                    }
                  }}
                >
                  {deductPointsMutation.isPending ? "Processing…" : "Deduct Points"}
                </button>
                {deductPointsMutation.error && (
                  <p className="text-sm text-red-700">{deductPointsMutation.error.message}</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-500">No gamification data available.</p>
        )}
      </AdminPanel>
    </div>
  );
}
