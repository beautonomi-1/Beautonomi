import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { ProviderDetail, str, OWNERSHIP_STATUS_LABELS, TERMINAL_VENDOR_LABELS } from "./types";

type Props = {
  id: string;
  providerCanonicalId: string;
  row: ProviderDetail;
  canOpenLifecycle: boolean;
  canOpenVerifications: boolean;
};

type OverrideDraft = {
  commission_override: string;
  is_featured: boolean;
  priority: string;
};

export function ProviderOverviewTab({
  id,
  providerCanonicalId,
  row,
  canOpenLifecycle,
  canOpenVerifications,
}: Props) {
  const qc = useQueryClient();
  const { canAccess } = useAdminSession();
  const canEditDetails = canAccess(ADMIN_SECTION_PROVIDERS_OPERATIONS);

  const [draft, setDraft] = useState({
    business_name: str(row.business_name),
    email: str(row.email),
    phone: str(row.phone),
    description: str(row.description),
    business_type: str(row.business_type),
  });

  const [overrideDraft, setOverrideDraft] = useState<OverrideDraft>({
    commission_override: row.commission_override != null ? String(row.commission_override) : "",
    is_featured: Boolean(row.is_featured),
    priority: row.priority != null ? String(row.priority) : "0",
  });

  useEffect(() => {
    setDraft({
      business_name: str(row.business_name),
      email: str(row.email),
      phone: str(row.phone),
      description: str(row.description),
      business_type: str(row.business_type),
    });
    setOverrideDraft({
      commission_override: row.commission_override != null ? String(row.commission_override) : "",
      is_featured: Boolean(row.is_featured),
      priority: row.priority != null ? String(row.priority) : "0",
    });
  }, [row]);

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

  const saveOverrides = useMutation({
    mutationFn: () =>
      adminApi.putJson(`/api/admin/providers/${encodeURIComponent(providerCanonicalId)}/overrides`, {
        commission_override:
          overrideDraft.commission_override.trim() !== ""
            ? Number(overrideDraft.commission_override)
            : null,
        is_featured: overrideDraft.is_featured,
        priority: Number(overrideDraft.priority) || 0,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providers.detail(id) });
      adminToast.success("Overrides saved");
    },
    onError: (e: Error) => adminToast.error(`Failed to save overrides: ${e.message}`),
  });

  const locations = Array.isArray(row.locations) ? row.locations : [];
  const staffCount = Array.isArray(row.staff) ? row.staff.length : 0;
  const offeringsCount = Array.isArray(row.offerings) ? row.offerings.length : 0;
  const stats = row.stats;
  const tp = row.terminal_profile;

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
      {/* Verification card */}
      {(canOpenLifecycle || canOpenVerifications) && providerCanonicalId ? (
        <AdminPanel className="space-y-3">
          <h2 className="text-base font-semibold text-gray-900">Verification</h2>
          <p className="text-sm text-gray-600">
            Identity review (KYC) and marketplace verified badge are managed separately.
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

      {/* Account snapshot */}
      <AdminPanel>
        <h2 className="text-base font-semibold text-gray-900">Account snapshot</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Slug", value: str(row.slug) || "—", mono: true },
            { label: "Status", value: str(row.status) || "—" },
            { label: "Created", value: row.created_at ? new Date(String(row.created_at)).toLocaleDateString() : "—" },
            { label: "Last updated", value: row.updated_at ? new Date(String(row.updated_at)).toLocaleDateString() : "—" },
            { label: "Bookings", value: String(stats?.booking_count ?? "—") },
            { label: "Reviews", value: String(stats?.review_count ?? "—") },
            { label: "Avg rating", value: stats?.average_rating != null ? Number(stats.average_rating).toFixed(2) : "—" },
            { label: "Catalog", value: `${locations.length} loc · ${staffCount} staff · ${offeringsCount} svc` },
          ].map(({ label, value, mono }) => (
            <div key={label} className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
              <dd className={`mt-1 text-sm text-gray-900 ${mono ? "font-mono" : ""}`}>{value}</dd>
            </div>
          ))}
        </dl>
      </AdminPanel>

      {/* Business details + owner */}
      <div className="grid gap-6 lg:grid-cols-3">
        <AdminPanel className="lg:col-span-2">
          <h2 className="text-base font-semibold text-gray-900">Business details</h2>
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
                className="mt-1 w-full min-h-[90px] rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              />
            </label>
          </div>
          <button
            type="button"
            className={`mt-4 ${adminToolbarButtonClass(save.isPending)}`}
            disabled={save.isPending || !canEditDetails}
            onClick={() => void save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save changes"}
          </button>
        </AdminPanel>

        <AdminPanel>
          <h2 className="text-base font-semibold text-gray-900">Owner</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-gray-500">Name</dt>
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
            {row.owner?.email && (
              <div>
                <dt className="text-gray-500">Email</dt>
                <dd className="font-mono text-xs">{row.owner.email}</dd>
              </div>
            )}
            {row.owner?.phone && (
              <div>
                <dt className="text-gray-500">Phone</dt>
                <dd>{row.owner.phone}</dd>
              </div>
            )}
            <div>
              <dt className="text-gray-500">Reviews</dt>
              <dd>
                <Link
                  className="text-sm font-medium text-primary underline"
                  to={adminSpaTo(`/admin/reviews?provider_id=${encodeURIComponent(id)}`)}
                >
                  View all reviews →
                </Link>
              </dd>
            </div>
          </dl>
        </AdminPanel>
      </div>

      {/* Signup & onboarding details */}
      <AdminPanel>
        <h2 className="text-base font-semibold text-gray-900">Signup &amp; onboarding details</h2>
        <p className="mt-1 text-sm text-gray-600">
          Information captured during sign-up — booking platform, team structure, and business model.
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Team size", value: str(row.team_size) || "—" },
            { label: "Business type", value: str(row.business_type) || "—" },
            {
              label: "Previous software",
              value:
                str(row.previous_software) === "other"
                  ? str(row.previous_software_other) || "Other (unspecified)"
                  : str(row.previous_software) || "—",
            },
            {
              label: "Payment terminal",
              value: tp?.terminal_ownership_status
                ? (OWNERSHIP_STATUS_LABELS[tp.terminal_ownership_status] ?? tp.terminal_ownership_status)
                : "—",
            },
            {
              label: "Terminal vendor",
              value: tp?.terminal_provider
                ? (TERMINAL_VENDOR_LABELS[tp.terminal_provider] ?? tp.terminal_provider)
                : "—",
            },
            { label: "Terminal count", value: str(tp?.terminal_count_range)?.replace(/_/g, " ") || "—" },
            {
              label: "Interest in platform terminal",
              value: tp?.interested_in_platform_terminal || "—",
            },
            { label: "Payroll type", value: str(row.payroll_type) || "—" },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
              <dd className="mt-1 text-sm capitalize text-gray-900">{value}</dd>
            </div>
          ))}
        </dl>
      </AdminPanel>

      {/* Platform overrides */}
      {canEditDetails && providerCanonicalId ? (
        <AdminPanel>
          <h2 className="text-base font-semibold text-gray-900">Platform overrides</h2>
          <p className="mt-1 text-sm text-gray-600">
            Commission rate, featured listing, and search priority. Changes affect provider ranking
            and platform fees immediately.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="text-gray-600">Commission override (%)</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="Default (no override)"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={overrideDraft.commission_override}
                onChange={(e) =>
                  setOverrideDraft((d) => ({ ...d, commission_override: e.target.value }))
                }
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Search priority</span>
              <input
                type="number"
                min="0"
                step="1"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={overrideDraft.priority}
                onChange={(e) => setOverrideDraft((d) => ({ ...d, priority: e.target.value }))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm pt-6">
              <input
                type="checkbox"
                className="rounded"
                checked={overrideDraft.is_featured}
                onChange={(e) =>
                  setOverrideDraft((d) => ({ ...d, is_featured: e.target.checked }))
                }
              />
              <span className="text-gray-700 font-medium">Featured listing</span>
            </label>
          </div>
          <button
            type="button"
            className={`mt-4 ${adminToolbarButtonClass(saveOverrides.isPending)}`}
            disabled={saveOverrides.isPending}
            onClick={() => void saveOverrides.mutate()}
          >
            {saveOverrides.isPending ? "Saving…" : "Save overrides"}
          </button>
        </AdminPanel>
      ) : null}

      {/* Locations */}
      <AdminPanel>
        <h2 className="text-base font-semibold text-gray-900">Locations</h2>
        {locations.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No locations on file.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {locations.map((loc) => {
              const lat = loc.latitude;
              const lng = loc.longitude;
              const mapHref =
                lat != null && lng != null && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng))
                  ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`
                  : null;
              return (
                <li
                  key={str(loc.id)}
                  className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 text-sm"
                >
                  <p className="font-semibold text-gray-900">{str(loc.name) || "Location"}</p>
                  <p className="mt-1 text-gray-700">{formatLocationAddress(loc)}</p>
                  {str(loc.phone) ? <p className="mt-1 text-gray-600">Phone: {str(loc.phone)}</p> : null}
                  <dl className="mt-2 grid gap-2 sm:grid-cols-3 text-xs">
                    <div><dt className="text-gray-500">Type</dt><dd className="font-mono">{str(loc.location_type) || "—"}</dd></div>
                    <div><dt className="text-gray-500">Active</dt><dd>{loc.is_active === false ? "No" : "Yes"}</dd></div>
                    <div>
                      <dt className="text-gray-500">Coordinates</dt>
                      <dd className="font-mono">
                        {lat != null && lng != null ? `${str(lat)}, ${str(lng)}` : "—"}
                      </dd>
                    </div>
                  </dl>
                  {mapHref ? (
                    <a
                      href={mapHref}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-sm font-medium text-primary underline"
                    >
                      Open map →
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
    </div>
  );
}
