import { useSearchParams } from "react-router-dom";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@beautonomi/admin-access";
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

type Tab = "countries" | "currencies" | "languages" | "locales" | "timezones";

const TABS: Tab[] = ["countries", "currencies", "languages", "locales", "timezones"];

const API: Record<Tab, string> = {
  countries: "/api/admin/iso-codes/countries",
  currencies: "/api/admin/iso-codes/currencies",
  languages: "/api/admin/iso-codes/languages",
  locales: "/api/admin/iso-codes/locales",
  timezones: "/api/admin/iso-codes/timezones",
};

export function IsoCodesPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_INTEGRATIONS_DEV,
    "Integrations access is required."
  );
  const [sp, setSp] = useSearchParams();
  const rawTab = sp.get("tab") || "countries";
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "countries";
  const qk = useMemo(() => adminQueryKeys.isoCodes(tab), [tab]);

  const q = useQuery({
    queryKey: qk,
    queryFn: () => adminApi.getJson<Record<string, unknown>[]>(API[tab], { timeoutMs: 60_000 }),
    enabled: allowed,
  });
  const rows = q.data ?? [];

  function setTab(next: Tab) {
    const n = new URLSearchParams(sp);
    n.set("tab", next);
    setSp(n, { replace: true });
  }

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="ISO reference data" />
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

  const cols =
    rows[0] != null ? Object.keys(rows[0]).filter((c) => !["geometry", "polygon_coordinates"].includes(c)).slice(0, 10) : ["code", "name"];

  return (
    <div className="space-y-6">
      <AdminPageHeader title="ISO codes" description={`GET ${API[tab]}`} />
      <AdminPanel>
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button key={t} type="button" className={adminTabButtonClass(tab === t)} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
      </AdminPanel>
      {rows.length === 0 ? (
        <EmptyState title="No rows" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              {cols.map((c) => (
                <AdminTh key={c}>{c}</AdminTh>
              ))}
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.slice(0, 200).map((r, i) => (
              <tr key={String((r as { id?: string; code?: string }).id ?? (r as { code?: string }).code ?? i)}>
                {cols.map((c) => (
                  <AdminTd key={c} className="max-w-[10rem] truncate text-xs">
                    {String((r as Record<string, unknown>)[c] ?? "")}
                  </AdminTd>
                ))}
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
      {rows.length > 200 ? <p className="text-sm text-gray-500">Showing first 200 rows.</p> : null}
    </div>
  );
}
