import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_FINANCE } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminTabButtonClass, adminToolbarButtonClass } from "@/lib/adminUi";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { useAdminSession } from "@/providers/AdminSessionProvider";
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
import { formatAdminCurrency } from "@/lib/adminFormatCurrency";

type FeeTab = "configs" | "adjustments" | "reconciliations";

type FeeConfig = {
  id: string;
  gateway_name: string;
  fee_type: "percentage" | "fixed" | "tiered";
  fee_percentage: number;
  fee_fixed_amount: number;
  fee_tiered_config?: unknown;
  currency: string;
  is_active: boolean;
  effective_from: string;
  effective_until: string | null;
  description: string | null;
};

type FeeAdjustmentRow = Record<string, unknown> & {
  id?: string;
  created_at?: string;
  payment_transaction_id?: string | null;
  finance_transaction_id?: string | null;
  original_fee_amount?: number;
  adjusted_fee_amount?: number;
  adjustment_reason?: string;
  adjustment_type?: string;
  reconciled?: boolean;
  payment_transaction?: unknown;
  finance_transaction?: unknown;
};

type ReconciliationRow = Record<string, unknown> & {
  id?: string;
  reconciliation_date?: string;
  gateway_name?: string;
  expected_fees?: number;
  actual_fees?: number;
  recorded_fees?: number;
  variance?: number;
  status?: string;
  source?: string;
  notes?: string | null;
  statement_reference?: string | null;
};

type ListMeta = { page: number; limit: number; total: number; has_more: boolean };

function monthStartYmd(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function todayYmd(d: Date = new Date()): string {
  return d.toISOString().split("T")[0];
}

type FeeAutoComputed = {
  recorded_fees: number;
  expected_fees_from_config: number;
  charge_count: number;
  payout_transfer_count: number;
};

function inputClass(readonly?: boolean) {
  return `w-full rounded-xl border border-gray-300 p-3 text-sm shadow-inner${readonly ? " bg-gray-50" : ""}`;
}

function labelClass() {
  return "mb-1 block text-sm font-medium text-gray-700";
}

function unwrapRelation<T>(v: unknown): T | undefined {
  if (v == null) return undefined;
  if (Array.isArray(v)) return (v[0] as T) ?? undefined;
  return v as T;
}

// Use the import.meta.env default currency when available; fall back to ZAR only as last resort.
// Admin can set default_currency in General Settings — this constant should be replaced by a
// settings query when `usePlatformSettings()` hook is available.
const DEFAULT_CURRENCY = (import.meta.env.VITE_DEFAULT_CURRENCY as string | undefined) || "ZAR";
const ADJUSTMENT_TYPES = ["correction", "waiver", "increase", "reconciliation", "other"] as const;
const RECON_STATUSES = ["pending", "reviewed", "resolved", "disputed"] as const;

const FEE_TABS = ["configs", "adjustments", "reconciliations"] as const;

function normalizeFeeTab(raw: string | null): FeeTab {
  if (raw === "adjustments" || raw === "reconciliations") return raw;
  return "configs";
}

export function FeesConfigsPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_FINANCE, "Finance access is required.");
  const { bootstrap } = useAdminSession();
  const isSuperadmin = bootstrap?.isSuperadmin === true;
  useAdminDocumentTitle("Fee management");
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();

  const tab = useMemo(() => normalizeFeeTab(sp.get("tab")), [sp]);

  useEffect(() => {
    const raw = sp.get("tab");
    if (raw != null && raw !== "" && !FEE_TABS.includes(raw as (typeof FEE_TABS)[number])) {
      const n = new URLSearchParams(sp);
      n.set("tab", "configs");
      setSp(n, { replace: true });
    }
  }, [sp, setSp]);

  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const limit = 50;

  const setTab = useCallback(
    (next: FeeTab) => {
      const n = new URLSearchParams(sp);
      n.set("tab", next);
      n.set("page", "1");
      setSp(n, { replace: true });
    },
    [setSp, sp]
  );

  const setPage = useCallback(
    (next: number) => {
      const n = new URLSearchParams(sp);
      n.set("page", String(next));
      setSp(n, { replace: true });
    },
    [setSp, sp]
  );

  const configsQk = adminQueryKeys.fees.configs("active_only=false");
  const configsQ = useQuery({
    queryKey: configsQk,
    queryFn: () =>
      adminApi.getJson<FeeConfig[]>("/api/admin/fees/configs?active_only=false", { timeoutMs: 60_000 }),
    enabled: allowed && tab === "configs",
  });

  const adjustmentsQ = useQuery({
    queryKey: adminQueryKeys.fees.adjustmentsList({ page, limit }),
    queryFn: () =>
      adminApi.getRawJson<{ data: FeeAdjustmentRow[]; meta: ListMeta }>(
        `/api/admin/fees/adjustments?page=${page}&limit=${limit}`,
        { timeoutMs: 60_000 }
      ),
    enabled: allowed && tab === "adjustments",
    placeholderData: keepPreviousData,
  });

  const reconciliationsQ = useQuery({
    queryKey: adminQueryKeys.fees.reconciliationsList({
      page,
      limit,
      start: sp.get("start_date"),
      end: sp.get("end_date"),
    }),
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), limit: String(limit) });
      const start = sp.get("start_date");
      const end = sp.get("end_date");
      if (start) p.set("start_date", start);
      if (end) p.set("end_date", end);
      return adminApi.getRawJson<{ data: ReconciliationRow[]; meta: ListMeta }>(
        `/api/admin/fees/reconciliations?${p.toString()}`,
        { timeoutMs: 60_000 },
      );
    },
    enabled: allowed && tab === "reconciliations",
    placeholderData: keepPreviousData,
  });

  const invalidateFees = () => void qc.invalidateQueries({ queryKey: adminQueryKeys.fees.all() });

  const [configModal, setConfigModal] = useState<FeeConfig | "new" | null>(null);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [reconCreateOpen, setReconCreateOpen] = useState(false);
  const [reconEdit, setReconEdit] = useState<ReconciliationRow | null>(null);

  const saveConfigMut = useMutation({
    mutationFn: async (payload: { mode: "create" | "edit"; body: Record<string, unknown> }) => {
      if (payload.mode === "create") {
        return adminApi.postJson<FeeConfig>("/api/admin/fees/configs", payload.body);
      }
      return adminApi.patchJson<FeeConfig>("/api/admin/fees/configs", payload.body);
    },
    onSuccess: () => {
      invalidateFees();
      setConfigModal(null);
      adminToast.success("Fee configuration saved");
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const createAdjustmentMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminApi.postJson("/api/admin/fees/adjustments", body),
    onSuccess: () => {
      invalidateFees();
      setAdjustmentOpen(false);
      adminToast.success("Adjustment created");
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const createReconMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminApi.postJson("/api/admin/fees/reconciliations", body),
    onSuccess: () => {
      invalidateFees();
      setReconCreateOpen(false);
      adminToast.success("Reconciliation created");
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const patchReconMut = useMutation({
    mutationFn: (body: { id: string; status: string; notes: string }) =>
      adminApi.patchJson("/api/admin/fees/reconciliations", body),
    onSuccess: () => {
      invalidateFees();
      setReconEdit(null);
      adminToast.success("Reconciliation updated");
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const backfillReconMut = useMutation({
    mutationFn: async () => {
      const end = todayYmd();
      const start = monthStartYmd(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));
      return adminApi.postJson(
        `/api/admin/fees/reconciliations?backfill=true&start=${start}&end=${end}`,
        {},
      );
    },
    onSuccess: (summary) => {
      invalidateFees();
      const upserted = Number(
        summary && typeof summary === "object" && "upserted" in summary
          ? (summary as { upserted?: number }).upserted ?? 0
          : 0,
      );
      const errors =
        summary && typeof summary === "object" && "errors" in summary
          ? Number((summary as { errors?: number }).errors ?? 0)
          : 0;
      adminToast.success(
        `Backfill complete — ${upserted} row(s) upserted${errors > 0 ? `, ${errors} error(s)` : ""}`,
      );
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  if (denied) return denied;

  const adjRows = adjustmentsQ.data?.data ?? [];
  const adjMeta = adjustmentsQ.data?.meta;
  const recRows = reconciliationsQ.data?.data ?? [];
  const recMeta = reconciliationsQ.data?.meta;

  function tabErrorBlock(err: unknown, refetch: () => void) {
    if (!err) return null;
    const message = err instanceof Error ? err.message : String(err);
    if (isAdminApiAuthFailure(err)) return <PermissionDenied />;
    return (
      <AdminPanel>
        <AdminRetryBlock message={message} onRetry={() => void refetch()} />
      </AdminPanel>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Fee management"
        description="Configs, adjustments, and reconciliations — /api/admin/fees/*"
      />

      <AdminPanel>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["configs", "Configurations"],
              ["adjustments", "Adjustments"],
              ["reconciliations", "Reconciliations"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" className={adminTabButtonClass(tab === k)} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>
      </AdminPanel>

      <AdminMutationAlert
        errors={[
          saveConfigMut.error,
          createAdjustmentMut.error,
          createReconMut.error,
          patchReconMut.error,
        ]}
      />

      {tab === "configs" ? (
        configsQ.isLoading ? (
          <AdminPanel>
            <AdminPageSkeleton rows={6} />
          </AdminPanel>
        ) : configsQ.error ? (
          tabErrorBlock(configsQ.error, () => void configsQ.refetch())
        ) : (
          <FeeConfigsSection
            rows={configsQ.data ?? []}
            onAdd={() => setConfigModal("new")}
            onEdit={(c) => setConfigModal(c)}
            onRefresh={() => void configsQ.refetch()}
          />
        )
      ) : null}

      {tab === "adjustments" ? (
        adjustmentsQ.isLoading && !adjustmentsQ.data ? (
          <AdminPanel>
            <AdminPageSkeleton rows={6} />
          </AdminPanel>
        ) : adjustmentsQ.error ? (
          tabErrorBlock(adjustmentsQ.error, () => void adjustmentsQ.refetch())
        ) : (
          <FeeAdjustmentsSection
            rows={adjRows}
            meta={adjMeta}
            page={page}
            onPage={setPage}
            onCreate={() => setAdjustmentOpen(true)}
            onRefresh={() => void adjustmentsQ.refetch()}
            isFetching={adjustmentsQ.isFetching}
          />
        )
      ) : null}

      {tab === "reconciliations" ? (
        reconciliationsQ.isLoading && !reconciliationsQ.data ? (
          <AdminPanel>
            <AdminPageSkeleton rows={6} />
          </AdminPanel>
        ) : reconciliationsQ.error ? (
          tabErrorBlock(reconciliationsQ.error, () => void reconciliationsQ.refetch())
        ) : (
          <FeeReconciliationsSection
            rows={recRows}
            meta={recMeta}
            page={page}
            onPage={setPage}
            onCreate={() => setReconCreateOpen(true)}
            onEditRow={(r) => setReconEdit(r)}
            onRefresh={() => void reconciliationsQ.refetch()}
            isFetching={reconciliationsQ.isFetching}
            isSuperadmin={isSuperadmin}
            backfillBusy={backfillReconMut.isPending}
            onBackfill={() => backfillReconMut.mutate()}
          />
        )
      ) : null}

      <FeeConfigFormModal
        open={configModal != null}
        mode={configModal === "new" || configModal === null ? "create" : "edit"}
        initial={configModal !== null && configModal !== "new" ? configModal : null}
        onClose={() => setConfigModal(null)}
        busy={saveConfigMut.isPending}
        onSubmit={(body, mode) => saveConfigMut.mutate({ mode, body })}
      />

      <CreateAdjustmentModal
        open={adjustmentOpen}
        onClose={() => setAdjustmentOpen(false)}
        busy={createAdjustmentMut.isPending}
        onSubmit={(body) => createAdjustmentMut.mutate(body)}
      />

      <CreateReconciliationModal
        open={reconCreateOpen}
        onClose={() => setReconCreateOpen(false)}
        busy={createReconMut.isPending}
        onSubmit={(body) => createReconMut.mutate(body)}
      />

      <EditReconciliationModal
        open={reconEdit != null && Boolean(reconEdit.id)}
        row={reconEdit}
        onClose={() => setReconEdit(null)}
        busy={patchReconMut.isPending}
        onSubmit={(body) => patchReconMut.mutate(body)}
      />
    </div>
  );
}

function FeeConfigsSection({
  rows,
  onAdd,
  onEdit,
  onRefresh,
}: {
  rows: FeeConfig[];
  onAdd: () => void;
  onEdit: (c: FeeConfig) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Gateway fee configurations</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={adminToolbarButtonClass(false)}
            onClick={() => onRefresh()}
          >
            Refresh
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white"
            onClick={onAdd}
          >
            Add configuration
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No fee configs" description="Create a configuration or check migrations." />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Gateway</AdminTh>
              <AdminTh>Type</AdminTh>
              <AdminTh>Fee</AdminTh>
              <AdminTh>Currency</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Effective from</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((config) => (
              <tr key={config.id}>
                <AdminTd className="font-medium">{config.gateway_name}</AdminTd>
                <AdminTd className="capitalize">{config.fee_type}</AdminTd>
                <AdminTd>
                  {config.fee_type === "percentage"
                    ? `${(Number(config.fee_percentage) * 100).toFixed(2)}%`
                    : config.fee_type === "fixed"
                      ? formatAdminCurrency(Number(config.fee_fixed_amount), config.currency)
                      : "Tiered"}
                </AdminTd>
                <AdminTd>{config.currency}</AdminTd>
                <AdminTd>{config.is_active ? "Active" : "Inactive"}</AdminTd>
                <AdminTd>{new Date(config.effective_from).toLocaleDateString()}</AdminTd>
                <AdminTd>
                  <button
                    type="button"
                    className="text-sm font-semibold text-gray-900 underline"
                    onClick={() => onEdit(config)}
                  >
                    Edit
                  </button>
                </AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}

function FeeAdjustmentsSection({
  rows,
  meta,
  page,
  onPage,
  onCreate,
  onRefresh,
  isFetching,
}: {
  rows: FeeAdjustmentRow[];
  meta?: ListMeta;
  page: number;
  onPage: (p: number) => void;
  onCreate: () => void;
  onRefresh: () => void;
  isFetching: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Fee adjustments</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={adminToolbarButtonClass(false)}
            onClick={() => onRefresh()}
          >
            Refresh
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white"
            onClick={onCreate}
          >
            Create adjustment
          </button>
        </div>
      </div>
      {meta ? (
        <p className="text-sm text-gray-600">
          Page {meta.page} · showing {rows.length} of {meta.total}
          {isFetching ? <span className="ml-2 text-gray-400">Updating…</span> : null}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title="No adjustments" description="Create an adjustment for a payment or finance transaction." />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Date</AdminTh>
              <AdminTh>Transaction</AdminTh>
              <AdminTh>Original</AdminTh>
              <AdminTh>Adjusted</AdminTh>
              <AdminTh>Type</AdminTh>
              <AdminTh>Reason</AdminTh>
              <AdminTh>Reconciled</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((adj) => {
              const pt = unwrapRelation<{ reference?: string; id?: string }>(adj.payment_transaction);
              const ft = unwrapRelation<{ id?: string }>(adj.finance_transaction);
              const ref = pt?.reference ?? ft?.id ?? "—";
              return (
                <tr key={String(adj.id)}>
                  <AdminTd>{adj.created_at ? new Date(String(adj.created_at)).toLocaleDateString() : "—"}</AdminTd>
                  <AdminTd className="max-w-[10rem] truncate font-mono text-xs">{ref}</AdminTd>
                  <AdminTd className="tabular-nums">
                    {formatAdminCurrency(Number(adj.original_fee_amount ?? 0), DEFAULT_CURRENCY)}
                  </AdminTd>
                  <AdminTd className="tabular-nums font-medium">
                    {formatAdminCurrency(Number(adj.adjusted_fee_amount ?? 0), DEFAULT_CURRENCY)}
                  </AdminTd>
                  <AdminTd className="capitalize">{String(adj.adjustment_type ?? "")}</AdminTd>
                  <AdminTd className="max-w-[12rem] truncate text-sm">{String(adj.adjustment_reason ?? "")}</AdminTd>
                  <AdminTd>{adj.reconciled ? "Yes" : "No"}</AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}
      {meta && meta.total > meta.limit ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={adminToolbarButtonClass(page <= 1)}
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            className={adminToolbarButtonClass(!meta.has_more)}
            disabled={!meta.has_more}
            onClick={() => onPage(page + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FeeReconciliationsSection({
  rows,
  meta,
  page,
  onPage,
  onCreate,
  onEditRow,
  onRefresh,
  isFetching,
  isSuperadmin,
  backfillBusy,
  onBackfill,
}: {
  rows: ReconciliationRow[];
  meta?: ListMeta;
  page: number;
  onPage: (p: number) => void;
  onCreate: () => void;
  onEditRow: (r: ReconciliationRow) => void;
  onRefresh: () => void;
  isFetching: boolean;
  isSuperadmin?: boolean;
  backfillBusy?: boolean;
  onBackfill?: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Fee reconciliations</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={adminToolbarButtonClass(false)}
            onClick={() => onRefresh()}
          >
            Refresh
          </button>
          {isSuperadmin && onBackfill ? (
            <button
              type="button"
              className={adminToolbarButtonClass(!!backfillBusy)}
              disabled={backfillBusy}
              onClick={onBackfill}
            >
              {backfillBusy ? "Backfilling…" : "Backfill last 30 days"}
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white"
            onClick={onCreate}
          >
            New reconciliation
          </button>
        </div>
      </div>
      {meta ? (
        <p className="text-sm text-gray-600">
          Page {meta.page} · showing {rows.length} of {meta.total}
          {isFetching ? <span className="ml-2 text-gray-400">Updating…</span> : null}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState
          title="No reconciliations"
          description="Auto rows appear daily after the cron runs (02:00 UTC). Use Backfill for historical dates or create a manual reconciliation."
        />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Date</AdminTh>
              <AdminTh>Gateway</AdminTh>
              <AdminTh>Source</AdminTh>
              <AdminTh>Recorded</AdminTh>
              <AdminTh>Expected</AdminTh>
              <AdminTh>Actual</AdminTh>
              <AdminTh>Variance</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Reference</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((rec) => {
              const v = Number(rec.variance ?? 0);
              const source = String(rec.source ?? "manual");
              return (
                <tr key={String(rec.id)}>
                  <AdminTd>
                    {rec.reconciliation_date
                      ? new Date(String(rec.reconciliation_date)).toLocaleDateString()
                      : "—"}
                  </AdminTd>
                  <AdminTd className="font-medium">{String(rec.gateway_name ?? "")}</AdminTd>
                  <AdminTd>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        source === "auto_daily"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {source === "auto_daily" ? "Auto" : "Manual"}
                    </span>
                  </AdminTd>
                  <AdminTd className="tabular-nums">
                    {formatAdminCurrency(
                      Number(rec.recorded_fees ?? rec.actual_fees ?? 0),
                      DEFAULT_CURRENCY,
                    )}
                  </AdminTd>
                  <AdminTd className="tabular-nums">
                    {formatAdminCurrency(Number(rec.expected_fees ?? 0), DEFAULT_CURRENCY)}
                  </AdminTd>
                  <AdminTd className="tabular-nums">
                    {formatAdminCurrency(Number(rec.actual_fees ?? 0), DEFAULT_CURRENCY)}
                  </AdminTd>
                  <AdminTd className={`tabular-nums font-medium ${v >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {v >= 0 ? "+" : ""}
                    {v.toFixed(2)}
                  </AdminTd>
                  <AdminTd className="capitalize">{String(rec.status ?? "")}</AdminTd>
                  <AdminTd className="max-w-[8rem] truncate text-xs">
                    {rec.statement_reference ? String(rec.statement_reference) : "—"}
                  </AdminTd>
                  <AdminTd>
                    <button
                      type="button"
                      className="text-sm font-semibold text-gray-900 underline"
                      onClick={() => onEditRow(rec)}
                    >
                      Update
                    </button>
                  </AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}
      {meta && meta.total > meta.limit ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={adminToolbarButtonClass(page <= 1)}
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            className={adminToolbarButtonClass(!meta.has_more)}
            disabled={!meta.has_more}
            onClick={() => onPage(page + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FeeConfigFormModal({
  open,
  mode,
  initial,
  onClose,
  busy,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  initial: FeeConfig | null;
  onClose: () => void;
  busy: boolean;
  onSubmit: (body: Record<string, unknown>, mode: "create" | "edit") => void;
}) {
  const [gatewayName, setGatewayName] = useState("");
  const [feeType, setFeeType] = useState<FeeConfig["fee_type"]>("percentage");
  const [feePercentage, setFeePercentage] = useState(0);
  const [feeFixed, setFeeFixed] = useState(0);
  const [tieredJson, setTieredJson] = useState("{}");
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [isActive, setIsActive] = useState(true);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveUntil, setEffectiveUntil] = useState("");
  const [description, setDescription] = useState("");

  const resetFromInitial = useCallback(() => {
    if (initial) {
      setGatewayName(initial.gateway_name);
      setFeeType(initial.fee_type);
      setFeePercentage(Number(initial.fee_percentage) || 0);
      setFeeFixed(Number(initial.fee_fixed_amount) || 0);
      setTieredJson(
        initial.fee_tiered_config != null ? JSON.stringify(initial.fee_tiered_config, null, 0) : "{}"
      );
      setCurrency(initial.currency || DEFAULT_CURRENCY);
      setIsActive(initial.is_active !== false);
      setEffectiveFrom(
        initial.effective_from ? new Date(initial.effective_from).toISOString().split("T")[0] : ""
      );
      setEffectiveUntil(
        initial.effective_until
          ? new Date(initial.effective_until).toISOString().split("T")[0]
          : ""
      );
      setDescription(initial.description ?? "");
    } else {
      setGatewayName("");
      setFeeType("percentage");
      setFeePercentage(0);
      setFeeFixed(0);
      setTieredJson("{}");
      setCurrency(DEFAULT_CURRENCY);
      setIsActive(true);
      setEffectiveFrom(new Date().toISOString().split("T")[0]);
      setEffectiveUntil("");
      setDescription("");
    }
  }, [initial]);

  useEffect(() => {
    if (open) resetFromInitial();
  }, [open, resetFromInitial]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    let fee_tiered_config: unknown = {};
    if (feeType === "tiered") {
      try {
        fee_tiered_config = JSON.parse(tieredJson || "{}");
      } catch {
        adminToast.error("Tiered config must be valid JSON");
        return;
      }
    }

    const effective_from = effectiveFrom ? `${effectiveFrom}T00:00:00.000Z` : new Date().toISOString();
    const effective_until = effectiveUntil.trim() ? `${effectiveUntil.trim()}T23:59:59.999Z` : null;

    const base: Record<string, unknown> = {
      gateway_name: gatewayName.trim(),
      fee_type: feeType,
      fee_percentage: feeType === "percentage" ? feePercentage : 0,
      fee_fixed_amount: feeType === "fixed" ? feeFixed : 0,
      fee_tiered_config: feeType === "tiered" ? fee_tiered_config : {},
      currency: currency.trim().toUpperCase(),
      is_active: isActive,
      effective_from,
      effective_until,
      description: description.trim() || null,
    };

    if (mode === "edit" && initial) {
      onSubmit({ id: initial.id, ...base }, "edit");
    } else {
      onSubmit(base, "create");
    }
  }

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title={mode === "create" ? "Create fee configuration" : "Edit fee configuration"}
      description="Percentage values are decimals (e.g. 0.015 = 1.5%)."
      footer={
        <>
          <button type="button" className={adminToolbarButtonClass()} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="fee-config-form"
            className="inline-flex min-h-11 min-w-[5.5rem] items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-50"
            disabled={busy}
          >
            Save
          </button>
        </>
      }
    >
      <form id="fee-config-form" className="space-y-3" onSubmit={submit}>
        <div>
          <label className={labelClass()} htmlFor="fc-gateway">
            Gateway name *
          </label>
          <input
            id="fc-gateway"
            className={inputClass()}
            value={gatewayName}
            onChange={(e) => setGatewayName(e.target.value)}
            required
            placeholder="paystack, stripe, …"
          />
        </div>
        <div>
          <label className={labelClass()} htmlFor="fc-type">
            Fee type *
          </label>
          <select
            id="fc-type"
            className={inputClass()}
            value={feeType}
            onChange={(e) => setFeeType(e.target.value as FeeConfig["fee_type"])}
          >
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed</option>
            <option value="tiered">Tiered</option>
          </select>
        </div>
        {feeType === "percentage" ? (
          <div>
            <label className={labelClass()} htmlFor="fc-pct">
              Fee percentage (decimal) *
            </label>
            <input
              id="fc-pct"
              type="number"
              step="0.0001"
              min={0}
              max={1}
              className={inputClass()}
              value={feePercentage}
              onChange={(e) => setFeePercentage(parseFloat(e.target.value) || 0)}
              required
            />
            <p className="mt-1 text-xs text-gray-500">≈ {(feePercentage * 100).toFixed(4)}%</p>
          </div>
        ) : null}
        {feeType === "fixed" ? (
          <div>
            <label className={labelClass()} htmlFor="fc-fixed">
              Fixed fee amount *
            </label>
            <input
              id="fc-fixed"
              type="number"
              step="0.01"
              min={0}
              className={inputClass()}
              value={feeFixed}
              onChange={(e) => setFeeFixed(parseFloat(e.target.value) || 0)}
              required
            />
          </div>
        ) : null}
        {feeType === "tiered" ? (
          <div>
            <label className={labelClass()} htmlFor="fc-tiered">
              Tiered JSON *
            </label>
            <textarea
              id="fc-tiered"
              className={`${inputClass()} min-h-[100px] font-mono text-xs`}
              value={tieredJson}
              onChange={(e) => setTieredJson(e.target.value)}
              required
            />
          </div>
        ) : null}
        <div>
          <label className={labelClass()} htmlFor="fc-ccy">
            Currency *
          </label>
          <input
            id="fc-ccy"
            className={inputClass()}
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            maxLength={3}
            required
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
        <div>
          <label className={labelClass()} htmlFor="fc-from">
            Effective from *
          </label>
          <input
            id="fc-from"
            type="date"
            className={inputClass()}
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelClass()} htmlFor="fc-until">
            Effective until (optional)
          </label>
          <input
            id="fc-until"
            type="date"
            className={inputClass()}
            value={effectiveUntil}
            onChange={(e) => setEffectiveUntil(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass()} htmlFor="fc-desc">
            Description
          </label>
          <textarea
            id="fc-desc"
            className={`${inputClass()} min-h-[80px]`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>
      </form>
    </AdminModal>
  );
}

function CreateAdjustmentModal({
  open,
  onClose,
  busy,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [txKind, setTxKind] = useState<"payment" | "finance">("payment");
  const [paymentId, setPaymentId] = useState("");
  const [financeId, setFinanceId] = useState("");
  const [originalFee, setOriginalFee] = useState("0.01");
  const [adjustedFee, setAdjustedFee] = useState("");
  const [reason, setReason] = useState("");
  const [adjType, setAdjType] = useState<string>(ADJUSTMENT_TYPES[0]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setTxKind("payment");
    setPaymentId("");
    setFinanceId("");
    setOriginalFee("0.01");
    setAdjustedFee("");
    setReason("");
    setAdjType(ADJUSTMENT_TYPES[0]);
    setNotes("");
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const pid = paymentId.trim();
    const fid = financeId.trim();
    if (txKind === "payment" && !pid) {
      adminToast.error("Payment transaction ID is required");
      return;
    }
    if (txKind === "finance" && !fid) {
      adminToast.error("Finance transaction ID is required");
      return;
    }
    const orig = parseFloat(originalFee);
    const adj = parseFloat(adjustedFee);
    if (!Number.isFinite(orig) || orig <= 0) {
      adminToast.error("Original fee must be a positive number (API requirement; often overwritten from the transaction).");
      return;
    }
    if (!Number.isFinite(adj)) {
      adminToast.error("Adjusted fee must be a number");
      return;
    }
    if (!reason.trim() || !adjType) {
      adminToast.error("Reason and type are required");
      return;
    }
    onSubmit({
      ...(txKind === "payment"
        ? { payment_transaction_id: pid, finance_transaction_id: null }
        : { finance_transaction_id: fid, payment_transaction_id: null }),
      original_fee_amount: orig,
      adjusted_fee_amount: adj,
      adjustment_reason: reason.trim(),
      adjustment_type: adjType,
      notes: notes.trim() || null,
    });
  }

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Create fee adjustment"
      description="Links to one payment or finance transaction. Original fee is usually replaced server-side from the transaction row."
      footer={
        <>
          <button type="button" className={adminToolbarButtonClass()} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="adj-create-form"
            className="inline-flex min-h-11 min-w-[5.5rem] items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-50"
            disabled={busy}
          >
            Create
          </button>
        </>
      }
    >
      <form id="adj-create-form" className="space-y-3" onSubmit={submit}>
        <div>
          <span className={labelClass()}>Transaction</span>
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="txk"
                checked={txKind === "payment"}
                onChange={() => setTxKind("payment")}
              />
              Payment
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="txk"
                checked={txKind === "finance"}
                onChange={() => setTxKind("finance")}
              />
              Finance
            </label>
          </div>
        </div>
        {txKind === "payment" ? (
          <div>
            <label className={labelClass()} htmlFor="adj-pay">
              Payment transaction ID *
            </label>
            <input
              id="adj-pay"
              className={`${inputClass()} font-mono text-xs`}
              value={paymentId}
              onChange={(e) => setPaymentId(e.target.value)}
              required
            />
          </div>
        ) : (
          <div>
            <label className={labelClass()} htmlFor="adj-fin">
              Finance transaction ID *
            </label>
            <input
              id="adj-fin"
              className={`${inputClass()} font-mono text-xs`}
              value={financeId}
              onChange={(e) => setFinanceId(e.target.value)}
              required
            />
          </div>
        )}
        <div>
          <label className={labelClass()} htmlFor="adj-orig">
            Original fee amount *
          </label>
          <input
            id="adj-orig"
            type="number"
            step="0.01"
            min={0.0001}
            className={inputClass()}
            value={originalFee}
            onChange={(e) => setOriginalFee(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelClass()} htmlFor="adj-new">
            Adjusted fee amount *
          </label>
          <input
            id="adj-new"
            type="number"
            step="0.01"
            className={inputClass()}
            value={adjustedFee}
            onChange={(e) => setAdjustedFee(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelClass()} htmlFor="adj-type">
            Adjustment type *
          </label>
          <select
            id="adj-type"
            className={inputClass()}
            value={adjType}
            onChange={(e) => setAdjType(e.target.value)}
          >
            {ADJUSTMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass()} htmlFor="adj-reason">
            Reason *
          </label>
          <input
            id="adj-reason"
            className={inputClass()}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelClass()} htmlFor="adj-notes">
            Notes
          </label>
          <textarea
            id="adj-notes"
            className={`${inputClass()} min-h-[72px]`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </form>
    </AdminModal>
  );
}

function CreateReconciliationModal({
  open,
  onClose,
  busy,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [date, setDate] = useState(() => todayYmd());
  const [startDate, setStartDate] = useState(() => monthStartYmd());
  const [endDate, setEndDate] = useState(() => todayYmd());
  const [gateway, setGateway] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [notes, setNotes] = useState("");
  const [ref, setRef] = useState("");
  const [computeLoading, setComputeLoading] = useState(false);
  const [autoComputed, setAutoComputed] = useState<FeeAutoComputed | null>(null);
  const [computeError, setComputeError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const today = todayYmd();
    setDate(today);
    setStartDate(monthStartYmd());
    setEndDate(today);
    setGateway("");
    setExpected("");
    setActual("");
    setNotes("");
    setRef("");
    setAutoComputed(null);
    setComputeError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setEndDate(date);
  }, [date, open]);

  const suggestExpectedFees = useCallback(async () => {
    const gw = gateway.trim();
    if (!gw || !startDate || !endDate) return;
    setComputeLoading(true);
    setComputeError(null);
    setAutoComputed(null);
    try {
      const qs = new URLSearchParams({
        auto_compute: "true",
        gateway: gw,
        start_date: startDate,
        end_date: endDate,
        page: "1",
        limit: "1",
      });
      const res = await adminApi.getRawJson<{
        auto_computed: FeeAutoComputed | null;
        auto_compute_error?: string | null;
      }>(`/api/admin/fees/reconciliations?${qs.toString()}`, { timeoutMs: 120_000 });

      if (res.auto_compute_error) {
        setComputeError(res.auto_compute_error);
        return;
      }
      if (!res.auto_computed) {
        setComputeError("No suggestion returned — check gateway and date range.");
        return;
      }
      setAutoComputed(res.auto_computed);
      setExpected(String(res.auto_computed.expected_fees_from_config));
      setActual(String(res.auto_computed.recorded_fees));
    } catch (e) {
      setComputeError(e instanceof Error ? e.message : "Failed to compute suggested fees");
    } finally {
      setComputeLoading(false);
    }
  }, [gateway, startDate, endDate]);

  useEffect(() => {
    if (!open) return;
    if (!gateway.trim() || !startDate || !endDate) return;
    void suggestExpectedFees();
  }, [open, gateway, startDate, endDate, suggestExpectedFees]);

  async function suggestExpectedFeesClick() {
    const gw = gateway.trim();
    if (!gw) {
      adminToast.error("Enter a gateway name first (e.g. paystack)");
      return;
    }
    await suggestExpectedFees();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const ex = parseFloat(expected);
    const ac = parseFloat(actual);
    if (!gateway.trim()) {
      adminToast.error("Gateway name is required");
      return;
    }
    if (!Number.isFinite(ex) || !Number.isFinite(ac)) {
      adminToast.error("Expected and actual fees must be numbers");
      return;
    }
    onSubmit({
      reconciliation_date: date,
      gateway_name: gateway.trim(),
      expected_fees: ex,
      actual_fees: ac,
      recorded_fees: autoComputed?.recorded_fees ?? ac,
      notes: notes.trim() || null,
      statement_reference: ref.trim() || null,
    });
  }

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="New reconciliation"
      description="Expected = fee config. Actual defaults to ledger-recorded Paystack fees for the period."
      footer={
        <>
          <button type="button" className={adminToolbarButtonClass()} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="recon-create-form"
            className="inline-flex min-h-11 min-w-[5.5rem] items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-50"
            disabled={busy}
          >
            Create
          </button>
        </>
      }
    >
      <form id="recon-create-form" className="space-y-3" onSubmit={submit}>
        <div>
          <label className={labelClass()} htmlFor="rec-date">
            Reconciliation date *
          </label>
          <input
            id="rec-date"
            type="date"
            className={inputClass()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelClass()} htmlFor="rec-gw">
            Gateway name *
          </label>
          <input
            id="rec-gw"
            className={inputClass()}
            value={gateway}
            onChange={(e) => setGateway(e.target.value)}
            list="rec-gateway-suggestions"
            placeholder="paystack"
            required
          />
          <datalist id="rec-gateway-suggestions">
            <option value="paystack" />
            <option value="yoco" />
          </datalist>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass()} htmlFor="rec-start">
              Period start *
            </label>
            <input
              id="rec-start"
              type="date"
              className={inputClass()}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className={labelClass()} htmlFor="rec-end">
              Period end *
            </label>
            <input
              id="rec-end"
              type="date"
              className={inputClass()}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={adminToolbarButtonClass(false)}
            disabled={computeLoading || !gateway.trim()}
            onClick={() => void suggestExpectedFeesClick()}
          >
            {computeLoading ? "Calculating…" : "Suggest expected fees"}
          </button>
          <span className="text-xs text-muted-foreground">
            Uses fee configs + {gateway.trim() || "gateway"} charges in this period.
          </span>
        </div>
        {computeError ? (
          <p className="text-sm text-amber-700">{computeError}</p>
        ) : null}
        {autoComputed ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <p>
              Ledger recorded fees (from webhooks):{" "}
              <strong>{formatAdminCurrency(autoComputed.recorded_fees, DEFAULT_CURRENCY)}</strong>
              {" · "}
              {autoComputed.charge_count} charge{autoComputed.charge_count === 1 ? "" : "s"}
              {autoComputed.payout_transfer_count > 0
                ? ` · ${autoComputed.payout_transfer_count} payout transfer fee${autoComputed.payout_transfer_count === 1 ? "" : "s"}`
                : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Actual is pre-filled from ledger-recorded fees (webhook truth). Adjust if you have a Paystack statement override.
            </p>
          </div>
        ) : null}
        <div>
          <label className={labelClass()} htmlFor="rec-exp">
            Expected fees *
          </label>
          <input
            id="rec-exp"
            type="number"
            step="0.01"
            className={inputClass()}
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelClass()} htmlFor="rec-act">
            Actual fees *
          </label>
          <input
            id="rec-act"
            type="number"
            step="0.01"
            className={inputClass()}
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelClass()} htmlFor="rec-ref">
            Statement reference
          </label>
          <input id="rec-ref" className={inputClass()} value={ref} onChange={(e) => setRef(e.target.value)} />
        </div>
        <div>
          <label className={labelClass()} htmlFor="rec-notes">
            Notes
          </label>
          <textarea
            id="rec-notes"
            className={`${inputClass()} min-h-[72px]`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </form>
    </AdminModal>
  );
}

function EditReconciliationModal({
  open,
  row,
  onClose,
  busy,
  onSubmit,
}: {
  open: boolean;
  row: ReconciliationRow | null;
  onClose: () => void;
  busy: boolean;
  onSubmit: (body: { id: string; status: string; notes: string }) => void;
}) {
  const [status, setStatus] = useState<string>(RECON_STATUSES[0]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open && row) {
      setStatus(String(row.status ?? "pending"));
      setNotes(row.notes != null ? String(row.notes) : "");
    }
  }, [open, row]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!row?.id) return;
    onSubmit({ id: String(row.id), status, notes });
  }

  if (!row) return null;

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Update reconciliation"
      footer={
        <>
          <button type="button" className={adminToolbarButtonClass()} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="recon-patch-form"
            className="inline-flex min-h-11 min-w-[5.5rem] items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-50"
            disabled={busy}
          >
            Save
          </button>
        </>
      }
    >
      <form id="recon-patch-form" className="space-y-3" onSubmit={submit}>
        <p className="text-xs text-gray-500">
          Gateway: <strong>{String(row.gateway_name ?? "")}</strong> · Date:{" "}
          {row.reconciliation_date
            ? new Date(String(row.reconciliation_date)).toLocaleDateString()
            : "—"}
        </p>
        <div>
          <label className={labelClass()} htmlFor="rec-st">
            Status
          </label>
          <select id="rec-st" className={inputClass()} value={status} onChange={(e) => setStatus(e.target.value)}>
            {RECON_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass()} htmlFor="rec-notes2">
            Notes
          </label>
          <textarea
            id="rec-notes2"
            className={`${inputClass()} min-h-[100px]`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </form>
    </AdminModal>
  );
}
