/**
 * Control-plane → Country launch checklist
 *
 * Runs automated pre-launch readiness validation for a tenant+region:
 * tenant active, region linked, currency parity, production domains,
 * primary gateway + secrets, currency catalog entry.
 */
import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { CpBack } from "./cpShared";

type TenantSummary = {
  id: string;
  slug: string | null;
  name?: string | null;
  region_code?: string | null;
};

type CheckItem = {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
};

type ChecklistResult = {
  tenantId: string;
  regionCode: string;
  ready: boolean;
  items: CheckItem[];
};

export function CpCountryLaunchChecklistPage() {
  const { allowed, denied } = useSuperadminPage("Control plane is superadmin-only.");
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [selectedTenant, setSelectedTenant] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ChecklistResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    void loadTenants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  async function loadTenants() {
    setTenantsLoading(true);
    try {
      const list = await adminApi.getJson<TenantSummary[]>(
        "/api/admin/tenants?include_inactive=true",
      );
      const arr = Array.isArray(list) ? list : [];
      setTenants(arr);
      if (arr[0]?.id) setSelectedTenant(arr[0].id);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to load tenants");
    } finally {
      setTenantsLoading(false);
    }
  }

  async function runChecklist() {
    if (!selectedTenant) return;
    setRunning(true);
    setResult(null);
    setMsg(null);
    try {
      const res = await adminApi.getJson<ChecklistResult>(
        `/api/admin/regions/${selectedTenant}/launch-checklist`,
      );
      setResult(res ?? null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to run checklist");
    } finally {
      setRunning(false);
    }
  }

  if (denied) return null;

  return (
    <div className="space-y-6">
      <CpBack />
      <AdminPageHeader
        title="Country launch checklist"
        description="Automated pre-launch readiness validation for a tenant + region before enabling a market."
      />

      {msg && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-800">
          {msg}
          <button className="ml-2 text-red-600 underline" onClick={() => setMsg(null)}>
            dismiss
          </button>
        </div>
      )}

      <AdminPanel>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Tenant</span>
            <select
              className="min-w-[16rem] rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm"
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value)}
              disabled={tenantsLoading}
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || t.slug || t.id}
                  {t.region_code ? ` (${t.region_code})` : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={runChecklist}
            disabled={running || !selectedTenant}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {running ? "Running…" : "Run checklist"}
          </button>
        </div>
      </AdminPanel>

      {result && (
        <AdminPanel>
          <div className="mb-4 flex items-center gap-3">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                result.ready ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
              }`}
            >
              {result.ready ? "READY TO LAUNCH" : "NOT READY"}
            </span>
            <span className="text-sm text-muted-foreground">Region: {result.regionCode || "—"}</span>
          </div>
          <div className="divide-y">
            {result.items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.label}</p>
                  {item.detail && (
                    <p className="text-xs text-muted-foreground font-mono">{item.detail}</p>
                  )}
                </div>
                <span
                  className={`shrink-0 text-sm font-semibold ${
                    item.ok ? "text-green-700" : "text-red-600"
                  }`}
                >
                  {item.ok ? "✓ Pass" : "✗ Fail"}
                </span>
              </div>
            ))}
          </div>
        </AdminPanel>
      )}
    </div>
  );
}
