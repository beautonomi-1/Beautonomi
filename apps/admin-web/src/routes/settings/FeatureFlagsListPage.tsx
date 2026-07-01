import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToast } from "@/lib/adminToast";
import { adminToolbarButtonClass } from "@/lib/adminUi";
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

type FlagRow = {
  id: string;
  feature_key?: string;
  feature_name: string;
  category?: string;
  enabled: boolean;
  description?: string;
  tenant_id?: string | null;
  rollout_percent?: number | null;
  platforms_allowed?: string[] | null;
  roles_allowed?: string[] | null;
  min_app_version?: string | null;
  environments_allowed?: string[] | null;
};

const PLATFORM_OPTIONS = ["web", "customer", "provider"];
const ENVIRONMENT_OPTIONS = ["production", "staging", "development"];

/** Compact human summary of a flag's advanced targeting, or null when fully default (all users). */
function targetingSummary(r: FlagRow): string | null {
  const parts: string[] = [];
  if (r.rollout_percent != null && r.rollout_percent < 100) parts.push(`rollout ${r.rollout_percent}%`);
  if (r.platforms_allowed?.length) parts.push(`platforms: ${r.platforms_allowed.join(", ")}`);
  if (r.roles_allowed?.length) parts.push(`roles: ${r.roles_allowed.join(", ")}`);
  if (r.environments_allowed?.length) parts.push(`envs: ${r.environments_allowed.join(", ")}`);
  if (r.min_app_version) parts.push(`min app ${r.min_app_version}`);
  return parts.length ? parts.join(" · ") : null;
}

const FLAG_CATEGORIES = [
  "booking",
  "payments",
  "ecommerce",
  "provider",
  "marketing",
  "platform",
  "ai",
  "experimental",
  "rollout",
];

/**
 * Flag keys that exist in the DB but have NO runtime reader in application code.
 * The DB row is inert; the feature is controlled by a different mechanism.
 * Displayed as a muted badge so operators are not misled.
 */
const UNWIRED_FLAG_KEYS: Record<string, string> = {
  "verification.sumsub.enabled":
    "Not enforced in code — Sumsub is toggled via Control plane → Integrations → Sumsub",
  "verification.sumsub.required_for_payouts":
    "Not enforced in code — payout eligibility is controlled separately",
  provider_verification:
    "Not enforced in code — provider KYC state is managed via the verifications queue",
  payment_stripe:
    "Not enforced in code — Stripe is not the processor. Online card payments are gated by payment_paystack.",
};

/**
 * Normalise the category field so that legacy `'payment'` (singular, from migration 092)
 * is grouped with the canonical `'payments'` (plural, from later migrations).
 * The DB migration 721 already backfills this, but we keep the SPA defensive.
 */
function normaliseCategory(cat: string | undefined | null): string {
  if (!cat) return "Uncategorised";
  const lower = cat.toLowerCase();
  return lower === "payment" ? "payments" : lower;
}

/**
 * Whether a category should display the "Effective (web / provider)" resolver preview.
 * Covers the normalised value so both 'payment' and 'payments' rows see it.
 */
function isPaymentCategory(cat: string | undefined | null): boolean {
  const n = normaliseCategory(cat);
  return n === "payments";
}

function defaultForm(): FormState {
  return {
    feature_key: "",
    feature_name: "",
    category: "",
    description: "",
    enabled: true,
    tenant_id: "",
    rollout_percent: 100,
    platforms_allowed: [],
    roles_allowed: "",
    min_app_version: "",
    environments_allowed: [],
  };
}

/** Build an edit form pre-populated from an existing flag row. */
function formFromRow(r: FlagRow): FormState {
  return {
    feature_key: r.feature_key ?? "",
    feature_name: r.feature_name ?? "",
    category: r.category ?? "",
    description: r.description ?? "",
    enabled: r.enabled,
    tenant_id: r.tenant_id ?? "",
    rollout_percent: r.rollout_percent ?? 100,
    platforms_allowed: r.platforms_allowed ?? [],
    roles_allowed: (r.roles_allowed ?? []).join(", "),
    min_app_version: r.min_app_version ?? "",
    environments_allowed: r.environments_allowed ?? [],
  };
}

type FormState = {
  feature_key: string;
  feature_name: string;
  category: string;
  description: string;
  enabled: boolean;
  tenant_id: string;
  rollout_percent: number;
  platforms_allowed: string[];
  roles_allowed: string;
  min_app_version: string;
  environments_allowed: string[];
};

/** Convert form targeting fields into the API payload shape (arrays or null, trimmed). */
function targetingPayload(form: FormState) {
  const roles = form.roles_allowed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    rollout_percent: form.rollout_percent,
    platforms_allowed: form.platforms_allowed.length ? form.platforms_allowed : null,
    roles_allowed: roles.length ? roles : null,
    min_app_version: form.min_app_version.trim() || null,
    environments_allowed: form.environments_allowed.length ? form.environments_allowed : null,
  };
}

function AdvancedTargetingFields({
  form,
  onChange,
}: {
  form: FormState;
  onChange: (updater: (f: FormState) => FormState) => void;
}) {
  const toggleInArray = (key: "platforms_allowed" | "environments_allowed", value: string) =>
    onChange((f) => {
      const set = new Set(f[key]);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...f, [key]: Array.from(set) };
    });

  return (
    <div className="space-y-4 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Advanced targeting <span className="font-normal normal-case text-gray-400">(applied by the resolver)</span>
      </p>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Rollout %</label>
        <input
          type="number"
          min={0}
          max={100}
          value={form.rollout_percent}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            onChange((f) => ({ ...f, rollout_percent: Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 100 }));
          }}
          className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
        <p className="mt-1 text-xs text-gray-400">100 = everyone. Lower values bucket users deterministically by ID.</p>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Platforms allowed</label>
        <div className="flex flex-wrap gap-3">
          {PLATFORM_OPTIONS.map((p) => (
            <label key={p} className="flex items-center gap-1.5 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.platforms_allowed.includes(p)}
                onChange={() => toggleInArray("platforms_allowed", p)}
                className="accent-gray-900"
              />
              {p}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-400">None checked = all platforms.</p>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Environments allowed</label>
        <div className="flex flex-wrap gap-3">
          {ENVIRONMENT_OPTIONS.map((env) => (
            <label key={env} className="flex items-center gap-1.5 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.environments_allowed.includes(env)}
                onChange={() => toggleInArray("environments_allowed", env)}
                className="accent-gray-900"
              />
              {env}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-400">None checked = all environments.</p>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Roles allowed</label>
        <input
          type="text"
          value={form.roles_allowed}
          onChange={(e) => onChange((f) => ({ ...f, roles_allowed: e.target.value }))}
          placeholder="comma-separated, e.g. customer, provider_owner"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
        <p className="mt-1 text-xs text-gray-400">Blank = all roles.</p>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Minimum app version</label>
        <input
          type="text"
          value={form.min_app_version}
          onChange={(e) => onChange((f) => ({ ...f, min_app_version: e.target.value }))}
          placeholder="e.g. 1.4.0"
          className="w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-gray-500 focus:outline-none"
        />
        <p className="mt-1 text-xs text-gray-400">Blank = no minimum. Compared as semver for native apps.</p>
      </div>
    </div>
  );
}

export function FeatureFlagsListPage() {
  useAdminDocumentTitle("Feature Flags");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PLATFORM_CONFIG,
    "Platform configuration access is required."
  );
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [editRow, setEditRow] = useState<FlagRow | null>(null);
  const [editForm, setEditForm] = useState<FormState>(defaultForm());

  const q = useQuery({
    queryKey: adminQueryKeys.featureFlags(),
    queryFn: async () => {
      const res = await adminApi.getJson<{ data?: FlagRow[]; error?: unknown } | FlagRow[]>(
        "/api/admin/feature-flags",
        { timeoutMs: 60_000 }
      );
      // API can return { data: [...] } or plain array
      if (Array.isArray(res)) return res;
      if (res && typeof res === "object" && "data" in res && Array.isArray(res.data)) return res.data;
      return [];
    },
    enabled: allowed,
  });

  const effectivePreviewQ = useQuery({
    queryKey: [...adminQueryKeys.featureFlags(), "effective-preview"],
    enabled: allowed,
    queryFn: async () => {
      const [webRes, providerRes] = await Promise.all([
        adminApi.postJson<{ resolved?: Record<string, { enabled?: boolean }> }>(
          "/api/admin/control-plane/flags-preview",
          { platform: "web" },
        ),
        adminApi.postJson<{ resolved?: Record<string, { enabled?: boolean }> }>(
          "/api/admin/control-plane/flags-preview",
          { platform: "provider" },
        ),
      ]);
      return {
        web: webRes.resolved ?? {},
        provider: providerRes.resolved ?? {},
      };
    },
    staleTime: 60_000,
  });

  const rows: FlagRow[] = (Array.isArray(q.data) ? q.data : []).filter((r) =>
    !search ||
    r.feature_name.toLowerCase().includes(search.toLowerCase()) ||
    (r.feature_key ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (r.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const invalidate = () => void qc.invalidateQueries({ queryKey: adminQueryKeys.featureFlags() });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminApi.postJson("/api/admin/feature-flags", body),
    onSuccess: () => {
      adminToast.success("Feature flag created");
      setShowCreate(false);
      setForm(defaultForm());
      invalidate();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to create flag"),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      adminApi.patchJson(`/api/admin/feature-flags/${id}`, { enabled }),
    onSuccess: () => invalidate(),
    onError: (err: Error) => adminToast.error(err.message || "Failed to toggle flag"),
  });

  const editMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      adminApi.patchJson(`/api/admin/feature-flags/${id}`, body),
    onSuccess: () => {
      adminToast.success("Feature flag updated");
      setEditRow(null);
      invalidate();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to update flag"),
  });

  const openEdit = (r: FlagRow) => {
    setEditRow(r);
    setEditForm(formFromRow(r));
  };

  const submitEdit = () => {
    if (!editRow) return;
    editMut.mutate({
      id: editRow.id,
      body: {
        feature_name: editForm.feature_name.trim(),
        description: editForm.description || null,
        enabled: editForm.enabled,
        category: editForm.category || null,
        ...targetingPayload(editForm),
      },
    });
  };

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/feature-flags/${id}`),
    onSuccess: () => {
      adminToast.success("Feature flag deleted");
      invalidate();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to delete flag"),
  });

  // Group by normalised category (collapses legacy 'payment' into 'payments')
  const byCategory: Record<string, FlagRow[]> = {};
  for (const flag of rows) {
    const cat = normaliseCategory(flag.category);
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(flag);
  }

  if (denied) return denied;
  if (q.isLoading)
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Feature flags" />
        <AdminPanel><AdminPageSkeleton rows={5} /></AdminPanel>
      </div>
    );
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Feature flags"
        description="Toggle features on/off per tenant or globally. Toggles take effect immediately."
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              className={adminToolbarButtonClass(q.isFetching)}
              disabled={q.isFetching}
              onClick={() => void q.refetch()}
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => { setForm(defaultForm()); setShowCreate(true); }}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              + New flag
            </button>
          </div>
        }
      />

      <p className="text-sm text-gray-600">
        <Link to={adminSpaTo("/admin/control-plane/feature-flags")} className="font-medium text-gray-900 underline">
          Control plane tools (preview &amp; resolver) →
        </Link>
        {" · "}
        <Link to={adminSpaTo("/admin/paystack-terminal")} className="font-medium text-gray-900 underline">
          Paystack Terminal ops →
        </Link>
      </p>
      <p className="text-xs text-gray-500">
        The <strong>Enabled</strong> toggle is the raw database value. For payment flags, <strong>Effective</strong> shows
        what provider web (<code className="rounded bg-gray-100 px-1">platform=web</code>) and native app (
        <code className="rounded bg-gray-100 px-1">platform=provider</code>) actually receive after tenant merge and platform filters.
      </p>

      {/* Search */}
      <input
        type="search"
        placeholder="Search flags…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
      />

      {/* Create modal */}
      <AdminModal open={showCreate} title="Create feature flag" onClose={() => setShowCreate(false)} footer={null}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Feature key *</label>
              <input
                type="text"
                value={form.feature_key}
                onChange={(e) => setForm((f) => ({ ...f, feature_key: e.target.value.toLowerCase().replace(/\s+/g, "_") }))}
                placeholder="e.g. enable_express_booking"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-gray-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-400">Use snake_case. This is the key used in code.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Display name *</label>
              <input
                type="text"
                value={form.feature_name}
                onChange={(e) => setForm((f) => ({ ...f, feature_name: e.target.value }))}
                placeholder="e.g. Express Booking"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              >
                <option value="">No category</option>
                {FLAG_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What does this flag control?"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                className="accent-gray-900"
              />
              Enabled
            </label>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Tenant ID <span className="font-normal text-gray-400">(leave blank for global default)</span>
              </label>
              <input
                type="text"
                value={form.tenant_id}
                onChange={(e) => setForm((f) => ({ ...f, tenant_id: e.target.value.trim() }))}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-gray-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-400">
                When set, this row overrides the global flag for that tenant only.
              </p>
            </div>
            <AdvancedTargetingFields form={form} onChange={setForm} />
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">Cancel</button>
              <button
                type="button"
                disabled={createMut.isPending || !form.feature_key.trim() || !form.feature_name.trim()}
                onClick={() => createMut.mutate({
                  feature_key: form.feature_key.trim(),
                  feature_name: form.feature_name.trim(),
                  category: form.category || null,
                  description: form.description || null,
                  enabled: form.enabled,
                  tenant_id: form.tenant_id.trim() || null,
                  ...targetingPayload(form),
                })}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {createMut.isPending ? "Creating…" : "Create flag"}
              </button>
            </div>
          </div>
      </AdminModal>

      {/* Edit modal */}
      <AdminModal
        open={editRow != null}
        title={editRow ? `Edit: ${editRow.feature_key ?? editRow.feature_name}` : "Edit feature flag"}
        onClose={() => setEditRow(null)}
        footer={null}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Display name *</label>
            <input
              type="text"
              value={editForm.feature_name}
              onChange={(e) => setEditForm((f) => ({ ...f, feature_name: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
            <select
              value={editForm.category}
              onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            >
              <option value="">No category</option>
              {FLAG_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea
              rows={2}
              value={editForm.description}
              onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={editForm.enabled}
              onChange={(e) => setEditForm((f) => ({ ...f, enabled: e.target.checked }))}
              className="accent-gray-900"
            />
            Enabled
          </label>
          {editRow?.tenant_id ? (
            <p className="text-xs text-indigo-700">
              Editing tenant override <span className="font-mono">{editRow.tenant_id}</span>.
            </p>
          ) : (
            <p className="text-xs text-gray-500">Editing the global default row.</p>
          )}
          <AdvancedTargetingFields form={editForm} onChange={setEditForm} />
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => setEditRow(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">Cancel</button>
            <button
              type="button"
              disabled={editMut.isPending || !editForm.feature_name.trim()}
              onClick={submitEdit}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {editMut.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </AdminModal>

      {rows.length === 0 && !search ? (
        <EmptyState
          title="No flags"
          action={
            <button type="button" onClick={() => setShowCreate(true)} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
              + New flag
            </button>
          }
        />
      ) : rows.length === 0 ? (
        <AdminPanel><p className="text-sm text-gray-400 py-4 text-center">No flags matching "{search}"</p></AdminPanel>
      ) : (
        Object.entries(byCategory).sort(([a], [b]) => a.localeCompare(b)).map(([cat, flags]) => (
          <div key={cat}>
            <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{cat}</h3>
            <AdminDataTable>
              <AdminTableHead>
                <tr>
                  <AdminTh>Feature</AdminTh>
                  <AdminTh>Description</AdminTh>
                  <AdminTh>Scope</AdminTh>
                  <AdminTh>Enabled</AdminTh>
                  {isPaymentCategory(cat) ? <AdminTh>Effective (web / provider)</AdminTh> : null}
                  <AdminTh>Actions</AdminTh>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {flags.map((r) => {
                  const unwiredNote = r.feature_key ? UNWIRED_FLAG_KEYS[r.feature_key] : undefined;
                  const targeting = targetingSummary(r);
                  return (
                  <tr key={r.id}>
                    <AdminTd>
                      <div className="font-mono text-xs font-medium text-gray-900">{r.feature_key ?? r.feature_name}</div>
                      {r.feature_key && r.feature_name !== r.feature_key && (
                        <div className="text-xs text-gray-400">{r.feature_name}</div>
                      )}
                      {targeting ? (
                        <span
                          title="Advanced targeting is applied by the resolver"
                          className="mt-1 inline-block rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 ring-1 ring-sky-200"
                        >
                          {targeting}
                        </span>
                      ) : null}
                      {unwiredNote ? (
                        <span
                          title={unwiredNote}
                          className="mt-1 ml-1 inline-block cursor-help rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200"
                        >
                          Not enforced in code
                        </span>
                      ) : null}
                    </AdminTd>
                    <AdminTd className="max-w-xs text-xs text-gray-500">
                      {r.description ?? "—"}
                      {unwiredNote ? (
                        <p className="mt-1 text-[10px] text-amber-600">{unwiredNote}</p>
                      ) : null}
                    </AdminTd>
                    <AdminTd className="text-xs">{r.tenant_id ? "Tenant" : "Global"}</AdminTd>
                    <AdminTd>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={r.enabled}
                        disabled={toggleMut.isPending}
                        onClick={() => toggleMut.mutate({ id: r.id, enabled: !r.enabled })}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${r.enabled ? "bg-indigo-600" : "bg-gray-200"}`}
                      >
                        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition ${r.enabled ? "translate-x-4" : "translate-x-0"}`} />
                      </button>
                    </AdminTd>
                    {isPaymentCategory(cat) ? (
                      <AdminTd className="text-xs">
                        {r.feature_key ? (
                          <>
                            <span className={effectivePreviewQ.data?.web[r.feature_key]?.enabled ? "text-emerald-700" : "text-gray-400"}>
                              web: {effectivePreviewQ.data?.web[r.feature_key]?.enabled ? "on" : "off"}
                            </span>
                            {" · "}
                            <span className={effectivePreviewQ.data?.provider[r.feature_key]?.enabled ? "text-emerald-700" : "text-gray-400"}>
                              provider: {effectivePreviewQ.data?.provider[r.feature_key]?.enabled ? "on" : "off"}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </AdminTd>
                    ) : null}
                    <AdminTd>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(r)}
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={deleteMut.isPending}
                          onClick={() => { if (confirm(`Delete flag "${r.feature_key ?? r.feature_name}"? This may break features that rely on it.`)) deleteMut.mutate(r.id); }}
                          className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </AdminTd>
                  </tr>
                  );
                })}
              </AdminTableBody>
            </AdminDataTable>
          </div>
        ))
      )}
    </div>
  );
}
