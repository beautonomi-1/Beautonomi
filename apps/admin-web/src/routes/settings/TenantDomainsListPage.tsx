import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
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
import { adminToolbarButtonClass } from "@/lib/adminUi";

type DomainRow = Record<string, unknown> & {
  id?: string;
  hostname?: string;
  tenant_id?: string;
  environment?: string;
  is_active?: boolean;
  is_primary?: boolean;
  is_legacy?: boolean;
};

type TenantRow = { id?: string; slug?: string | null; name?: string | null };

const ENV_OPTIONS = ["production", "preview", "development", "staging"] as const;

export function TenantDomainsListPage() {
  const { allowed, denied } = useSuperadminPage("Tenant domains are superadmin-only (matches API + nav).");
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: adminQueryKeys.tenantDomains(),
    queryFn: () =>
      adminApi.getJson<{ domains: DomainRow[]; tenants: Record<string, unknown>[] }>(
        "/api/admin/tenant-domains",
        { timeoutMs: 60_000 }
      ),
    enabled: allowed,
  });

  const [hostname, setHostname] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [environment, setEnvironment] = useState<(typeof ENV_OPTIONS)[number]>("production");
  const [isPrimary, setIsPrimary] = useState(false);
  const [isLegacy, setIsLegacy] = useState(false);
  const [createOk, setCreateOk] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: async () => {
      return adminApi.postJson<{ domain: DomainRow }>("/api/admin/tenant-domains", {
        hostname: hostname.trim(),
        tenant_id: tenantId,
        environment,
        is_primary: isPrimary,
        is_legacy: isLegacy,
        is_active: true,
      });
    },
    onSuccess: async () => {
      setCreateOk("Mapping created.");
      setHostname("");
      setIsPrimary(false);
      setIsLegacy(false);
      await qc.invalidateQueries({ queryKey: adminQueryKeys.tenantDomains() });
    },
    onError: () => {
      setCreateOk(null);
    },
  });

  const patchMut = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      return adminApi.patchJson<{ domain: DomainRow }>(`/api/admin/tenant-domains/${id}`, body);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminQueryKeys.tenantDomains() });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      return adminApi.deleteJson<{ ok: boolean }>(`/api/admin/tenant-domains/${id}`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminQueryKeys.tenantDomains() });
    },
  });

  const domains = q.data?.domains ?? [];
  const tenantLabelById = useMemo(() => {
    const m = new Map<string, string>();
    const rows = (q.data?.tenants ?? []) as TenantRow[];
    for (const t of rows) {
      if (!t.id) continue;
      m.set(t.id, (t.name || t.slug || t.id).trim() || t.id);
    }
    return m;
  }, [q.data?.tenants]);

  const sortedTenants = useMemo(() => {
    const rows = (q.data?.tenants ?? []) as TenantRow[];
    return rows
      .filter((t) => t.id)
      .slice()
      .sort((a, b) =>
        (a.name || a.slug || a.id || "").localeCompare(b.name || b.slug || b.id || "", undefined, {
          sensitivity: "base",
        })
      );
  }, [q.data?.tenants]);

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Tenant domains" />
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

  const canSubmit = hostname.trim().length > 0 && tenantId.length > 0 && !createMut.isPending;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Tenant domains"
        description="Map hostnames to tenants for routing and previews. Creates, updates, and deletes are audited."
      />

      <AdminMutationAlert errors={[createMut.error, patchMut.error, deleteMut.error]} />

      <AdminPanel className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Add mapping</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-gray-600">Hostname</span>
            <input
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm shadow-sm"
              value={hostname}
              onChange={(e) => {
                setCreateOk(null);
                setHostname(e.target.value);
              }}
              placeholder="app.example.com"
              autoComplete="off"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Tenant</span>
            <select
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm shadow-sm"
              value={tenantId}
              onChange={(e) => {
                setCreateOk(null);
                setTenantId(e.target.value);
              }}
            >
              <option value="">Select tenant…</option>
              {sortedTenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || t.slug || t.id}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Environment</span>
            <select
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm shadow-sm"
              value={environment}
              onChange={(e) => {
                setCreateOk(null);
                setEnvironment(e.target.value as (typeof ENV_OPTIONS)[number]);
              }}
            >
              {ENV_OPTIONS.map((env) => (
                <option key={env} value={env}>
                  {env}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
            />
            Primary for tenant
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300"
              checked={isLegacy}
              onChange={(e) => setIsLegacy(e.target.checked)}
            />
            Legacy hostname
          </label>
          <button
            type="button"
            className={
              canSubmit
                ? "inline-flex min-h-11 touch-manipulation items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800"
                : adminToolbarButtonClass(true)
            }
            disabled={!canSubmit}
            onClick={() => {
              setCreateOk(null);
              void createMut.mutate();
            }}
          >
            {createMut.isPending ? "Creating…" : "Create mapping"}
          </button>
          {createOk ? <span className="text-sm text-emerald-700">{createOk}</span> : null}
        </div>
      </AdminPanel>

      {domains.length === 0 ? (
        <EmptyState title="No domain mappings yet" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Hostname</AdminTh>
              <AdminTh>Tenant</AdminTh>
              <AdminTh>Environment</AdminTh>
              <AdminTh>Flags</AdminTh>
              <AdminTh>Active</AdminTh>
              <AdminTh className="text-right">Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {domains.map((d) => {
              const tid = String(d.tenant_id ?? "");
              const label = tenantLabelById.get(tid);
              const id = String(d.id ?? "");
              const busy = patchMut.isPending || deleteMut.isPending;
              return (
                <tr key={id || tid}>
                  <AdminTd className="font-mono text-xs">{String(d.hostname ?? "")}</AdminTd>
                  <AdminTd>
                    {label ? (
                      <>
                        <span className="font-medium text-gray-900">{label}</span>
                        {tid ? (
                          <span className="mt-0.5 block font-mono text-[11px] text-gray-400">{tid}</span>
                        ) : null}
                      </>
                    ) : (
                      <span className="font-mono text-xs text-gray-500">{tid || "—"}</span>
                    )}
                  </AdminTd>
                  <AdminTd>{String(d.environment ?? "")}</AdminTd>
                  <AdminTd className="text-xs text-gray-600">
                    {d.is_primary ? <span className="mr-2 rounded bg-gray-100 px-1.5 py-0.5">primary</span> : null}
                    {d.is_legacy ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-900">legacy</span> : null}
                    {!d.is_primary && !d.is_legacy ? "—" : null}
                  </AdminTd>
                  <AdminTd>{d.is_active ? "yes" : "no"}</AdminTd>
                  <AdminTd className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        className={adminToolbarButtonClass(busy)}
                        disabled={busy || !id}
                        onClick={() => {
                          void patchMut.mutate({ id, body: { is_active: !d.is_active } });
                        }}
                      >
                        {d.is_active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        className={adminToolbarButtonClass(busy)}
                        disabled={busy || !id}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Remove mapping for ${String(d.hostname ?? "this host")}? This cannot be undone.`
                            )
                          ) {
                            return;
                          }
                          void deleteMut.mutate(id);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}
