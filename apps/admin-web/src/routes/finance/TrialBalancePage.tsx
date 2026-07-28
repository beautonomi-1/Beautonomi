import { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Lock } from "lucide-react";
import { ADMIN_SECTION_FINANCE } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatAdminCurrency, formatAdminNumber } from "@/lib/adminFormatCurrency";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";

type TrialBalanceRow = {
  account_code: string;
  account_name: string;
  account_type: string;
  normal_side: string;
  opening_balance: number;
  period_debits: number;
  period_credits: number;
  closing_balance: number;
};

type TrialBalancePayload = {
  period: { start: string; end: string };
  rows: TrialBalanceRow[];
  totals: { period_debits: number; period_credits: number };
  balanced: boolean;
  period_locked: boolean;
  period_lock: { id: string; locked_by: string | null } | null;
  generated_at: string;
  basis_note: string;
};

function formatPeriodBound(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.length >= 10 ? iso.slice(0, 10) : iso;
}

function toApiBound(date: string, endOfDay: boolean): string {
  if (!date) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return endOfDay ? `${date}T23:59:59.999Z` : `${date}T00:00:00.000Z`;
  }
  return date;
}

export function TrialBalancePage() {
  useAdminDocumentTitle("Trial Balance");
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_FINANCE, "Finance access is required.");
  const location = useLocation();
  const navigate = useNavigate();
  const sp = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const setSp = useCallback(
    (next: URLSearchParams, opts?: { replace?: boolean }) => {
      const q = next.toString();
      navigate({ pathname: location.pathname, search: q ? `?${q}` : "" }, { replace: opts?.replace ?? false });
    },
    [location.pathname, navigate],
  );
  const start = sp.get("start_date") ?? "";
  const end = sp.get("end_date") ?? "";
  const rangeKey = `${start}|${end}`;

  const [exportBusy, setExportBusy] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  const patchParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      setSp(next, { replace: true });
    },
    [setSp, sp],
  );

  const q = useQuery({
    queryKey: adminQueryKeys.finance.trialBalance(rangeKey),
    queryFn: async () => {
      const p = new URLSearchParams();
      if (start) p.set("start", toApiBound(start, false));
      if (end) p.set("end", toApiBound(end, true));
      const qs = p.toString();
      return adminApi.getJson<TrialBalancePayload>(`/api/admin/finance/trial-balance${qs ? `?${qs}` : ""}`, {
        timeoutMs: 90_000,
      });
    },
    enabled: allowed,
  });

  const runExport = async () => {
    setExportErr(null);
    setExportBusy(true);
    try {
      const p = new URLSearchParams({ format: "csv" });
      if (start) p.set("start", toApiBound(start, false));
      if (end) p.set("end", toApiBound(end, true));
      const blob = await adminApi.downloadBlob(`/api/admin/finance/trial-balance?${p}`, { timeoutMs: 120_000 });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trial-balance-${start || "mtd"}-${end || "now"}.csv`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      a.remove();
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  };

  if (denied) return denied;

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Trial Balance" />
        <AdminPanel>
          <AdminPageSkeleton rows={8} />
        </AdminPanel>
      </div>
    );
  }

  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Trial Balance" />
        <AdminPanel>
          <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />
        </AdminPanel>
      </div>
    );
  }

  const data = q.data;
  const activeRows = (data?.rows ?? []).filter(
    (r) =>
      Math.abs(r.opening_balance) > 0.0001 ||
      Math.abs(r.period_debits) > 0.0001 ||
      Math.abs(r.period_credits) > 0.0001 ||
      Math.abs(r.closing_balance) > 0.0001,
  );

  const periodLabel =
    data?.period?.start && data?.period?.end
      ? `${formatPeriodBound(data.period.start)} → ${formatPeriodBound(data.period.end)}`
      : "Month to date";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Trial Balance"
        description="Shadow double-entry GL report from journal_lines × journal_entries. Use for period close and auditor sign-off."
        actions={
          <button type="button" className={adminToolbarButtonClass(exportBusy)} disabled={exportBusy} onClick={() => void runExport()}>
            <span className="inline-flex items-center gap-2">
              <Download className="h-4 w-4" />
              Export CSV
            </span>
          </button>
        }
      />

      {exportErr ? <p className="text-sm text-red-700">{exportErr}</p> : null}

      <AdminPanel>
        <h2 className="mb-4 text-base font-semibold text-gray-900">Period</h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block min-w-[10rem] flex-1 text-sm">
            <span className="text-gray-600">Start date</span>
            <input
              type="date"
              value={start}
              onChange={(e) => patchParams({ start_date: e.target.value || null })}
              className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm"
            />
          </label>
          <label className="block min-w-[10rem] flex-1 text-sm">
            <span className="text-gray-600">End date</span>
            <input
              type="date"
              value={end}
              onChange={(e) => patchParams({ end_date: e.target.value || null })}
              className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm"
            />
          </label>
          <button
            type="button"
            className={adminToolbarButtonClass(false)}
            onClick={() => {
              const next = new URLSearchParams(sp);
              next.delete("start_date");
              next.delete("end_date");
              setSp(next, { replace: true });
            }}
          >
            Clear dates
          </button>
        </div>
      </AdminPanel>

      {data ? (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
            <span>{periodLabel}</span>
            {data.period_locked ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                <Lock className="h-3 w-3" />
                Period locked
              </span>
            ) : null}
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                data.balanced ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
              }`}
            >
              {data.balanced ? "Balanced (Σ debits = Σ credits)" : "Out of balance — investigate GL"}
            </span>
          </div>

          <AdminPanel>
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Period debits</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{formatAdminCurrency(data.totals.period_debits)}</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Period credits</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{formatAdminCurrency(data.totals.period_credits)}</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Accounts with activity</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{formatAdminNumber(activeRows.length)}</p>
              </div>
            </div>

            {activeRows.length === 0 ? (
              <EmptyState
                title="No GL activity"
                description="No journal lines posted in this period. Shadow GL entries appear when finance transactions are shadow-posted."
              />
            ) : (
              <AdminDataTable>
                <AdminTableHead>
                  <tr>
                    <AdminTh>Code</AdminTh>
                    <AdminTh>Account</AdminTh>
                    <AdminTh>Type</AdminTh>
                    <AdminTh className="text-right">Opening</AdminTh>
                    <AdminTh className="text-right">Debits</AdminTh>
                    <AdminTh className="text-right">Credits</AdminTh>
                    <AdminTh className="text-right">Closing</AdminTh>
                  </tr>
                </AdminTableHead>
                <AdminTableBody>
                  {activeRows.map((row) => (
                    <tr key={row.account_code}>
                      <AdminTd className="font-mono text-xs">{row.account_code}</AdminTd>
                      <AdminTd>{row.account_name}</AdminTd>
                      <AdminTd className="text-xs text-gray-500">{row.account_type}</AdminTd>
                      <AdminTd className="text-right tabular-nums">{formatAdminCurrency(row.opening_balance)}</AdminTd>
                      <AdminTd className="text-right tabular-nums">{formatAdminCurrency(row.period_debits)}</AdminTd>
                      <AdminTd className="text-right tabular-nums">{formatAdminCurrency(row.period_credits)}</AdminTd>
                      <AdminTd className="text-right tabular-nums font-medium">{formatAdminCurrency(row.closing_balance)}</AdminTd>
                    </tr>
                  ))}
                </AdminTableBody>
              </AdminDataTable>
            )}

            <p className="mt-4 text-xs text-gray-500">{data.basis_note}</p>
            <p className="mt-1 text-xs text-gray-400">
              Generated {data.generated_at ? new Date(data.generated_at).toLocaleString() : "—"}
            </p>
          </AdminPanel>
        </>
      ) : null}
    </div>
  );
}
