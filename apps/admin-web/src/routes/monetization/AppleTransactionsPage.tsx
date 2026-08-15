import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminToast } from "@/lib/adminToast";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";

type AppleTransactionRow = {
  id: string;
  transaction_id: string;
  original_transaction_id: string;
  provider_id: string | null;
  product_id: string;
  transaction_type: string;
  purchase_date: string;
  expires_date: string | null;
  environment: string;
  price_zar: number | null;
  currency: string;
  attribution_status: string;
  notification_uuid: string | null;
  created_at: string;
};

type TransactionsPayload = {
  items: AppleTransactionRow[];
  meta: { page: number; limit: number; total: number; has_more: boolean };
};

const zar = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n);

export function AppleTransactionsPage() {
  useAdminDocumentTitle("Apple IAP Transactions");
  const { allowed, denied } = useSuperadminPage("Apple IAP transactions are superadmin-only.");
  void allowed;
  const [page, setPage] = useState(1);
  const [environment, setEnvironment] = useState("");
  const [attributionStatus, setAttributionStatus] = useState("");
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupKind, setLookupKind] = useState<"transaction_id" | "original_transaction_id" | "order_id">(
    "transaction_id",
  );
  const [extendDays, setExtendDays] = useState("7");
  const [extendOtid, setExtendOtid] = useState("");
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<unknown>(null);
  const limit = 50;
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: adminQueryKeys.appleTransactions(page, environment, attributionStatus),
    queryFn: () => {
      const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (environment) qs.set("environment", environment);
      if (attributionStatus) qs.set("attribution_status", attributionStatus);
      return adminApi.getJson<TransactionsPayload>(`/api/admin/monetization/apple/transactions?${qs}`, {
        timeoutMs: 30_000,
      });
    },
  });

  /**
   * Replays a stored transaction after a mapping fix so the provider gets what
   * they paid for without repurchasing.
   */
  const replay = useMutation({
    mutationFn: (transactionId: string) =>
      adminApi.postJson("/api/admin/monetization/apple/transactions", {
        transaction_id: transactionId,
      }),
    onSuccess: async () => {
      adminToast.success("Transaction replayed");
      await qc.invalidateQueries({ queryKey: adminQueryKeys.appleTransactionsRoot() });
    },
    onError: (error: Error) => adminToast.error(error.message),
    onSettled: () => setReplayingId(null),
  });

  const lookup = useMutation({
    mutationFn: () => {
      const qs = new URLSearchParams();
      qs.set(lookupKind, lookupQuery.trim());
      return adminApi.getJson(`/api/admin/monetization/apple/lookup?${qs}`, { timeoutMs: 45_000 });
    },
    onSuccess: (res) => {
      setLookupResult(res);
      adminToast.success("Apple lookup complete");
    },
    onError: (error: Error) => adminToast.error(error.message),
  });

  const extendSub = useMutation({
    mutationFn: () =>
      adminApi.postJson("/api/admin/monetization/apple/extend", {
        original_transaction_id: extendOtid.trim(),
        extend_by_days: Number(extendDays) || 7,
        extend_reason_code: 1,
      }),
    onSuccess: async () => {
      adminToast.success("Complimentary days requested from Apple");
      await qc.invalidateQueries({ queryKey: adminQueryKeys.appleTransactionsRoot() });
    },
    onError: (error: Error) => adminToast.error(error.message),
  });

  const sendConsumption = useMutation({
    mutationFn: (payload: { transaction_id: string; refund_preference?: 1 | 2 }) =>
      adminApi.postJson("/api/admin/monetization/apple/consumption", payload),
    onSuccess: () => adminToast.success("Consumption information sent to Apple"),
    onError: (error: Error) => adminToast.error(error.message),
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Apple IAP Transactions" />
        <AdminPanel>
          <AdminPageSkeleton rows={8} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const d = q.data;
  const items = d?.items ?? [];
  const meta = d?.meta;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Apple IAP Transactions"
        description="Verified StoreKit transactions. Replay reapplies a paid payload. Lookup / grant time / consumption talk to the App Store Server API — Apple still owns the charge."
      />

      <AdminPanel>
        <h2 className="text-base font-semibold text-gray-900">Support ops</h2>
        <p className="mt-1 text-sm text-gray-600">
          Apple does not let Beautonomi refund an App Store charge. Look up an order, grant complimentary days, or
          answer an outstanding refund request with consumption data.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            Lookup
            <select
              className="ml-2 rounded border border-gray-200 px-2 py-1 text-sm"
              value={lookupKind}
              onChange={(e) => setLookupKind(e.target.value as typeof lookupKind)}
            >
              <option value="transaction_id">transaction id</option>
              <option value="original_transaction_id">original transaction id</option>
              <option value="order_id">order id</option>
            </select>
          </label>
          <input
            className="min-w-[16rem] flex-1 rounded border border-gray-200 px-2 py-1 font-mono text-sm"
            value={lookupQuery}
            onChange={(e) => setLookupQuery(e.target.value)}
            placeholder="2000000…"
          />
          <button
            type="button"
            className={adminToolbarButtonClass(lookup.isPending)}
            disabled={lookup.isPending || !lookupQuery.trim()}
            onClick={() => lookup.mutate()}
          >
            {lookup.isPending ? "Looking up…" : "Lookup"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input
            className="min-w-[16rem] flex-1 rounded border border-gray-200 px-2 py-1 font-mono text-sm"
            value={extendOtid}
            onChange={(e) => setExtendOtid(e.target.value)}
            placeholder="Original transaction id to grant time"
          />
          <input
            type="number"
            min={1}
            max={90}
            className="w-20 rounded border border-gray-200 px-2 py-1 text-sm"
            value={extendDays}
            onChange={(e) => setExtendDays(e.target.value)}
          />
          <button
            type="button"
            className={adminToolbarButtonClass(extendSub.isPending)}
            disabled={extendSub.isPending || !extendOtid.trim()}
            onClick={() => extendSub.mutate()}
          >
            {extendSub.isPending ? "Extending…" : "Grant days"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <button
            type="button"
            className={adminToolbarButtonClass(sendConsumption.isPending)}
            disabled={sendConsumption.isPending || !lookupQuery.trim() || lookupKind !== "transaction_id"}
            onClick={() => sendConsumption.mutate({ transaction_id: lookupQuery.trim() })}
          >
            Send consumption (computed)
          </button>
          <button
            type="button"
            className={adminToolbarButtonClass(sendConsumption.isPending)}
            disabled={sendConsumption.isPending || !lookupQuery.trim() || lookupKind !== "transaction_id"}
            onClick={() =>
              sendConsumption.mutate({ transaction_id: lookupQuery.trim(), refund_preference: 2 })
            }
          >
            Prefer decline
          </button>
          <button
            type="button"
            className={adminToolbarButtonClass(sendConsumption.isPending)}
            disabled={sendConsumption.isPending || !lookupQuery.trim() || lookupKind !== "transaction_id"}
            onClick={() =>
              sendConsumption.mutate({ transaction_id: lookupQuery.trim(), refund_preference: 1 })
            }
          >
            Prefer grant
          </button>
        </div>
        {lookupResult ? (
          <pre className="mt-3 max-h-64 overflow-auto rounded bg-gray-50 p-3 text-xs text-gray-800">
            {JSON.stringify(lookupResult, null, 2)}
          </pre>
        ) : null}
      </AdminPanel>

      <AdminPanel>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">
            Environment
            <select
              className="ml-2 rounded border border-gray-200 px-2 py-1 text-sm"
              value={environment}
              onChange={(e) => {
                setEnvironment(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All</option>
              <option value="Production">Production</option>
              <option value="Sandbox">Sandbox</option>
            </select>
          </label>
          <label className="text-sm">
            Attribution
            <select
              className="ml-2 rounded border border-gray-200 px-2 py-1 text-sm"
              value={attributionStatus}
              onChange={(e) => {
                setAttributionStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All</option>
              <option value="bound">bound</option>
              <option value="pending">pending</option>
              <option value="failed">failed</option>
            </select>
          </label>
          {meta ? (
            <span className="self-center text-sm text-gray-600">
              {meta.total} total · page {meta.page}
            </span>
          ) : null}
        </div>
      </AdminPanel>

      <AdminPanel className="overflow-x-auto">
        {items.length === 0 ? (
          <p className="text-sm text-gray-500">No transactions yet.</p>
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Purchase date</AdminTh>
                <AdminTh>Transaction ID</AdminTh>
                <AdminTh>Product</AdminTh>
                <AdminTh>Type</AdminTh>
                <AdminTh>Env</AdminTh>
                <AdminTh>Price</AdminTh>
                <AdminTh>Attribution</AdminTh>
                <AdminTh>Notification</AdminTh>
                <AdminTh>Actions</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((row) => (
                <tr key={row.id}>
                  <AdminTd className="text-xs">{new Date(row.purchase_date).toLocaleString()}</AdminTd>
                  <AdminTd className="max-w-[10rem] truncate font-mono text-xs" title={row.transaction_id}>
                    {row.transaction_id}
                  </AdminTd>
                  <AdminTd className="max-w-[12rem] truncate font-mono text-xs">{row.product_id}</AdminTd>
                  <AdminTd className="text-xs">{row.transaction_type}</AdminTd>
                  <AdminTd className="text-xs">{row.environment}</AdminTd>
                  <AdminTd className="tabular-nums text-xs">{zar(row.price_zar)}</AdminTd>
                  <AdminTd className="text-xs">{row.attribution_status}</AdminTd>
                  <AdminTd className="text-xs">{row.notification_uuid ? "yes" : "—"}</AdminTd>
                  <AdminTd>
                    <button
                      type="button"
                      className={adminToolbarButtonClass(replayingId === row.transaction_id)}
                      disabled={replayingId === row.transaction_id}
                      title="Re-apply this purchase from its stored App Store payload"
                      onClick={() => {
                        setReplayingId(row.transaction_id);
                        replay.mutate(row.transaction_id);
                      }}
                    >
                      {replayingId === row.transaction_id ? "Replaying…" : "Replay"}
                    </button>
                    <button
                      type="button"
                      className={adminToolbarButtonClass(sendConsumption.isPending) + " ml-2"}
                      disabled={sendConsumption.isPending}
                      title="Send consumption for an outstanding Apple refund request"
                      onClick={() =>
                        sendConsumption.mutate({ transaction_id: row.transaction_id })
                      }
                    >
                      Consumption
                    </button>
                    <button
                      type="button"
                      className="ml-2 text-xs text-primary underline"
                      onClick={() => {
                        setExtendOtid(row.original_transaction_id);
                        setLookupKind("transaction_id");
                        setLookupQuery(row.transaction_id);
                      }}
                    >
                      Use ids
                    </button>
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
        {meta && (meta.page > 1 || meta.has_more) ? (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className={adminToolbarButtonClass(false)}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className={adminToolbarButtonClass(false)}
              disabled={!meta.has_more}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </AdminPanel>
    </div>
  );
}
