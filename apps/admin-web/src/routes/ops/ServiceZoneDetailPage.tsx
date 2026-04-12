import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Globe, Send, XCircle, MapPin, BarChart3 } from "lucide-react";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { ADMIN_SECTION_OPERATIONS } from "@beautonomi/admin-access";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
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
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import { AdminModal } from "@/components/admin/AdminModal";
import { adminToast } from "@/lib/adminToast";
import { ServiceZoneMapEditor } from "@/components/maps/ServiceZoneMapEditor";
import type { ZoneBbox } from "@/components/maps/serviceZoneMapGeo";

type AreaRow = {
  id: string;
  type?: string;
  ref_code?: string;
  ref_name?: string;
  created_at?: string;
};

type ZoneDetail = {
  id: string;
  name?: string;
  country_code?: string;
  status?: string;
  version?: number;
  created_at?: string;
  updated_at?: string;
  published_at?: string | null;
  ops_metadata?: Record<string, unknown>;
  inclusions: AreaRow[];
  exclusions: AreaRow[];
  geometry_geojson?: unknown;
  bbox?: unknown;
  centroid?: unknown;
  fragment_count?: number;
  disconnected_fragments?: boolean;
};

type RolloutSummary = {
  postal_area_count: number;
  cities: string[];
  provinces: string[];
  towns: string[];
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800",
  active: "bg-green-100 text-green-800",
  archived: "bg-gray-100 text-gray-600",
};

const AREA_TYPES = [
  { value: "province", label: "Province" },
  { value: "city", label: "City" },
  { value: "town", label: "Town" },
  { value: "postal_code", label: "Postal code" },
  { value: "country", label: "Country (all areas)" },
];

export function ServiceZoneDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  useAdminDocumentTitle("Zone detail");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_OPERATIONS,
    "Operations access is required for service zones."
  );

  const [showAddInclusion, setShowAddInclusion] = useState(false);
  const [inclusionForm, setInclusionForm] = useState({ type: "city", ref_code: "", ref_name: "" });

  const [showAddExclusion, setShowAddExclusion] = useState(false);
  const [exclusionForm, setExclusionForm] = useState({ type: "postal_code" as string, postal_code: "" });

  const zoneQuery = useQuery({
    queryKey: adminQueryKeys.serviceZoneDetail(id!),
    queryFn: () => adminApi.getJson<ZoneDetail>(`/api/admin/service-zones/${id}`, { timeoutMs: 60_000 }),
    enabled: allowed && !!id,
  });

  const rolloutQuery = useQuery({
    queryKey: adminQueryKeys.serviceZoneRollout(id!),
    queryFn: () => adminApi.getJson<RolloutSummary>(`/api/admin/service-zones/${id}/rollout-summary`, { timeoutMs: 60_000 }),
    enabled: allowed && !!id,
  });

  const zone = zoneQuery.data;

  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: adminQueryKeys.serviceZoneDetail(id!) });
    void qc.invalidateQueries({ queryKey: adminQueryKeys.serviceZoneRollout(id!) });
    void qc.invalidateQueries({ queryKey: adminQueryKeys.serviceZones("active") });
    void qc.invalidateQueries({ queryKey: adminQueryKeys.serviceZones("archived") });
  };

  const addInclusionMut = useMutation({
    mutationFn: (body: { type: string; ref_code: string; ref_name?: string }) =>
      adminApi.postJson<{ included: number; message?: string }>(`/api/admin/service-zones/${id}/include`, body),
    onSuccess: (res) => {
      adminToast.success(`Added ${res.included} area(s)`);
      setShowAddInclusion(false);
      setInclusionForm({ type: "city", ref_code: "", ref_name: "" });
      invalidateAll();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const removeInclusionMut = useMutation({
    mutationFn: (inclusionId: string) =>
      adminApi.deleteJson(`/api/admin/service-zones/${id}/inclusions/${inclusionId}`),
    onSuccess: () => {
      adminToast.success("Inclusion removed");
      invalidateAll();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const addExclusionMut = useMutation({
    mutationFn: (body: { type: string; postal_code?: string }) =>
      adminApi.postJson(`/api/admin/service-zones/${id}/exclude`, body),
    onSuccess: () => {
      adminToast.success("Exclusion added");
      setShowAddExclusion(false);
      setExclusionForm({ type: "postal_code", postal_code: "" });
      invalidateAll();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const removeExclusionMut = useMutation({
    mutationFn: (exclusionId: string) =>
      adminApi.deleteJson(`/api/admin/service-zones/${id}/exclusions/${exclusionId}`),
    onSuccess: () => {
      adminToast.success("Exclusion removed");
      invalidateAll();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const publishMut = useMutation({
    mutationFn: (action: "publish" | "unpublish") => {
      if (action === "publish") {
        return adminApi.postJson(`/api/admin/service-zones/${id}/publish`, {});
      }
      return adminApi.patchJson(`/api/admin/service-zones/${id}`, { status: "draft" });
    },
    onSuccess: (_, action) => {
      adminToast.success(action === "publish" ? "Zone published" : "Zone unpublished");
      invalidateAll();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  if (denied) return denied;
  if (zoneQuery.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Zone detail" />
        <AdminPanel><AdminPageSkeleton rows={5} /></AdminPanel>
      </div>
    );
  }
  if (zoneQuery.error) {
    if (isAdminApiAuthFailure(zoneQuery.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={zoneQuery.error.message} onRetry={() => void zoneQuery.refetch()} />;
  }
  if (!zone) {
    return <AdminRetryBlock message="Zone not found" onRetry={() => void zoneQuery.refetch()} />;
  }

  const isActive = zone.status === "active";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={zone.name ?? "Unnamed zone"}
        description={
          <Link to="/service-zones" className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to zones
          </Link>
        }
        actions={
          <div className="flex gap-2">
            {isActive ? (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                disabled={publishMut.isPending}
                onClick={() => {
                  if (confirm("Unpublish this zone? It will revert to draft status.")) {
                    publishMut.mutate("unpublish");
                  }
                }}
              >
                <XCircle className="h-4 w-4" />
                {publishMut.isPending ? "Saving…" : "Unpublish"}
              </button>
            ) : (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                disabled={publishMut.isPending}
                onClick={() => {
                  if (confirm("Publish this zone? It will go live and auto-enroll qualifying providers.")) {
                    publishMut.mutate("publish");
                  }
                }}
              >
                <Send className="h-4 w-4" />
                {publishMut.isPending ? "Publishing…" : "Publish"}
              </button>
            )}
          </div>
        }
      />

      <AdminMutationAlert
        errors={[
          addInclusionMut.error instanceof Error ? addInclusionMut.error : null,
          addExclusionMut.error instanceof Error ? addExclusionMut.error : null,
          publishMut.error instanceof Error ? publishMut.error : null,
        ]}
      />

      {/* Zone info header */}
      <AdminPanel>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <InfoItem label="Status">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[zone.status ?? ""] ?? "bg-gray-100 text-gray-600"}`}>
              {zone.status ?? "—"}
            </span>
          </InfoItem>
          <InfoItem label="Country">
            <span className="inline-flex items-center gap-1">
              <Globe className="h-3.5 w-3.5 text-gray-400" />
              {zone.country_code ?? "—"}
            </span>
          </InfoItem>
          <InfoItem label="Version">{zone.version ?? "—"}</InfoItem>
          <InfoItem label="Created">{zone.created_at ? new Date(zone.created_at).toLocaleDateString() : "—"}</InfoItem>
          <InfoItem label="Published">{zone.published_at ? new Date(zone.published_at).toLocaleDateString() : "Never"}</InfoItem>
          <InfoItem label="Updated">{zone.updated_at ? new Date(zone.updated_at).toLocaleDateString() : "—"}</InfoItem>
          <InfoItem label="Geometry">{zone.geometry_geojson ? "Yes" : "None"}</InfoItem>
          <InfoItem label="Fragments">{zone.fragment_count ?? 0}{zone.disconnected_fragments ? " (disconnected)" : ""}</InfoItem>
        </div>
      </AdminPanel>

      {/* Zone map */}
      <AdminPanel>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <MapPin className="h-4 w-4 text-indigo-600" />
          Zone coverage map
        </h3>
        <ServiceZoneMapEditor
          zoneId={id!}
          zoneVersion={zone.version}
          geometryGeojson={zone.geometry_geojson}
          zoneBbox={zone.bbox as ZoneBbox}
          zoneCentroid={zone.centroid}
          disconnectedFragments={Boolean(zone.disconnected_fragments)}
          countryCode={zone.country_code}
          allowEdits={!isActive}
          className="min-h-[380px]"
          onCoverageUpdated={invalidateAll}
        />
      </AdminPanel>

      {/* Included areas */}
      <AdminPanel>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <MapPin className="h-4 w-4 text-green-600" />
            Included areas ({zone.inclusions.length})
          </h3>
          <button
            type="button"
            className={adminToolbarButtonClass(false) + " inline-flex items-center gap-1.5"}
            onClick={() => setShowAddInclusion(true)}
          >
            <Plus className="h-4 w-4" />
            Add area
          </button>
        </div>
        {zone.inclusions.length === 0 ? (
          <EmptyState title="No included areas" description="Add provinces, cities, or postal codes to define this zone's coverage." />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Name</AdminTh>
                <AdminTh>Type</AdminTh>
                <AdminTh>Code</AdminTh>
                <AdminTh>Added</AdminTh>
                <AdminTh />
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {zone.inclusions.map((inc) => (
                <tr key={inc.id}>
                  <AdminTd className="max-w-xs truncate font-medium">{inc.ref_name ?? "—"}</AdminTd>
                  <AdminTd>
                    <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {inc.type ?? "—"}
                    </span>
                  </AdminTd>
                  <AdminTd className="text-xs tabular-nums">{inc.ref_code ?? "—"}</AdminTd>
                  <AdminTd className="text-xs text-gray-500">{inc.created_at ? new Date(inc.created_at).toLocaleDateString() : "—"}</AdminTd>
                  <AdminTd>
                    <button
                      type="button"
                      className="text-red-600 hover:text-red-800 disabled:opacity-50"
                      disabled={removeInclusionMut.isPending}
                      title="Remove inclusion"
                      onClick={() => {
                        if (confirm(`Remove inclusion "${inc.ref_name ?? inc.ref_code}"?`)) {
                          removeInclusionMut.mutate(inc.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>

      {/* Excluded areas */}
      <AdminPanel>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <XCircle className="h-4 w-4 text-red-500" />
            Excluded areas ({zone.exclusions.length})
          </h3>
          <button
            type="button"
            className={adminToolbarButtonClass(false) + " inline-flex items-center gap-1.5"}
            onClick={() => setShowAddExclusion(true)}
          >
            <Plus className="h-4 w-4" />
            Add exclusion
          </button>
        </div>
        {zone.exclusions.length === 0 ? (
          <EmptyState title="No exclusions" description="Exclude specific postal codes or areas from this zone." />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Name</AdminTh>
                <AdminTh>Type</AdminTh>
                <AdminTh>Code</AdminTh>
                <AdminTh>Added</AdminTh>
                <AdminTh />
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {zone.exclusions.map((exc) => (
                <tr key={exc.id}>
                  <AdminTd className="max-w-xs truncate font-medium">{exc.ref_name ?? "—"}</AdminTd>
                  <AdminTd>
                    <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                      {exc.type ?? "—"}
                    </span>
                  </AdminTd>
                  <AdminTd className="text-xs tabular-nums">{exc.ref_code ?? "—"}</AdminTd>
                  <AdminTd className="text-xs text-gray-500">{exc.created_at ? new Date(exc.created_at).toLocaleDateString() : "—"}</AdminTd>
                  <AdminTd>
                    <button
                      type="button"
                      className="text-red-600 hover:text-red-800 disabled:opacity-50"
                      disabled={removeExclusionMut.isPending}
                      title="Remove exclusion"
                      onClick={() => {
                        if (confirm(`Remove exclusion "${exc.ref_name ?? exc.ref_code}"?`)) {
                          removeExclusionMut.mutate(exc.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>

      {/* Rollout summary */}
      <AdminPanel>
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <BarChart3 className="h-4 w-4 text-indigo-600" />
          Rollout summary
        </h3>
        {rolloutQuery.isLoading ? (
          <AdminPageSkeleton rows={3} />
        ) : rolloutQuery.error ? (
          <AdminRetryBlock message={(rolloutQuery.error as Error).message} onRetry={() => void rolloutQuery.refetch()} />
        ) : rolloutQuery.data ? (
          <div className="space-y-3">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Postal areas" value={rolloutQuery.data.postal_area_count} />
              <StatCard label="Provinces" value={rolloutQuery.data.provinces.length} />
              <StatCard label="Cities" value={rolloutQuery.data.cities.length} />
              <StatCard label="Towns" value={rolloutQuery.data.towns.length} />
            </div>
            {rolloutQuery.data.provinces.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-gray-500">Provinces</p>
                <div className="flex flex-wrap gap-1.5">
                  {rolloutQuery.data.provinces.map((p) => (
                    <span key={p} className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">{p}</span>
                  ))}
                </div>
              </div>
            )}
            {rolloutQuery.data.cities.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-gray-500">Cities</p>
                <div className="flex flex-wrap gap-1.5">
                  {rolloutQuery.data.cities.map((c) => (
                    <span key={c} className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">{c}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </AdminPanel>

      {/* Add inclusion modal */}
      <AdminModal
        open={showAddInclusion}
        onClose={() => setShowAddInclusion(false)}
        title="Add included area"
        footer={
          <>
            <button
              type="button"
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={() => setShowAddInclusion(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={adminToolbarButtonClass(addInclusionMut.isPending)}
              disabled={addInclusionMut.isPending || (!inclusionForm.ref_code.trim() && inclusionForm.type !== "country")}
              onClick={() =>
                addInclusionMut.mutate({
                  type: inclusionForm.type,
                  ref_code: inclusionForm.type === "country" ? (zone.country_code ?? "") : inclusionForm.ref_code.trim(),
                  ref_name: inclusionForm.ref_name.trim() || undefined,
                })
              }
            >
              {addInclusionMut.isPending ? "Adding…" : "Add area"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Area type *</label>
            <select
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={inclusionForm.type}
              onChange={(e) => setInclusionForm((f) => ({ ...f, type: e.target.value }))}
            >
              {AREA_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          {inclusionForm.type !== "country" && (
            <>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Area name / code *</label>
                <input
                  type="text"
                  autoFocus
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder={inclusionForm.type === "postal_code" ? "e.g. 2001" : "e.g. Johannesburg"}
                  value={inclusionForm.ref_code}
                  onChange={(e) => setInclusionForm((f) => ({ ...f, ref_code: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Display name (optional)</label>
                <input
                  type="text"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Johannesburg CBD"
                  value={inclusionForm.ref_name}
                  onChange={(e) => setInclusionForm((f) => ({ ...f, ref_name: e.target.value }))}
                />
              </div>
            </>
          )}
          {inclusionForm.type === "country" && (
            <p className="text-sm text-gray-500">
              This will include all postal areas for country <strong>{zone.country_code}</strong>.
              This may add thousands of rows.
            </p>
          )}
        </div>
      </AdminModal>

      {/* Add exclusion modal */}
      <AdminModal
        open={showAddExclusion}
        onClose={() => setShowAddExclusion(false)}
        title="Add excluded area"
        footer={
          <>
            <button
              type="button"
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={() => setShowAddExclusion(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={adminToolbarButtonClass(addExclusionMut.isPending)}
              disabled={addExclusionMut.isPending || !exclusionForm.postal_code.trim()}
              onClick={() =>
                addExclusionMut.mutate({
                  type: "postal_code",
                  postal_code: exclusionForm.postal_code.trim(),
                })
              }
            >
              {addExclusionMut.isPending ? "Adding…" : "Add exclusion"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Postal code *</label>
            <input
              type="text"
              autoFocus
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. 2001"
              value={exclusionForm.postal_code}
              onChange={(e) => setExclusionForm((f) => ({ ...f, postal_code: e.target.value }))}
            />
            <p className="text-xs text-gray-400">
              The postal code must exist in the postal areas dataset for country {zone.country_code ?? "—"}.
            </p>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{value.toLocaleString()}</p>
    </div>
  );
}
