import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_FINANCE } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTh,
  AdminTd,
} from "@/components/admin/AdminDataTable";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { adminToast } from "@/lib/adminToast";
import { EmptyState } from "@/components/ui/EmptyState";

type FxCoverageRow = {
  base: string;
  quote: string;
  required: boolean;
  rate: number | null;
  rate_date: string | null;
  source: string | null;
  age_days: number | null;
  status: "ok" | "stale" | "missing";
  hold_until: string | null;
  set_by: string | null;
  set_by_email: string | null;
  manual_rate_date: string | null;
  note: string | null;
  used_by_tenants: string[];
  used_by_regions: string[];
  used_for: string[];
};

type FxDeskPayload = {
  overall: "missing" | "stale" | "fresh";
  coverage: FxCoverageRow[];
  required_ok: number;
  required_total: number;
  cron_run: {
    id?: string;
    job_name?: string;
    started_at?: string;
    finished_at?: string;
    status?: string;
    error?: string | null;
  } | null;
  self_check: Array<{ id: string; ok: boolean; detail: string }>;
  has_open_er_api_rows: boolean;
  reporting_only_notice: string;
  last_ingest: {
    created_at: string;
    status: string | null;
    required_missing: string[];
    stale: string[];
    warnings: string[];
    results_count: number;
  } | null;
};

type IngestSummary = {
  results: Array<{ pair: string; ok: boolean; source?: string; reason?: string }>;
  requiredMissing: string[];
  stale: string[];
  warnings: string[];
};

type HistoryRow = {
  id: string;
  rate_date: string;
  rate: number;
  source: string;
  hold_until?: string | null;
  note?: string | null;
  fetched_at?: string | null;
};

type AuditRow = {
  id: string;
  action: string;
  status?: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
  actor?: { full_name?: string; email?: string } | null;
};

function statusBadge(status: FxCoverageRow["status"], required: boolean) {
  if (status === "missing") return "bg-red-100 text-red-800";
  if (status === "stale") return "bg-amber-100 text-amber-900";
  if (required) return "bg-emerald-100 text-emerald-900";
  return "bg-gray-100 text-gray-700";
}

function overallLabel(overall: FxDeskPayload["overall"]) {
  if (overall === "fresh") return { text: "Fresh", className: "text-emerald-700" };
  if (overall === "stale") return { text: "Stale", className: "text-amber-700" };
  return { text: "Missing required", className: "text-red-700" };
}

export function FxRatesPage() {
  useAdminDocumentTitle("FX rates");
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_FINANCE, "Finance access is required.");
  const qc = useQueryClient();

  const [historyPair, setHistoryPair] = useState<{ base: string; quote: string } | null>(null);
  const [overridePair, setOverridePair] = useState<FxCoverageRow | null>(null);
  const [overrideRate, setOverrideRate] = useState("");
  const [overrideDate, setOverrideDate] = useState("");
  const [overrideHold, setOverrideHold] = useState("");
  const [overrideNote, setOverrideNote] = useState("");
  const [confirmOutlier, setConfirmOutlier] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<IngestSummary | null>(null);

  const deskQuery = useQuery({
    queryKey: adminQueryKeys.fxRatesDesk(),
    enabled: allowed,
    queryFn: () => adminApi.getJson<FxDeskPayload>("/api/admin/finance/fx-rates"),
  });

  const historyQuery = useQuery({
    queryKey: adminQueryKeys.fxRatesHistory(historyPair?.base ?? "", historyPair?.quote ?? ""),
    enabled: allowed && historyPair != null,
    queryFn: () =>
      adminApi.getJson<{ rows: HistoryRow[] }>(
        `/api/admin/finance/fx-rates/history?base=${encodeURIComponent(historyPair!.base)}&quote=${encodeURIComponent(historyPair!.quote)}`,
      ),
  });

  const auditQuery = useQuery({
    queryKey: adminQueryKeys.fxRatesAudit(),
    enabled: allowed,
    queryFn: () => adminApi.getJson<{ rows: AuditRow[] }>("/api/admin/finance/fx-rates/audit"),
  });

  const invalidateDesk = () => void qc.invalidateQueries({ queryKey: adminQueryKeys.fxRatesDesk() });

  const refreshMut = useMutation({
    mutationFn: () => adminApi.postJson<IngestSummary>("/api/admin/finance/fx-rates/refresh", {}),
    onSuccess: (summary) => {
      setLastRefresh(summary);
      adminToast.success(
        summary.requiredMissing.length
          ? `Fetch complete — ${summary.requiredMissing.length} required pair(s) still missing`
          : "FX rates refreshed",
      );
      invalidateDesk();
      void qc.invalidateQueries({ queryKey: adminQueryKeys.fxRatesAudit() });
    },
    onError: (err: Error) => adminToast.error(err.message || "Fetch failed"),
  });

  const overrideMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => adminApi.postJson("/api/admin/finance/fx-rates", body),
    onSuccess: () => {
      adminToast.success("Manual override saved");
      setOverridePair(null);
      setOverrideRate("");
      setOverrideDate("");
      setOverrideHold("");
      setOverrideNote("");
      setConfirmOutlier(false);
      invalidateDesk();
      void qc.invalidateQueries({ queryKey: adminQueryKeys.fxRatesAudit() });
    },
    onError: (err: Error & { code?: string }) => {
      if (err.message.includes("OUTLIER") || err.message.includes("0.5")) {
        adminToast.error("Rate is an outlier — check confirm outlier and retry");
      } else {
        adminToast.error(err.message || "Override failed");
      }
    },
  });

  const clearMut = useMutation({
    mutationFn: (body: { base: string; quote: string; rate_date: string }) =>
      adminApi.deleteJson("/api/admin/finance/fx-rates", body),
    onSuccess: () => {
      adminToast.success("Manual hold cleared");
      invalidateDesk();
      void qc.invalidateQueries({ queryKey: adminQueryKeys.fxRatesAudit() });
    },
    onError: (err: Error) => adminToast.error(err.message || "Clear failed"),
  });

  const coverage = deskQuery.data?.coverage ?? [];
  const isEmpty = coverage.length === 0 || coverage.every((r) => r.rate == null);
  const overall = deskQuery.data ? overallLabel(deskQuery.data.overall) : null;

  const requiredRows = useMemo(() => coverage.filter((r) => r.required), [coverage]);

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="FX rates"
        description="HQ reporting reference rates (Frankfurter v2). PSP settlement amounts stay authoritative."
      />

      <AdminPanel>
        <p className="text-sm text-gray-700">{deskQuery.data?.reporting_only_notice}</p>
        <p className="mt-2 text-xs text-gray-500">
          Gateways settle in charge currency. Stripe conversion is stored per payment only, not in this table.
        </p>
      </AdminPanel>

      <AdminPanel title="Health">
        {deskQuery.isLoading ? (
          <AdminPageSkeleton rows={2} />
        ) : isAdminApiAuthFailure(deskQuery.error) ? (
          <AdminRetryBlock
            message={deskQuery.error instanceof Error ? deskQuery.error.message : "Failed to load"}
            onRetry={() => void deskQuery.refetch()}
          />
        ) : !deskQuery.data ? (
          <p className="text-sm text-gray-600">No data.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <span className={`text-sm font-semibold ${overall?.className}`}>{overall?.text}</span>
              <span className="text-sm text-gray-700">
                Required: {deskQuery.data.required_ok}/{deskQuery.data.required_total} ok
              </span>
              {deskQuery.data.cron_run ? (
                <span className="text-sm text-gray-600">
                  Last cron ({deskQuery.data.cron_run.status ?? "?"}):{" "}
                  {deskQuery.data.cron_run.started_at
                    ? new Date(deskQuery.data.cron_run.started_at).toLocaleString()
                    : "—"}
                  {deskQuery.data.cron_run.error ? (
                    <span className="ml-2 text-red-700">{deskQuery.data.cron_run.error}</span>
                  ) : null}
                </span>
              ) : (
                <span className="text-sm text-gray-500">No cron run recorded yet</span>
              )}
              <Link to={adminSpaTo("/admin/cron-runs")} className="text-sm text-indigo-600 hover:underline">
                Cron runs
              </Link>
              <button
                type="button"
                className={adminToolbarButtonClass()}
                disabled={refreshMut.isPending}
                onClick={() => void refreshMut.mutate()}
              >
                {refreshMut.isPending ? "Fetching…" : "Fetch now"}
              </button>
            </div>
            {lastRefresh ? (
              <p className="text-xs text-gray-600">
                Last fetch (this session): {lastRefresh.results.filter((r) => r.ok).length} ok,{" "}
                {lastRefresh.requiredMissing.length} missing, {lastRefresh.stale.length} stale
              </p>
            ) : null}
            {deskQuery.data.last_ingest ? (
              <p className="text-xs text-gray-600">
                Last server ingest ({deskQuery.data.last_ingest.status ?? "?"} at{" "}
                {new Date(deskQuery.data.last_ingest.created_at).toLocaleString()}):{" "}
                {deskQuery.data.last_ingest.results_count} pairs,{" "}
                {deskQuery.data.last_ingest.required_missing.length} missing,{" "}
                {deskQuery.data.last_ingest.stale.length} stale
              </p>
            ) : null}
            <ul className="space-y-1">
              {deskQuery.data.self_check.map((c) => (
                <li key={c.id} className={`text-sm ${c.ok ? "text-emerald-700" : "text-red-700"}`}>
                  {c.ok ? "✓" : "✗"} {c.detail}
                </li>
              ))}
            </ul>
          </div>
        )}
      </AdminPanel>

      <AdminPanel title="Coverage">
        {deskQuery.isLoading ? (
          <AdminPageSkeleton rows={4} />
        ) : isEmpty ? (
          <EmptyState
            title="No rates yet"
            description="Frankfurter needs no key. Fetch now."
          />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Pair</AdminTh>
                <AdminTh>Rate</AdminTh>
                <AdminTh>Date</AdminTh>
                <AdminTh>Age</AdminTh>
                <AdminTh>Source</AdminTh>
                <AdminTh>Used for</AdminTh>
                <AdminTh>Hold / note</AdminTh>
                <AdminTh>Actions</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {coverage.map((row) => (
                <tr key={`${row.base}-${row.quote}`} className={row.required ? "font-medium" : undefined}>
                  <AdminTd>
                    {row.base}/{row.quote}
                    {row.required ? (
                      <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-800">
                        required
                      </span>
                    ) : null}
                  </AdminTd>
                  <AdminTd>{row.rate != null ? row.rate.toFixed(6) : "—"}</AdminTd>
                  <AdminTd>{row.rate_date ?? "—"}</AdminTd>
                  <AdminTd>
                    <span className={`rounded px-1.5 py-0.5 text-xs ${statusBadge(row.status, row.required)}`}>
                      {row.age_days != null ? `${row.age_days}d` : row.status}
                    </span>
                  </AdminTd>
                  <AdminTd>{row.source ?? "—"}</AdminTd>
                  <AdminTd className="max-w-[14rem] text-xs">
                    <span className="block truncate">{(row.used_for ?? []).join(" · ")}</span>
                    <span className="block truncate text-gray-500">
                      {[...row.used_by_tenants, ...row.used_by_regions].join(", ") || "—"}
                    </span>
                  </AdminTd>
                  <AdminTd className="max-w-[10rem] truncate text-xs">
                    {row.hold_until ? `hold ${row.hold_until}` : ""}
                    {row.set_by_email ? ` · ${row.set_by_email}` : row.set_by ? ` · ${row.set_by.slice(0, 8)}` : ""}
                    {row.note ? ` · ${row.note}` : ""}
                  </AdminTd>
                  <AdminTd>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="text-xs text-indigo-600 hover:underline"
                        onClick={() => setHistoryPair({ base: row.base, quote: row.quote })}
                      >
                        History
                      </button>
                      <button
                        type="button"
                        className="text-xs text-indigo-600 hover:underline"
                        onClick={() => {
                          setOverridePair(row);
                          setOverrideRate(row.rate != null ? String(row.rate) : "");
                          setOverrideDate(row.rate_date ?? new Date().toISOString().slice(0, 10));
                        }}
                      >
                        Override
                      </button>
                      {row.manual_rate_date ? (
                        <button
                          type="button"
                          className="text-xs text-red-600 hover:underline"
                          disabled={clearMut.isPending}
                          onClick={() =>
                            void clearMut.mutate({
                              base: row.base,
                              quote: row.quote,
                              rate_date: row.manual_rate_date!,
                            })
                          }
                        >
                          Clear hold
                        </button>
                      ) : null}
                    </div>
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>

      {historyPair ? (
        <AdminPanel title={`History — ${historyPair.base}/${historyPair.quote}`}>
          <button type="button" className="mb-3 text-sm text-gray-600 hover:underline" onClick={() => setHistoryPair(null)}>
            Close
          </button>
          {historyQuery.isLoading ? (
            <AdminPageSkeleton rows={2} />
          ) : (
            <AdminDataTable>
              <AdminTableHead>
                <tr>
                  <AdminTh>Date</AdminTh>
                  <AdminTh>Rate</AdminTh>
                  <AdminTh>Source</AdminTh>
                  <AdminTh>Note</AdminTh>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {(historyQuery.data?.rows ?? []).map((h) => (
                  <tr key={h.id}>
                    <AdminTd>{h.rate_date}</AdminTd>
                    <AdminTd>{h.rate}</AdminTd>
                    <AdminTd>{h.source}</AdminTd>
                    <AdminTd>{h.note ?? "—"}</AdminTd>
                  </tr>
                ))}
              </AdminTableBody>
            </AdminDataTable>
          )}
        </AdminPanel>
      ) : null}

      {overridePair ? (
        <AdminPanel title={`Override — ${overridePair.base}/${overridePair.quote}`}>
          <div className="grid max-w-md gap-3">
            <label className="text-sm">
              Rate
              <input
                className="mt-1 w-full rounded border px-2 py-1.5"
                value={overrideRate}
                onChange={(e) => setOverrideRate(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Rate date
              <input
                type="date"
                className="mt-1 w-full rounded border px-2 py-1.5"
                value={overrideDate}
                onChange={(e) => setOverrideDate(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Hold until (optional)
              <input
                type="date"
                className="mt-1 w-full rounded border px-2 py-1.5"
                value={overrideHold}
                onChange={(e) => setOverrideHold(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Note (min 8 chars)
              <textarea
                className="mt-1 w-full rounded border px-2 py-1.5"
                rows={2}
                value={overrideNote}
                onChange={(e) => setOverrideNote(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={confirmOutlier} onChange={(e) => setConfirmOutlier(e.target.checked)} />
              Confirm outlier (outside 0.5×–2× last API rate)
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                className={adminToolbarButtonClass()}
                disabled={overrideMut.isPending}
                onClick={() =>
                  void overrideMut.mutate({
                    base: overridePair.base,
                    quote: overridePair.quote,
                    rate: Number(overrideRate),
                    rate_date: overrideDate || undefined,
                    hold_until: overrideHold || null,
                    note: overrideNote,
                    confirm_outlier: confirmOutlier,
                  })
                }
              >
                Save override
              </button>
              <button type="button" className={adminToolbarButtonClass()} onClick={() => setOverridePair(null)}>
                Cancel
              </button>
            </div>
          </div>
        </AdminPanel>
      ) : null}

      <AdminPanel title="Recent audit (finance.fx.*)">
        {auditQuery.isLoading ? (
          <AdminPageSkeleton rows={2} />
        ) : (
          <>
            <ul className="space-y-2">
              {(auditQuery.data?.rows ?? []).map((a) => (
                <li key={a.id} className="text-sm text-gray-700">
                  <span className="font-mono text-xs">{a.created_at}</span> — {a.action}
                  {a.status === "failed" ? " (failed)" : ""}
                  {a.actor?.email ? ` · ${a.actor.email}` : ""}
                </li>
              ))}
            </ul>
            <Link to={adminSpaTo("/admin/audit-logs?module=finance")} className="mt-3 inline-block text-sm text-indigo-600 hover:underline">
              Full audit logs
            </Link>
          </>
        )}
      </AdminPanel>

      {deskQuery.data?.has_open_er_api_rows ? (
        <AdminPanel>
          <p className="text-xs text-gray-500">
            Some rows sourced from ExchangeRate-API open access (fallback). Attribution:{" "}
            <a href="https://www.exchangerate-api.com" className="text-indigo-600 hover:underline" rel="noreferrer" target="_blank">
              exchangerate-api.com
            </a>
          </p>
        </AdminPanel>
      ) : null}

      {requiredRows.length > 0 && deskQuery.data?.overall === "missing" ? (
        <AdminPanel>
          <p className="text-sm text-amber-800">
            Launch checklist and non-ZAR checkout require:{" "}
            {requiredRows.filter((r) => r.status === "missing").map((r) => `${r.base}→${r.quote}`).join(", ")}
          </p>
        </AdminPanel>
      ) : null}
    </div>
  );
}
