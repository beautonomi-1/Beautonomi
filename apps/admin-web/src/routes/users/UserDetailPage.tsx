import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_USERS_TRUST } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { publicEnv } from "@/config/publicEnv";
import { downloadAdminBlob } from "@/lib/adminCsvDownload";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { adminToast } from "@/lib/adminToast";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";

const SIGNUP_SOURCE_LABELS: Record<string, string> = {
  google: "Google",
  social_instagram: "Instagram",
  social_facebook: "Facebook",
  social_twitter: "X",
  friend_or_family: "Friend or family",
  blog_or_article: "Blog or article",
  app_store: "App Store",
  provider_referral: "Provider referral",
  other: "Other",
};

/** Must match `MANAGEABLE_USER_ROLES` in apps/web `api/admin/users/[id]/role/route.ts`. */
const MANAGEABLE_USER_ROLES = [
  "customer",
  "provider_owner",
  "provider_staff",
  "support_agent",
  "admin_support",
  "admin_finance",
  "admin_trust",
  "admin_content",
  "admin_ecommerce",
  "admin_marketing",
  "admin_integrations",
  "admin_operations",
  "admin_platform_config",
  "superadmin",
] as const;

type ManageableUserRole = (typeof MANAGEABLE_USER_ROLES)[number];

type UserBookingRow = {
  id: string;
  status?: string;
  service_name?: string;
  provider_name?: string;
  scheduled_at?: string;
  total_amount?: number;
  created_at?: string;
};

type WalletTxRow = {
  id: string;
  type?: string;
  amount?: number;
  description?: string | null;
  reference_id?: string | null;
  reference_type?: string | null;
  created_at?: string;
};

type WalletTxResponse = {
  wallet?: { balance: number; currency: string } | null;
  data?: WalletTxRow[];
  meta?: { page: number; limit: number; total: number; has_more: boolean };
};

type UserDetail = Record<string, unknown> & {
  stats?: Record<string, unknown>;
  addresses?: Record<string, unknown>[];
  payment_methods?: Record<string, unknown>[];
  wallet?: Record<string, unknown> | null;
  support_tickets?: Record<string, unknown>[];
  recent_product_orders?: Record<string, unknown>[];
  signup_source?: string | null;
  last_sign_in_at?: string | null;
  last_active_at?: string | null;
  verification?: {
    email_verified?: boolean;
    phone_verified?: boolean;
    identity_verified?: boolean;
    identity_verification_status?: string | null;
  };
};

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function bool(v: unknown): boolean {
  return v === true;
}

function formatSavedAddress(a: Record<string, unknown>): string {
  const parts = [
    a.address_line1,
    a.address_line2,
    [a.city, a.state, a.postal_code].filter(Boolean).join(", "),
    a.country,
  ].filter(Boolean);
  const line = parts.map((p) => str(p)).join(" · ");
  const label = str(a.label);
  return label ? `${label} — ${line || "—"}` : line || "—";
}

export function UserDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { bootstrap } = useAdminSession();
  const isSuperadmin = bootstrap?.isSuperadmin === true;
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_USERS_TRUST, "Users & trust access is required.");
  const [suspendReason, setSuspendReason] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [impersonateReason, setImpersonateReason] = useState("");
  const [roleDraft, setRoleDraft] = useState<ManageableUserRole | "">("");
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpReason, setTopUpReason] = useState("");
  const [showTopUp, setShowTopUp] = useState(false);

  const q = useQuery({
    queryKey: adminQueryKeys.userDetail(id),
    queryFn: () => adminApi.getJson<UserDetail>(`/api/admin/users/${encodeURIComponent(id)}`, { timeoutMs: 60_000 }),
    enabled: allowed && !!id,
  });

  const bookingsQ = useQuery({
    queryKey: adminQueryKeys.userBookings(id),
    queryFn: () =>
      adminApi.getJson<UserBookingRow[]>(`/api/admin/users/${encodeURIComponent(id)}/bookings`, {
        timeoutMs: 60_000,
      }),
    enabled: allowed && !!id,
  });

  const walletTxQ = useQuery({
    queryKey: adminQueryKeys.userWalletTransactions(id),
    queryFn: () =>
      adminApi.getJson<WalletTxResponse>(`/api/admin/users/${encodeURIComponent(id)}/wallet-transactions`, {
        timeoutMs: 60_000,
      }),
    enabled: allowed && !!id,
  });

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminApi.patchJson(`/api/admin/users/${encodeURIComponent(id)}`, body),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.userDetail(id) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.users.all() });
      if ("is_active" in vars) {
        adminToast.success((vars as Record<string, unknown>).is_active ? "User activated" : "User deactivated");
      } else {
        adminToast.success("User updated");
      }
    },
    onError: (e: Error) => adminToast.error(`Failed to update user: ${e.message}`),
  });

  const passwordPut = useMutation({
    mutationFn: (new_password: string) =>
      adminApi.putJson<{ success?: boolean }>(`/api/admin/users/${encodeURIComponent(id)}/password`, {
        new_password,
      }),
    onSuccess: () => {
      setNewPassword("");
      setConfirmPassword("");
      adminToast.success("Password updated successfully");
    },
    onError: (e: Error) => adminToast.error(`Failed to update password: ${e.message}`),
  });

  const rolePut = useMutation({
    mutationFn: (role: ManageableUserRole) =>
      adminApi.putJson<Record<string, unknown>>(`/api/admin/users/${encodeURIComponent(id)}/role`, { role }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.userDetail(id) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.users.all() });
      adminToast.success("User role updated");
    },
    onError: (e: Error) => adminToast.error(`Failed to update role: ${e.message}`),
  });

  const impersonatePost = useMutation({
    mutationFn: (reason: string) =>
      adminApi.postJson<{ success?: boolean; url?: string }>(
        `/api/admin/users/${encodeURIComponent(id)}/impersonate`,
        { reason }
      ),
    onSuccess: () => adminToast.info("Impersonation session started"),
    onError: (e: Error) => adminToast.error(`Impersonation failed: ${e.message}`),
  });

  const identityResetPost = useMutation({
    mutationFn: () =>
      adminApi.postJson(`/api/admin/users/${encodeURIComponent(id)}/identity-verification/reset`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.userDetail(id) });
      adminToast.success("Identity verification reset — user can submit again");
    },
    onError: (e: Error) => adminToast.error(`Failed to reset identity verification: ${e.message}`),
  });

  const walletTopUp = useMutation({
    mutationFn: (payload: { amount: number; reason: string }) =>
      adminApi.postJson(`/api/admin/users/${encodeURIComponent(id)}/wallet-transactions`, {
        type: "credit",
        amount: payload.amount,
        description: payload.reason,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.userWalletTransactions(id) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.userDetail(id) });
      setTopUpAmount("");
      setTopUpReason("");
      setShowTopUp(false);
      adminToast.success("Wallet topped up successfully");
    },
    onError: (e: Error) => adminToast.error(`Wallet top-up failed: ${e.message}`),
  });

  const loyaltyQ = useQuery({
    queryKey: adminQueryKeys.userLoyalty(id),
    queryFn: () => adminApi.getJson<Record<string, unknown>>(`/api/admin/users/${encodeURIComponent(id)}/loyalty`, { timeoutMs: 30_000 }),
    enabled: allowed && !!id,
  });

  const data = q.data;
  const stats = data?.stats ?? {};
  const isSuspended = data?.deactivated_at != null && String(data.deactivated_at).length > 0;
  const currentRole = str(data?.role);

  useEffect(() => {
    if (!isSuspended) setSuspendReason("");
  }, [isSuspended]);

  useEffect(() => {
    if (!data?.role) {
      setRoleDraft("");
      return;
    }
    const r = str(data.role);
    if (MANAGEABLE_USER_ROLES.includes(r as ManageableUserRole)) {
      setRoleDraft(r as ManageableUserRole);
    } else {
      setRoleDraft("");
    }
  }, [data?.role]);

  const customerRatingRows = useMemo(() => {
    if (!data || str(data.role) !== "customer") return [];
    const keys: [string, string][] = [
      ["customer_review_rating_avg", "Avg from written reviews (providers rating customer)"],
      ["customer_review_rating_count", "Written review count"],
      ["customer_booking_rating_avg", "Avg from booking ratings"],
      ["customer_booking_rating_count", "Booking rating count"],
    ];
    return keys.map(([k, label]) => ({ k, label, v: data[k] }));
  }, [data]);

  if (denied) return denied;
  if (!id) return <AdminRetryBlock message="Missing user id" onRetry={() => {}} />;

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="User" />
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

  if (!data) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="User" />
        <AdminPanel>
          <p className="text-sm text-gray-600">User not found.</p>
          <p className="mt-2 text-sm text-gray-500">
            The account may be outside your current tenant scope, or the link contains an invalid user ID.
          </p>
        </AdminPanel>
      </div>
    );
  }

  const displayName = str(data.full_name) || str(data.email) || id;
  const role = str(data.role);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={displayName}
        description={str(data.email)}
        actions={
          <Link
            to={adminSpaTo("/admin/users")}
            className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 shadow-sm ring-1 ring-gray-950/[0.04] hover:bg-gray-50"
          >
            ← Users
          </Link>
        }
      />

      <AdminMutationAlert
        errors={[
          patch.error instanceof Error ? patch.error : null,
          passwordPut.error instanceof Error ? passwordPut.error : null,
          rolePut.error instanceof Error ? rolePut.error : null,
          impersonatePost.error instanceof Error ? impersonatePost.error : null,
          identityResetPost.error instanceof Error ? identityResetPost.error : null,
          bookingsQ.error instanceof Error ? bookingsQ.error : null,
          walletTxQ.error instanceof Error ? walletTxQ.error : null,
          loyaltyQ.error instanceof Error ? loyaltyQ.error : null,
          exportErr ? new Error(exportErr) : null,
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminPanel>
          <h2 className="text-lg font-semibold text-gray-900">Profile</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-gray-500">User ID</dt>
              <dd className="font-mono text-xs break-all">{id}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Role</dt>
              <dd className="font-medium">{role || "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Phone</dt>
              <dd>{str(data.phone) || "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Status</dt>
              <dd>{isSuspended ? <span className="text-red-700">Suspended</span> : "Active"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Created</dt>
              <dd>{data.created_at ? new Date(String(data.created_at)).toLocaleString() : "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Signup source</dt>
              <dd>
                {data.signup_source
                  ? SIGNUP_SOURCE_LABELS[str(data.signup_source)] ?? str(data.signup_source)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Last sign-in (auth)</dt>
              <dd>{data.last_sign_in_at ? new Date(String(data.last_sign_in_at)).toLocaleString() : "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Last active</dt>
              <dd>
                {data.last_active_at
                  ? new Date(String(data.last_active_at)).toLocaleString()
                  : data.last_login_at
                    ? new Date(String(data.last_login_at)).toLocaleString()
                    : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Date of birth</dt>
              <dd>{str(data.date_of_birth) || "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Timezone</dt>
              <dd className="font-mono text-xs">{str(data.timezone) || "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Language / currency</dt>
              <dd>
                {str(data.preferred_language) || "—"} · {str(data.preferred_currency) || "—"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-gray-500">Emergency contact</dt>
              <dd>
                {str(data.emergency_contact_name) || "—"}
                {data.emergency_contact_phone ? ` · ${str(data.emergency_contact_phone)}` : ""}
                {data.emergency_contact_relationship ? ` (${str(data.emergency_contact_relationship)})` : ""}
              </dd>
            </div>
          </dl>
        </AdminPanel>

        <AdminPanel>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Verification</h2>
            <Link
              className="text-sm font-medium text-primary underline"
              to={adminSpaTo("/admin/verifications?status=pending")}
            >
              Open verification queue
            </Link>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-gray-500">Email</dt>
              <dd className={data.verification?.email_verified ? "text-green-700 font-medium" : "text-gray-700"}>
                {data.verification?.email_verified ? "Verified" : "Not verified"}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Phone</dt>
              <dd className={data.verification?.phone_verified ? "text-green-700 font-medium" : "text-gray-700"}>
                {data.verification?.phone_verified ? "Verified" : "Not verified"}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Identity</dt>
              <dd className="font-medium">
                {data.verification?.identity_verified
                  ? "Verified"
                  : str(data.verification?.identity_verification_status) || "Not submitted"}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Identity status</dt>
              <dd>{str(data.verification?.identity_verification_status) || "—"}</dd>
            </div>
          </dl>
          <div className="mt-4">
            <button
              type="button"
              className={adminToolbarButtonClass(identityResetPost.isPending)}
              disabled={identityResetPost.isPending}
              onClick={() => {
                if (
                  !window.confirm(
                    "Reset identity verification for this user? They can submit new documents; history is kept.",
                  )
                ) {
                  return;
                }
                void identityResetPost.mutateAsync();
              }}
            >
              {identityResetPost.isPending ? "Resetting…" : "Reset identity verification"}
            </button>
          </div>
        </AdminPanel>

        <AdminPanel>
          <h2 className="text-lg font-semibold text-gray-900">Activity</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            {Object.keys(stats).length === 0 ? (
              <p className="text-gray-500">No stats for this role.</p>
            ) : (
              Object.entries(stats)
                .filter(([, v]) => v !== null && typeof v !== "object")
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-gray-500">{k.replace(/_/g, " ")}</dt>
                    <dd className="font-medium">{String(v)}</dd>
                  </div>
                ))
            )}
          </dl>
        </AdminPanel>
      </div>

      {role === "customer" ? (
        <AdminPanel>
          <h2 className="text-lg font-semibold text-gray-900">Customer ratings (provider → customer)</h2>
          <p className="mt-1 text-sm text-gray-600">
            Aggregates from review follow-ups and per-booking ratings.{" "}
            <Link className="font-medium text-primary underline" to={adminSpaTo(`/admin/reviews?customer_id=${encodeURIComponent(id)}`)}>
              Reviews mentioning this customer
            </Link>
          </p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            {customerRatingRows.map(({ k, label, v }) => (
              <div key={k}>
                <dt className="text-gray-500">{label}</dt>
                <dd className="font-medium tabular-nums">{v != null && v !== "" ? String(v) : "—"}</dd>
              </div>
            ))}
          </dl>
        </AdminPanel>
      ) : null}

      <AdminPanel>
        <h2 className="text-lg font-semibold text-gray-900">Saved addresses</h2>
        {(data.addresses ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No saved addresses.</p>
        ) : (
          <ul className="mt-4 space-y-4 text-sm">
            {(data.addresses ?? []).map((a) => (
              <li key={str(a.id)} className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                <p className="font-medium text-gray-900">
                  {a.is_default ? "Default · " : ""}
                  {formatSavedAddress(a)}
                </p>
                <dl className="mt-2 grid gap-1 text-xs text-gray-600 sm:grid-cols-2">
                  <div>
                    <dt className="inline text-gray-500">Lat: </dt>
                    <dd className="inline font-mono">{a.latitude != null ? str(a.latitude) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline text-gray-500">Lng: </dt>
                    <dd className="inline font-mono">{a.longitude != null ? str(a.longitude) : "—"}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>

      <AdminPanel>
        <h2 className="text-lg font-semibold text-gray-900">Bookings</h2>
        <p className="mt-1 text-sm text-gray-600">
          Up to 100 bookings in the current tenant scope (customer or linked user id).
        </p>
        {bookingsQ.isLoading ? (
          <p className="mt-4 text-sm text-gray-500">Loading bookings…</p>
        ) : (bookingsQ.data ?? []).length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No bookings found.</p>
        ) : (
          <AdminDataTable className="mt-4">
            <AdminTableHead>
              <tr>
                <AdminTh>When</AdminTh>
                <AdminTh>Service</AdminTh>
                <AdminTh>Provider</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh className="text-right">Total</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {(bookingsQ.data ?? []).map((b) => (
                <tr key={str(b.id)}>
                  <AdminTd>
                    {b.scheduled_at ? new Date(String(b.scheduled_at)).toLocaleString() : "—"}
                  </AdminTd>
                  <AdminTd>{str(b.service_name)}</AdminTd>
                  <AdminTd>{str(b.provider_name)}</AdminTd>
                  <AdminTd>{str(b.status)}</AdminTd>
                  <AdminTd className="text-right tabular-nums">
                    <Link
                      className="font-mono text-xs text-primary underline"
                      to={adminSpaTo(`/admin/bookings/${encodeURIComponent(str(b.id))}`)}
                    >
                      {Number(b.total_amount ?? 0).toFixed(2)}
                    </Link>
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>

      <AdminPanel>
        <h2 className="text-lg font-semibold text-gray-900">Security & export</h2>
        <p className="mt-1 text-sm text-gray-600">
          Set a new password (Supabase Auth). User receives no email from this action.
        </p>
        <div className="mt-4 grid max-w-md gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">New password (min 8 characters)</span>
            <input
              type="password"
              autoComplete="new-password"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Confirm password</span>
            <input
              type="password"
              autoComplete="new-password"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={`self-start ${adminToolbarButtonClass(passwordPut.isPending || patch.isPending)}`}
            disabled={passwordPut.isPending || newPassword.length < 8 || newPassword !== confirmPassword}
            onClick={() => {
              void passwordPut.mutateAsync(newPassword);
            }}
          >
            {passwordPut.isPending ? "Updating…" : "Update password"}
          </button>
        </div>
        <div className="mt-8 border-t border-gray-100 pt-6">
          <h3 className="text-sm font-semibold text-gray-900">Data export</h3>
          <p className="mt-1 text-sm text-gray-600">Download CSV (profile fields and bookings in this tenant).</p>
          <button
            type="button"
            className={`mt-3 ${adminToolbarButtonClass(false)}`}
            onClick={() => {
              setExportErr(null);
              const safe = id.replace(/[^a-zA-Z0-9-]/g, "_").slice(0, 40);
              void downloadAdminBlob(
                `/api/admin/users/${encodeURIComponent(id)}/export`,
                `user-${safe}-export.csv`
              ).catch((e: unknown) => {
                setExportErr(e instanceof Error ? e.message : "Export failed");
              });
            }}
          >
            Download CSV
          </button>
        </div>
      </AdminPanel>

      {isSuperadmin ? (
        <AdminPanel>
          <h2 className="text-lg font-semibold text-gray-900">Superadmin</h2>
          <p className="mt-1 text-sm text-gray-600">
            Role changes and impersonation are audited. Impersonation is rate-limited per hour.
          </p>
          <div className="mt-4 grid gap-4 sm:max-w-md">
            <label className="block text-sm">
              <span className="text-gray-600">Platform role</span>
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={roleDraft}
                disabled={rolePut.isPending}
                onChange={(e) => setRoleDraft(e.target.value as ManageableUserRole | "")}
              >
                {!MANAGEABLE_USER_ROLES.includes(currentRole as ManageableUserRole) ? (
                  <option value="">Select new role…</option>
                ) : null}
                {MANAGEABLE_USER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            {currentRole && !MANAGEABLE_USER_ROLES.includes(currentRole as ManageableUserRole) ? (
              <p className="text-xs text-amber-800">
                Current role <span className="font-mono">{currentRole}</span> is not in the manageable list — choose a
                replacement to save.
              </p>
            ) : null}
            <button
              type="button"
              className={`self-start ${adminToolbarButtonClass(rolePut.isPending)}`}
              disabled={rolePut.isPending || !roleDraft || roleDraft === (currentRole as ManageableUserRole)}
              onClick={() => void rolePut.mutateAsync(roleDraft as ManageableUserRole)}
            >
              {rolePut.isPending ? "Saving role…" : "Save role"}
            </button>
          </div>
          <div className="mt-8 border-t border-gray-100 pt-6">
            <h3 className="text-sm font-semibold text-gray-900">Impersonate user</h3>
            <p className="mt-1 text-sm text-gray-600">
              Opens the main app auth callback as this user. For local dev, set{" "}
              <code className="rounded bg-gray-100 px-1 text-xs">VITE_SITE_URL</code> to your Next.js origin (e.g.{" "}
              <code className="rounded bg-gray-100 px-1 text-xs">http://localhost:3000</code>) so the redirect hits{" "}
              <code className="rounded bg-gray-100 px-1 text-xs">/auth/callback</code>.
            </p>
            <label className="mt-3 block text-sm">
              <span className="text-gray-600">Reason (required, min 3 characters)</span>
              <input
                className="mt-1 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={impersonateReason}
                onChange={(e) => setImpersonateReason(e.target.value)}
                placeholder="Support ticket #…"
              />
            </label>
            <button
              type="button"
              className={`mt-3 ${adminToolbarButtonClass(impersonatePost.isPending)}`}
              disabled={impersonatePost.isPending || impersonateReason.trim().length < 3}
              onClick={() => {
                const reason = impersonateReason.trim();
                void impersonatePost.mutateAsync(reason).then((res) => {
                  const path = res?.url;
                  if (!path || typeof path !== "string") return;
                  const base = (publicEnv.siteUrl || publicEnv.appUrl || "").trim();
                  let href: string;
                  if (base) {
                    try {
                      href = new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
                    } catch {
                      href = path;
                    }
                  } else {
                    href = path;
                  }
                  window.location.assign(href);
                });
              }}
            >
              {impersonatePost.isPending ? "Starting…" : "Impersonate (redirect)"}
            </button>
          </div>
        </AdminPanel>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminPanel>
          <h2 className="text-lg font-semibold text-gray-900">Wallet</h2>
          {data.wallet ? (
            <>
              <dl className="mt-4 text-sm">
                <div>
                  <dt className="text-gray-500">Balance</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {str(data.wallet.currency)} {Number(data.wallet.balance ?? 0).toFixed(2)}
                  </dd>
                </div>
              </dl>
              <h3 className="mt-6 text-sm font-semibold text-gray-900">Recent transactions</h3>
              {walletTxQ.isLoading ? (
                <p className="mt-2 text-sm text-gray-500">Loading ledger…</p>
              ) : (walletTxQ.data?.data ?? []).length === 0 ? (
                <p className="mt-2 text-sm text-gray-500">No wallet movements yet.</p>
              ) : (
                <AdminDataTable className="mt-3">
                  <AdminTableHead>
                    <tr>
                      <AdminTh>When</AdminTh>
                      <AdminTh>Type</AdminTh>
                      <AdminTh className="text-right">Amount</AdminTh>
                      <AdminTh>Reference</AdminTh>
                      <AdminTh>Description</AdminTh>
                    </tr>
                  </AdminTableHead>
                  <AdminTableBody>
                    {(walletTxQ.data?.data ?? []).map((tx) => (
                      <tr key={str(tx.id)}>
                        <AdminTd>
                          {tx.created_at ? new Date(String(tx.created_at)).toLocaleString() : "—"}
                        </AdminTd>
                        <AdminTd className="capitalize">{str(tx.type)}</AdminTd>
                        <AdminTd className="text-right tabular-nums">{Number(tx.amount ?? 0).toFixed(2)}</AdminTd>
                        <AdminTd className="font-mono text-xs">
                          {tx.reference_type ? `${str(tx.reference_type)} ` : ""}
                          {tx.reference_id ? str(tx.reference_id).slice(0, 8) + "…" : "—"}
                        </AdminTd>
                        <AdminTd className="max-w-[220px] truncate">
                          <span title={str(tx.description)}>{str(tx.description) || "—"}</span>
                        </AdminTd>
                      </tr>
                    ))}
                  </AdminTableBody>
                </AdminDataTable>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-gray-500">No wallet record.</p>
          )}
        </AdminPanel>
        <AdminPanel>
          <h2 className="text-lg font-semibold text-gray-900">Payment methods (masked)</h2>
          {(data.payment_methods ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">None on file.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {(data.payment_methods ?? []).map((pm) => (
                <li key={str(pm.id)} className="rounded border border-gray-100 px-3 py-2">
                  <span className="font-medium">{str(pm.type)}</span> · {str(pm.provider)}
                  {pm.last_four != null ? (
                    <span className="text-gray-600"> · •••• {str(pm.last_four)}</span>
                  ) : null}
                  {pm.card_brand ? <span className="text-gray-600"> ({str(pm.card_brand)})</span> : null}
                  {pm.is_default ? <span className="ml-2 text-xs text-primary">default</span> : null}
                  {pm.is_active === false ? <span className="ml-2 text-xs text-amber-800">inactive</span> : null}
                </li>
              ))}
            </ul>
          )}
        </AdminPanel>
      </div>

      {/* Wallet Top-Up */}
      <AdminPanel>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Wallet top-up</h2>
          <button
            type="button"
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
            onClick={() => setShowTopUp((v) => !v)}
          >
            {showTopUp ? "Cancel" : "Top Up Wallet"}
          </button>
        </div>
        {showTopUp && (
          <div className="mt-4 space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm text-gray-700">Amount (R)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  placeholder="e.g. 100.00"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm text-gray-700">Reason</label>
                <input
                  type="text"
                  value={topUpReason}
                  onChange={(e) => setTopUpReason(e.target.value)}
                  placeholder="e.g. Goodwill credit, refund"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <button
              type="button"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              disabled={walletTopUp.isPending || !topUpAmount || parseFloat(topUpAmount) <= 0}
              onClick={() => {
                const amount = parseFloat(topUpAmount);
                if (!isNaN(amount) && amount > 0) {
                  walletTopUp.mutate({ amount, reason: topUpReason.trim() || "Admin top-up" });
                }
              }}
            >
              {walletTopUp.isPending ? "Processing…" : "Credit Wallet"}
            </button>
            {walletTopUp.isSuccess && (
              <p className="text-sm text-green-700">✓ Wallet credited successfully.</p>
            )}
            {walletTopUp.error && (
              <p className="text-sm text-red-600">{walletTopUp.error.message}</p>
            )}
          </div>
        )}
      </AdminPanel>

      {/* Loyalty points (API: balance + transactions) */}
      <AdminPanel>
        <h2 className="text-lg font-semibold text-gray-900">Loyalty points</h2>
        <p className="mt-1 text-sm text-gray-600">Balance and recent ledger rows from the loyalty service.</p>
        {loyaltyQ.isLoading ? (
          <p className="mt-2 text-sm text-gray-400">Loading…</p>
        ) : loyaltyQ.error ? (
          <p className="mt-2 text-sm text-red-600">{loyaltyQ.error.message}</p>
        ) : loyaltyQ.data ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Balance (points)</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
                {String(loyaltyQ.data.balance ?? loyaltyQ.data.points ?? 0)}
              </div>
            </div>
            {Array.isArray(loyaltyQ.data.transactions) && loyaltyQ.data.transactions.length > 0 ? (
              <AdminDataTable className="mt-2">
                <AdminTableHead>
                  <tr>
                    <AdminTh>When</AdminTh>
                    <AdminTh>Type</AdminTh>
                    <AdminTh className="text-right">Points</AdminTh>
                    <AdminTh>Reference</AdminTh>
                    <AdminTh>Description</AdminTh>
                  </tr>
                </AdminTableHead>
                <AdminTableBody>
                  {(loyaltyQ.data.transactions as Record<string, unknown>[]).map((row) => (
                    <tr key={str(row.id)}>
                      <AdminTd>
                        {row.created_at ? new Date(String(row.created_at)).toLocaleString() : "—"}
                      </AdminTd>
                      <AdminTd className="capitalize">{str(row.transaction_type)}</AdminTd>
                      <AdminTd className="text-right tabular-nums">{str(row.points)}</AdminTd>
                      <AdminTd className="font-mono text-xs">
                        {row.reference_type ? `${str(row.reference_type)} ` : ""}
                        {row.reference_id ? String(row.reference_id).slice(0, 10) : "—"}
                      </AdminTd>
                      <AdminTd className="max-w-[240px] truncate">
                        <span title={str(row.description)}>{str(row.description) || "—"}</span>
                      </AdminTd>
                    </tr>
                  ))}
                </AdminTableBody>
              </AdminDataTable>
            ) : (
              <p className="text-sm text-gray-500">No loyalty transactions yet.</p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-500">No loyalty data available.</p>
        )}
      </AdminPanel>

      <AdminPanel>
        <h2 className="text-lg font-semibold text-gray-900">Support tickets</h2>
        {(data.support_tickets ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No tickets for this user in this tenant context.</p>
        ) : (
          <AdminDataTable className="mt-4">
            <AdminTableHead>
              <tr>
                <AdminTh>Ticket</AdminTh>
                <AdminTh>Subject</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Created</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {(data.support_tickets ?? []).map((t) => (
                <tr key={str(t.id)}>
                  <AdminTd>
                    <Link
                      className="font-mono text-xs text-primary underline"
                      to={adminSpaTo(`/admin/support-tickets/${encodeURIComponent(str(t.id))}`)}
                    >
                      {str(t.ticket_number)}
                    </Link>
                  </AdminTd>
                  <AdminTd>{str(t.subject)}</AdminTd>
                  <AdminTd>{str(t.status)}</AdminTd>
                  <AdminTd>
                    {t.created_at ? new Date(String(t.created_at)).toLocaleString() : "—"}
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>

      {role === "customer" ? (
        <AdminPanel>
          <h2 className="text-lg font-semibold text-gray-900">Recent product orders</h2>
          <p className="mt-1 text-sm text-gray-600">
            <Link className="font-medium text-primary underline" to={adminSpaTo("/admin/ecommerce/orders")}>
              Open all orders
            </Link>
          </p>
          {(data.recent_product_orders ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No product orders in this tenant.</p>
          ) : (
            <AdminDataTable className="mt-4">
              <AdminTableHead>
                <tr>
                  <AdminTh>Order</AdminTh>
                  <AdminTh>Provider</AdminTh>
                  <AdminTh>Status</AdminTh>
                  <AdminTh>Payment</AdminTh>
                  <AdminTh>Total</AdminTh>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {(data.recent_product_orders ?? []).map((o) => {
                  const oid = str(o.id);
                  const prov = o.provider as { business_name?: string } | undefined;
                  return (
                    <tr key={oid}>
                      <AdminTd>
                        <Link
                          className="font-mono text-xs text-primary underline"
                          to={adminSpaTo(`/admin/ecommerce/orders/${encodeURIComponent(oid)}`)}
                        >
                          {str(o.order_number ?? oid)}
                        </Link>
                      </AdminTd>
                      <AdminTd>{prov?.business_name ?? "—"}</AdminTd>
                      <AdminTd>{str(o.status)}</AdminTd>
                      <AdminTd>{str(o.payment_status)}</AdminTd>
                      <AdminTd className="tabular-nums">{Number(o.total_amount ?? 0).toFixed(2)}</AdminTd>
                    </tr>
                  );
                })}
              </AdminTableBody>
            </AdminDataTable>
          )}
        </AdminPanel>
      ) : null}

      <AdminPanel>
        <h2 className="text-lg font-semibold text-gray-900">Notification preferences</h2>
        <div className="mt-4 flex flex-col gap-3 text-sm">
          {(
            [
              ["email_notifications_enabled", "Email"],
              ["sms_notifications_enabled", "SMS"],
              ["push_notifications_enabled", "Push"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={bool(data[key])}
                disabled={patch.isPending}
                onChange={(e) =>
                  void patch.mutateAsync({
                    [key]: e.target.checked,
                  })
                }
              />
              {label}
            </label>
          ))}
        </div>
      </AdminPanel>

      <AdminPanel>
        <h2 className="text-lg font-semibold text-gray-900">Account controls</h2>
        {isSuspended ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-gray-600">
              Suspended{data.deactivation_reason ? `: ${str(data.deactivation_reason)}` : ""}
            </p>
            <button
              type="button"
              className={adminToolbarButtonClass(patch.isPending)}
              disabled={patch.isPending}
              onClick={() => void patch.mutateAsync({ deactivated_at: null, deactivation_reason: null })}
            >
              Reactivate account
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block text-sm text-gray-700">Reason (optional)</label>
            <input
              className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="Suspension reason"
            />
            <button
              type="button"
              className={adminToolbarButtonClass(patch.isPending)}
              disabled={patch.isPending}
              onClick={() =>
                void patch.mutateAsync({
                  deactivated_at: new Date().toISOString(),
                  deactivation_reason: suspendReason.trim() || null,
                })
              }
            >
              Suspend account
            </button>
          </div>
        )}
      </AdminPanel>
    </div>
  );
}
