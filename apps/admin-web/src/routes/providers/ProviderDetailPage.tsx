import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDER_OPS, ADMIN_SECTION_PROVIDERS_OPERATIONS, ADMIN_SECTION_USERS_TRUST } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { adminToast } from "@/lib/adminToast";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { cn } from "@/lib/cn";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { ProviderBankAccountModal } from "./ProviderBankAccountModal";

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
  is_verified?: boolean;
  slug?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  staff?: unknown[] | null;
  offerings?: unknown[] | null;
  owner?: { id?: string; full_name?: string | null; email?: string | null; phone?: string | null } | null;
  stats?: { booking_count?: number; review_count?: number; average_rating?: number };
  locations?: Record<string, unknown>[];
  yoco_summary?: {
    integration?: {
      enabled?: boolean;
      connected_at?: string | null;
      last_sync?: string | null;
      has_public_key?: boolean;
      has_secret_key?: boolean;
      credential_mode?: "none" | "checkout" | "oauth";
      environment?: "sandbox" | "live";
      oauth_token_present?: boolean;
      oauth_token?: {
        expires_at?: string | null;
        refresh_expires_at?: string | null;
        last_refreshed_at?: string | null;
        last_refresh_error?: string | null;
        business_id?: string | null;
        business_name?: string | null;
        user_email?: string | null;
      } | null;
    } | null;
    web_pos_devices?: Record<string, unknown>[];
    legacy_terminals?: Record<string, unknown>[];
    derived?: Record<string, unknown>;
  };
};

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

/** Admin gamification GET returns nested badge objects — never String() them. */
type GamificationBadgeRow = {
  id?: string;
  name?: string | null;
  slug?: string | null;
  tier?: number | null;
  icon_url?: string | null;
  description?: string | null;
  color?: string | null;
};

type GamificationPayload = {
  total_points?: number;
  lifetime_points?: number;
  current_badge?: GamificationBadgeRow | GamificationBadgeRow[] | null;
  badge_earned_at?: string | null;
  last_calculated_at?: string | null;
  progress_to_next_badge?: {
    next_badge?: GamificationBadgeRow | null;
    points_needed?: number;
    progress_percent?: number;
  } | null;
  milestones?: { id?: string; milestone_type?: string; achieved_at?: string; metadata?: Record<string, unknown> | null }[];
  recent_transactions?: {
    id?: string;
    points?: number;
    source?: string;
    description?: string | null;
    created_at?: string;
  }[];
};

function normalizeBadge(b: GamificationPayload["current_badge"]): GamificationBadgeRow | null {
  if (b == null) return null;
  if (Array.isArray(b)) return (b[0] as GamificationBadgeRow) ?? null;
  return b as GamificationBadgeRow;
}

function formatPoints(n: unknown): string {
  if (n == null || n === "") return "—";
  const num = typeof n === "number" ? n : Number(n);
  if (Number.isNaN(num)) return "—";
  return num.toLocaleString();
}

function formatNextBadgeProgress(p: GamificationPayload["progress_to_next_badge"]): { headline: string; detail: string } {
  if (!p?.next_badge) {
    return { headline: "Top tier", detail: "No higher badge configured, or max tier reached." };
  }
  const name = p.next_badge.name || p.next_badge.slug || "Next badge";
  const needed = p.points_needed ?? 0;
  const pct = p.progress_percent ?? 0;
  return {
    headline: `${name} · ${needed.toLocaleString()} pts to go`,
    detail: `${pct}% of points required for next tier`,
  };
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
  const { canAccess, bootstrap } = useAdminSession();
  const canOpenLifecycle = canAccess(ADMIN_SECTION_PROVIDER_OPS);
  const canOpenVerifications = canAccess(ADMIN_SECTION_USERS_TRUST);

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
  const [showAddBankAccount, setShowAddBankAccount] = useState(false);
  const [showYocoSupport, setShowYocoSupport] = useState(false);
  const [yocoSupportForm, setYocoSupportForm] = useState({
    environment: "live" as "live" | "sandbox",
    is_enabled: true,
    public_key: "",
    secret_key: "",
    webhook_secret: "",
    credential_mode: "checkout" as "none" | "checkout" | "oauth",
    clear_checkout_credentials: false,
    reset_reconnect_banner: true,
  });

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
      adminApi.getJson<GamificationPayload>(
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
    setYocoSupportForm((f) => ({
      ...f,
      environment: d.yoco_summary?.integration?.environment === "sandbox" ? "sandbox" : "live",
      is_enabled: d.yoco_summary?.integration?.enabled ?? true,
      credential_mode: d.yoco_summary?.integration?.credential_mode ?? "checkout",
    }));
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

  const verifyProvider = useMutation({
    mutationFn: (verified: boolean) =>
      adminApi.patchJson(`/api/admin/providers/${encodeURIComponent(providerCanonicalId || id)}/verify`, {
        verified,
      }),
    onSuccess: async (_data, verified) => {
      await qc.invalidateQueries({ queryKey: adminQueryKeys.providers.detail(id) });
      await qc.invalidateQueries({ queryKey: adminQueryKeys.providers.all() });
      await qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
      await qc.invalidateQueries({ queryKey: adminQueryKeys.navCounts() });
      adminToast.success(verified ? "Provider verified" : "Verification removed");
    },
    onError: (e: Error) => adminToast.error(`Failed to update verification: ${e.message}`),
  });

  const updateYocoSupport = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        environment: yocoSupportForm.environment,
        is_enabled: yocoSupportForm.is_enabled,
        credential_mode: yocoSupportForm.credential_mode,
        clear_checkout_credentials: yocoSupportForm.clear_checkout_credentials,
        reset_reconnect_banner: yocoSupportForm.reset_reconnect_banner,
      };
      if (yocoSupportForm.public_key.trim()) payload.public_key = yocoSupportForm.public_key.trim();
      if (yocoSupportForm.secret_key.trim()) payload.secret_key = yocoSupportForm.secret_key.trim();
      if (yocoSupportForm.webhook_secret.trim()) payload.webhook_secret = yocoSupportForm.webhook_secret.trim();
      return adminApi.patchJson(`/api/admin/providers/${encodeURIComponent(providerCanonicalId || id)}/yoco`, payload);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminQueryKeys.providers.detail(id) });
      setYocoSupportForm((f) => ({
        ...f,
        public_key: "",
        secret_key: "",
        webhook_secret: "",
        clear_checkout_credentials: false,
      }));
      adminToast.success("Provider Yoco settings updated");
    },
    onError: (e: Error) => adminToast.error(`Failed to update Yoco settings: ${e.message}`),
  });

  const disconnectYocoOauth = useMutation({
    mutationFn: () =>
      adminApi.postJson(`/api/admin/providers/${encodeURIComponent(providerCanonicalId || id)}/yoco`, {
        action: "disconnect_oauth",
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminQueryKeys.providers.detail(id) });
      adminToast.success("Yoco OAuth tokens disconnected");
    },
    onError: (e: Error) => adminToast.error(`Failed to disconnect Yoco OAuth: ${e.message}`),
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
  const staffCount = Array.isArray(row.staff) ? row.staff.length : 0;
  const offeringsCount = Array.isArray(row.offerings) ? row.offerings.length : 0;
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
            {str(row.status) === "active" && row.is_verified !== true ? (
              <button
                type="button"
                className="rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                disabled={verifyProvider.isPending}
                onClick={() => verifyProvider.mutate(true)}
              >
                Verify
              </button>
            ) : null}
            {row.is_verified === true ? (
              <button
                type="button"
                className="rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                disabled={verifyProvider.isPending}
                onClick={() => {
                  if (confirm(`Remove verified badge for ${business}?`)) verifyProvider.mutate(false);
                }}
              >
                Unverify
              </button>
            ) : null}
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
          updateYocoSupport.error instanceof Error ? updateYocoSupport.error : null,
          disconnectYocoOauth.error instanceof Error ? disconnectYocoOauth.error : null,
        ]}
      />

      {(canOpenLifecycle || canOpenVerifications) && providerCanonicalId ? (
        <AdminPanel className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Verification</h2>
          <p className="text-sm text-gray-600">
            Identity review (KYC) and the marketplace verified badge are managed separately. Use the links below for
            approve/reject and badge toggles.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {row.is_verified === true ? (
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                Marketplace badge: verified
              </span>
            ) : (
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
                Marketplace badge: not verified
              </span>
            )}
            {canOpenLifecycle ? (
              <Link
                to={adminSpaTo(`/admin/provider-ops/providers/${encodeURIComponent(providerCanonicalId)}`)}
                className="text-sm font-medium text-primary hover:underline"
              >
                Provider Ops lifecycle →
              </Link>
            ) : null}
            {canOpenVerifications ? (
              <Link
                to={adminSpaTo("/admin/verifications?status=pending")}
                className="text-sm font-medium text-primary hover:underline"
              >
                Verifications queue →
              </Link>
            ) : null}
          </div>
        </AdminPanel>
      ) : null}

      <AdminPanel>
        <h2 className="text-lg font-semibold text-gray-900">Provider overview</h2>
        <p className="mt-1 text-sm text-gray-600">
          Quick snapshot of this account — use it alongside bookings, reviews, and gamification below.
        </p>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Slug</dt>
            <dd className="mt-1 font-mono text-sm text-gray-900">{str(row.slug) || "—"}</dd>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Created</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {row.created_at ? new Date(String(row.created_at)).toLocaleString() : "—"}
            </dd>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Last updated</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {row.updated_at ? new Date(String(row.updated_at)).toLocaleString() : "—"}
            </dd>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Catalog</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {locations.length} location{locations.length === 1 ? "" : "s"} · {staffCount} staff · {offeringsCount}{" "}
              service{offeringsCount === 1 ? "" : "s"}
            </dd>
          </div>
        </dl>
      </AdminPanel>

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
        <h2 className="text-lg font-semibold text-gray-900">Signup &amp; onboarding details</h2>
        <p className="mt-1 text-sm text-gray-600">
          Information captured during provider sign-up — booking platform, team structure, and business model.
        </p>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Team size</dt>
            <dd className="mt-1 text-sm capitalize text-gray-900">{str(row.team_size) || "—"}</dd>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Business type</dt>
            <dd className="mt-1 text-sm capitalize text-gray-900">{str(row.business_type) || "—"}</dd>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Previous software</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {str(row.previous_software) === "other"
                ? str(row.previous_software_other) || "Other (unspecified)"
                : str(row.previous_software) || "—"}
            </dd>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Yoco machine</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {str(row.yoco_machine) === "other"
                ? str(row.yoco_machine_other) || "Other"
                : str(row.yoco_machine) || "—"}
            </dd>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Payroll type</dt>
            <dd className="mt-1 text-sm capitalize text-gray-900">{str(row.payroll_type) || "—"}</dd>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Locations</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {locations.length > 0
                ? `${locations.length} registered`
                : "No locations"}
            </dd>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Staff count</dt>
            <dd className="mt-1 text-sm text-gray-900">{staffCount > 0 ? staffCount : "Solo / none"}</dd>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Services listed</dt>
            <dd className="mt-1 text-sm text-gray-900">{offeringsCount}</dd>
          </div>
        </dl>
      </AdminPanel>

      <AdminPanel>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Payout accounts</h2>
            <p className="mt-1 text-sm text-gray-600">
              Bank / transfer recipients on file for payouts (masked account details).
            </p>
          </div>
          {providerCanonicalId && (
            <button
              type="button"
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
              onClick={() => setShowAddBankAccount(true)}
            >
              Add bank account
            </button>
          )}
        </div>
        {providerCanonicalId && (
          <ProviderBankAccountModal
            open={showAddBankAccount}
            onClose={() => setShowAddBankAccount(false)}
            providerId={providerCanonicalId}
          />
        )}
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Yoco terminals & integration</h2>
            <p className="mt-1 text-sm text-gray-600">
              Operational view from stored integration and device rows (not a live ping to Yoco). Web POS on{" "}
              <code className="rounded bg-gray-100 px-1 text-xs">api.yoco.com</code> requires OAuth; dashboard keys are
              checkout-only.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={adminSpaTo("/admin/integrations/yoco")}
              className="shrink-0 text-sm font-medium text-primary underline"
            >
              Yoco setup (admin) →
            </Link>
            {bootstrap?.isSuperadmin ? (
              <button
                type="button"
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                onClick={() => setShowYocoSupport((v) => !v)}
              >
                {showYocoSupport ? "Hide support controls" : "Support controls"}
              </button>
            ) : null}
          </div>
        </div>
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
            <dt className="text-gray-500">Credential mode (stored)</dt>
            <dd className="font-medium">
              {yoco?.integration?.credential_mode === "oauth"
                ? "oauth (Web POS JWT)"
                : yoco?.integration?.credential_mode === "checkout"
                  ? "checkout (hosted checkout keys only)"
                  : "none / unknown"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Yoco environment</dt>
            <dd className="font-medium">{yoco?.integration?.environment === "sandbox" ? "sandbox" : "live"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">OAuth token row (this env)</dt>
            <dd className="font-medium">{yoco?.integration?.oauth_token_present ? "Present" : "Not stored"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">OAuth business</dt>
            <dd className="font-medium">
              {yoco?.integration?.oauth_token?.business_name ||
                yoco?.integration?.oauth_token?.business_id ||
                "—"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">OAuth token expires</dt>
            <dd className="font-medium">
              {yoco?.integration?.oauth_token?.expires_at
                ? new Date(String(yoco.integration.oauth_token.expires_at)).toLocaleString()
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">OAuth refresh error</dt>
            <dd className={cn("font-medium", yoco?.integration?.oauth_token?.last_refresh_error ? "text-red-700" : "")}>
              {yoco?.integration?.oauth_token?.last_refresh_error || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Has secret key (Checkout API)</dt>
            <dd className="font-medium">{yoco?.integration?.has_secret_key ? "Yes" : "No"}</dd>
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
            {yocoDerived.has_virtual_checkout_devices_only ? (
              <p className="mt-1 text-xs text-amber-700">
                Active devices look like hosted-checkout placeholders only — provider needs{" "}
                <strong>Connect Yoco (OAuth)</strong> for real Web POS terminals. See admin Yoco setup.
              </p>
            ) : null}
          </div>
        </dl>
        {bootstrap?.isSuperadmin && showYocoSupport ? (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h3 className="text-sm font-semibold text-amber-950">Superadmin Yoco support controls</h3>
            <p className="mt-1 text-sm text-amber-900">
              Use this for audited support recovery. Providers should normally self-connect OAuth and paste hosted
              checkout keys in their own settings.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-gray-700">
                Environment
                <select
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  value={yocoSupportForm.environment}
                  onChange={(event) =>
                    setYocoSupportForm((f) => ({
                      ...f,
                      environment: event.target.value === "sandbox" ? "sandbox" : "live",
                    }))
                  }
                >
                  <option value="live">live</option>
                  <option value="sandbox">sandbox</option>
                </select>
              </label>
              <label className="text-sm font-medium text-gray-700">
                Credential mode
                <select
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  value={yocoSupportForm.credential_mode}
                  onChange={(event) =>
                    setYocoSupportForm((f) => ({
                      ...f,
                      credential_mode: event.target.value as "none" | "checkout" | "oauth",
                    }))
                  }
                >
                  <option value="none">none</option>
                  <option value="checkout">checkout (hosted checkout)</option>
                  <option value="oauth">oauth (Web POS)</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={yocoSupportForm.is_enabled}
                  onChange={(event) => setYocoSupportForm((f) => ({ ...f, is_enabled: event.target.checked }))}
                />
                Integration enabled
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={yocoSupportForm.reset_reconnect_banner}
                  onChange={(event) =>
                    setYocoSupportForm((f) => ({ ...f, reset_reconnect_banner: event.target.checked }))
                  }
                />
                Reset reconnect banner
              </label>
              <label className="text-sm font-medium text-gray-700">
                Public key (optional)
                <input
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-sm"
                  value={yocoSupportForm.public_key}
                  placeholder={yoco?.integration?.has_public_key ? "Set (hidden)" : "pk_live_..."}
                  onChange={(event) => setYocoSupportForm((f) => ({ ...f, public_key: event.target.value }))}
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Secret key for hosted checkout
                <input
                  type="password"
                  autoComplete="off"
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-sm"
                  value={yocoSupportForm.secret_key}
                  placeholder={yoco?.integration?.has_secret_key ? "Set (hidden)" : "sk_live_..."}
                  onChange={(event) => setYocoSupportForm((f) => ({ ...f, secret_key: event.target.value }))}
                />
              </label>
              <label className="text-sm font-medium text-gray-700 md:col-span-2">
                Webhook secret for hosted checkout
                <input
                  type="password"
                  autoComplete="off"
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-sm"
                  value={yocoSupportForm.webhook_secret}
                  placeholder="whsec_..."
                  onChange={(event) => setYocoSupportForm((f) => ({ ...f, webhook_secret: event.target.value }))}
                />
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-red-800 md:col-span-2">
                <input
                  type="checkbox"
                  checked={yocoSupportForm.clear_checkout_credentials}
                  onChange={(event) =>
                    setYocoSupportForm((f) => ({ ...f, clear_checkout_credentials: event.target.checked }))
                  }
                />
                Clear hosted checkout credentials
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                className={adminToolbarButtonClass(updateYocoSupport.isPending)}
                disabled={updateYocoSupport.isPending}
                onClick={() => updateYocoSupport.mutate()}
              >
                {updateYocoSupport.isPending ? "Saving..." : "Save Yoco settings"}
              </button>
              <button
                type="button"
                className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                disabled={disconnectYocoOauth.isPending || !yoco?.integration?.oauth_token_present}
                onClick={() => {
                  if (window.confirm("Disconnect this provider's Yoco OAuth tokens? They must reconnect for Web POS.")) {
                    disconnectYocoOauth.mutate();
                  }
                }}
              >
                {disconnectYocoOauth.isPending ? "Disconnecting..." : "Disconnect OAuth tokens"}
              </button>
            </div>
          </div>
        ) : null}
        {Array.isArray(yoco?.web_pos_devices) && yoco!.web_pos_devices!.length > 0 ? (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 font-medium">Yoco device ID</th>
                  <th className="py-2 pr-3 font-medium">Charge mode</th>
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
                    <td className="py-2 pr-3 text-xs">
                      {d.credential_mode === "virtual_checkout"
                        ? "virtual_checkout"
                        : d.credential_mode === "web_pos"
                          ? "web_pos"
                          : "—"}
                    </td>
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Gamification & badges</h2>
            <p className="mt-1 text-sm text-gray-600">
              Points, current tier badge, and progress toward the next badge (same data the provider sees in-app).
            </p>
          </div>
          {providerCanonicalId && (
            <button
              type="button"
              className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
              onClick={() => setShowDeduct((v) => !v)}
            >
              {showDeduct ? "Cancel" : "Deduct Points"}
            </button>
          )}
        </div>
        {gamificationQ.isLoading ? (
          <p className="mt-4 text-sm text-gray-400">Loading gamification…</p>
        ) : gamificationQ.data ? (
          (() => {
            const g = gamificationQ.data;
            const badge = normalizeBadge(g.current_badge);
            const next = formatNextBadgeProgress(g.progress_to_next_badge);
            const milestones = g.milestones ?? [];
            const txs = g.recent_transactions ?? [];

            return (
              <div className="mt-4 space-y-6">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="text-xs text-gray-500">Total points</div>
                    <div className="mt-1 text-xl font-bold tabular-nums text-gray-900">{formatPoints(g.total_points)}</div>
                    <p className="mt-1 text-[11px] text-gray-500">Current balance (can go down after deductions)</p>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="text-xs text-gray-500">Lifetime points</div>
                    <div className="mt-1 text-xl font-bold tabular-nums text-gray-900">{formatPoints(g.lifetime_points)}</div>
                    <p className="mt-1 text-[11px] text-gray-500">Earned all-time (never decreases)</p>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="text-xs text-gray-500">Next badge</div>
                    <div className="mt-1 text-sm font-semibold leading-snug text-gray-900">{next.headline}</div>
                    <p className="mt-1 text-[11px] text-gray-500">{next.detail}</p>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="text-xs text-gray-500">Recalculated</div>
                    <div className="mt-1 text-sm font-medium text-gray-900">
                      {g.last_calculated_at ? new Date(String(g.last_calculated_at)).toLocaleString() : "—"}
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500">Badge earned:{" "}
                      {g.badge_earned_at ? new Date(String(g.badge_earned_at)).toLocaleDateString() : "—"}
                    </p>
                  </div>
                </div>

                <div
                  className={cn(
                    "overflow-hidden rounded-xl border border-gray-200",
                    badge?.color ? "" : "bg-white",
                  )}
                  style={
                    badge?.color
                      ? { borderColor: `${badge.color}55`, background: `linear-gradient(135deg, ${badge.color}14 0%, white 48%)` }
                      : undefined
                  }
                >
                  <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
                    {badge?.icon_url ? (
                      <img
                        src={String(badge.icon_url)}
                        alt=""
                        className="h-16 w-16 shrink-0 rounded-lg border border-gray-200 bg-white object-contain"
                      />
                    ) : (
                      <div
                        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-100 text-lg font-bold text-gray-600"
                        style={badge?.color ? { backgroundColor: `${badge.color}22`, borderColor: `${badge.color}44` } : undefined}
                      >
                        {badge?.name?.charAt(0) ?? "?"}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Current badge</p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">
                        {badge?.name ?? "No badge yet"}
                      </p>
                      <p className="mt-0.5 text-sm text-gray-600">
                        {[badge?.slug ? `Slug: ${badge.slug}` : null, badge?.tier != null ? `Tier ${badge.tier}` : null]
                          .filter(Boolean)
                          .join(" · ") || "Assigns when point rules and recalculation run."}
                      </p>
                      {badge?.description ? (
                        <p className="mt-2 text-sm leading-relaxed text-gray-700">{badge.description}</p>
                      ) : !badge ? (
                        <p className="mt-2 text-sm text-gray-500">No badge row linked — provider may be new or below the first tier threshold.</p>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Recent point transactions</h3>
                    {txs.length === 0 ? (
                      <p className="mt-2 text-sm text-gray-500">No transactions yet.</p>
                    ) : (
                      <AdminDataTable className="mt-2">
                        <AdminTableHead>
                          <tr>
                            <AdminTh>When</AdminTh>
                            <AdminTh>Points</AdminTh>
                            <AdminTh>Source</AdminTh>
                            <AdminTh className="hidden sm:table-cell">Note</AdminTh>
                          </tr>
                        </AdminTableHead>
                        <AdminTableBody>
                          {txs.map((t) => (
                            <tr key={str(t.id)}>
                              <AdminTd className="whitespace-nowrap text-xs">
                                {t.created_at ? new Date(String(t.created_at)).toLocaleString() : "—"}
                              </AdminTd>
                              <AdminTd className={cn("font-medium tabular-nums", (t.points ?? 0) < 0 ? "text-red-700" : "text-gray-900")}>
                                {(t.points ?? 0) > 0 ? "+" : ""}
                                {t.points ?? "—"}
                              </AdminTd>
                              <AdminTd className="font-mono text-xs">{str(t.source)}</AdminTd>
                              <AdminTd className="hidden max-w-[12rem] truncate text-xs text-gray-600 sm:table-cell">
                                {str(t.description) || "—"}
                              </AdminTd>
                          </tr>
                          ))}
                        </AdminTableBody>
                      </AdminDataTable>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Milestones</h3>
                    {milestones.length === 0 ? (
                      <p className="mt-2 text-sm text-gray-500">No milestones recorded.</p>
                    ) : (
                      <ul className="mt-2 space-y-2 text-sm">
                        {milestones.slice(0, 12).map((m) => (
                          <li
                            key={str(m.id)}
                            className="flex items-start justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2"
                          >
                            <span className="font-medium text-gray-800">{str(m.milestone_type).replace(/_/g, " ")}</span>
                            <span className="shrink-0 text-xs text-gray-500">
                              {m.achieved_at ? new Date(String(m.achieved_at)).toLocaleDateString() : "—"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {showDeduct && (
                  <div className="rounded-lg border border-red-100 bg-red-50 p-4 space-y-3">
                    <p className="text-sm font-medium text-red-800">Deduct points from provider</p>
                    <p className="text-xs text-red-700/90">
                      Creates a negative transaction. Total points decrease; lifetime points are not reduced by deductions.
                    </p>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <input
                        type="number"
                        min="1"
                        value={deductPoints}
                        onChange={(e) => setDeductPoints(e.target.value)}
                        placeholder="Points"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm sm:w-32"
                      />
                      <input
                        type="text"
                        value={deductReason}
                        onChange={(e) => setDeductReason(e.target.value)}
                        placeholder="Reason (shown on transaction)"
                        className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
            );
          })()
        ) : (
          <p className="mt-4 text-sm text-gray-500">No gamification data available.</p>
        )}
      </AdminPanel>
    </div>
  );
}
