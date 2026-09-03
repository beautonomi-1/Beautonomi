import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { adminToolbarButtonClass } from "@/lib/adminUi";

type GlBal = { code: string; name: string | null; balance: number; found: boolean };
type Health = {
  generated_at: string;
  window: { days: number; since: string; until: string };
  drift:
    | { available: true; missing_row_count: number; imbalanced_entry_count: number; shadowed_row_count: number }
    | { available: false; error?: string };
  unmapped: { open_exceptions: number; suspense_account: GlBal };
  unrecognized_payments: { count: number; amount: number; scanned: number; capped: boolean };
  deferred_vs_recognized: Array<{
    product: string;
    deferred_rows: number;
    deferred_cash_in: number;
    deferred_rows_with_nonzero_net: number;
    recognition_rows: number;
    recognized_net: number;
  }>;
  liabilities: { gift_cards_2400: GlBal; memberships_2600: GlBal };
  staff_earnings_lines: { total_rows: number; total_amount: number; by_kind: Record<string, { rows: number; amount: number }> };
  webhook_signature_rejections: {
    last_24h: Record<string, { events: number; attempts: number }>;
    last_7d: Record<string, { events: number; attempts: number }>;
  };
  queues: { open_reconciliation_exceptions: number; pending_ledger_repairs: number };
};

function money(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : "—";
}

export function LedgerHealthPage() {
  useAdminDocumentTitle("Ledger health");
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_FINANCE, "Finance access is required.");
  const [days, setDays] = useState("30");

  const query = useQuery({
    queryKey: adminQueryKeys.ledgerHealth(days),
    enabled: allowed,
    queryFn: () =>
      adminApi.getJson<Health>(`/api/admin/finance/ledger-health?days=${encodeURIComponent(days)}`, {
        timeoutMs: 60_000,
      }),
  });

  if (denied) return denied;

  const authFailed = isAdminApiAuthFailure(query.error);
  const d = query.data;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Ledger health"
        description="Drift, suspense, unrecognized online payments, deferred vs recognized, gift-card (2400) and membership (2600) liability, staff lines, webhook signature failures."
      />
      <AdminPanel>
        <div className="mb-4 flex flex-wrap gap-2">
          <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm" value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">365 days</option>
          </select>
          <button type="button" className={adminToolbarButtonClass()} onClick={() => void query.refetch()}>
            Refresh
          </button>
        </div>
        {query.isLoading ? (
          <AdminPageSkeleton rows={3} />
        ) : authFailed ? (
          <AdminRetryBlock message={query.error instanceof Error ? query.error.message : "Failed to load"} onRetry={() => void query.refetch()} />
        ) : !d ? (
          <p className="text-sm text-gray-600">No data.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <HealthCard title="Drift">
              {d.drift.available ? (
                <ul className="text-sm text-gray-700">
                  <li>Missing shadow rows: {d.drift.missing_row_count}</li>
                  <li>Imbalanced journals: {d.drift.imbalanced_entry_count}</li>
                  <li>Shadowed rows: {d.drift.shadowed_row_count}</li>
                </ul>
              ) : (
                <p className="text-sm text-red-700">{d.drift.error ?? "RPC unavailable"}</p>
              )}
            </HealthCard>
            <HealthCard title="Suspense / unmapped">
              <p className="text-sm">Open unmapped exceptions: {d.unmapped.open_exceptions}</p>
              <p className="text-sm">
                9999 {d.unmapped.suspense_account.found ? d.unmapped.suspense_account.name : "(missing)"}:{" "}
                {money(d.unmapped.suspense_account.balance)}
              </p>
            </HealthCard>
            <HealthCard title="Unrecognized payments">
              <p className="text-sm">
                {d.unrecognized_payments.count} completed online booking_payments without a payment FT
                {d.unrecognized_payments.capped ? " (capped scan)" : ""}
              </p>
              <p className="text-sm">Amount: {money(d.unrecognized_payments.amount)}</p>
            </HealthCard>
            <HealthCard title="Liabilities">
              <p className="text-sm">Gift cards 2400: {money(d.liabilities.gift_cards_2400.balance)}</p>
              <p className="text-sm">Memberships 2600: {money(d.liabilities.memberships_2600.balance)}</p>
            </HealthCard>
            <HealthCard title="Queues">
              <p className="text-sm">Open exceptions: {d.queues.open_reconciliation_exceptions}</p>
              <p className="text-sm">Pending repairs: {d.queues.pending_ledger_repairs}</p>
            </HealthCard>
            <HealthCard title="Staff earnings lines">
              <p className="text-sm">
                {d.staff_earnings_lines.total_rows} rows · {money(d.staff_earnings_lines.total_amount)}
              </p>
              <ul className="mt-1 text-xs text-gray-600">
                {Object.entries(d.staff_earnings_lines.by_kind).map(([k, v]) => (
                  <li key={k}>
                    {k}: {v.rows} / {money(v.amount)}
                  </li>
                ))}
              </ul>
            </HealthCard>
            <HealthCard title="Deferred vs recognized">
              <ul className="text-xs text-gray-700">
                {d.deferred_vs_recognized.map((p) => (
                  <li key={p.product} className="mb-1">
                    <span className="font-medium">{p.product}</span>: deferred {p.deferred_rows} (
                    {money(p.deferred_cash_in)})
                    {p.deferred_rows_with_nonzero_net > 0 ? ` · ${p.deferred_rows_with_nonzero_net} nonzero-net` : ""} ·
                    recognized {p.recognition_rows} ({money(p.recognized_net)})
                  </li>
                ))}
              </ul>
            </HealthCard>
            <HealthCard title="Webhook signature rejections">
              <p className="text-xs font-medium">24h</p>
              <SigMap data={d.webhook_signature_rejections.last_24h} />
              <p className="mt-2 text-xs font-medium">7d</p>
              <SigMap data={d.webhook_signature_rejections.last_7d} />
            </HealthCard>
          </div>
        )}
      </AdminPanel>
    </div>
  );
}

function HealthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <h3 className="mb-2 text-sm font-semibold text-gray-900">{title}</h3>
      {children}
    </div>
  );
}

function SigMap({ data }: { data: Record<string, { events: number; attempts: number }> }) {
  const entries = Object.entries(data ?? {});
  if (entries.length === 0) return <p className="text-xs text-gray-500">None</p>;
  return (
    <ul className="text-xs text-gray-700">
      {entries.map(([src, v]) => (
        <li key={src}>
          {src}: {v.events} events / {v.attempts} attempts
        </li>
      ))}
    </ul>
  );
}
