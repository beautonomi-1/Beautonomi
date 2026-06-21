import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { AdminPanel } from "@/components/ui/AdminPanel";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";

type CreditBalance = {
  included_balance_zar: number;
  purchased_balance_zar: number;
  total_zar: number;
};

type LedgerRow = {
  id: string;
  delta_zar: number;
  reason: string;
  channel?: string | null;
  balance_after: number;
  created_at: string;
};

type Payload = {
  balance: CreditBalance;
  ledger: LedgerRow[];
};

type PlatformOverride = boolean | null;

export function ProviderMarketingCreditsPanel({
  providerId,
  marketingUsePlatformCredentials = null,
}: {
  providerId: string;
  marketingUsePlatformCredentials?: PlatformOverride;
}) {
  const qc = useQueryClient();
  const [grantAmount, setGrantAmount] = useState("50");
  const [grantNote, setGrantNote] = useState("");
  const [override, setOverride] = useState<PlatformOverride>(marketingUsePlatformCredentials);

  useEffect(() => {
    setOverride(marketingUsePlatformCredentials);
  }, [marketingUsePlatformCredentials]);

  const q = useQuery({
    queryKey: adminQueryKeys.providerMarketingCredits(providerId),
    queryFn: () =>
      adminApi.getJson<Payload>(`/api/admin/providers/${encodeURIComponent(providerId)}/marketing-credits`),
    enabled: !!providerId,
  });

  const grantMut = useMutation({
    mutationFn: () =>
      adminApi.postJson(`/api/admin/providers/${encodeURIComponent(providerId)}/marketing-credits`, {
        amount_zar: Number(grantAmount),
        note: grantNote.trim() || undefined,
      }),
    onSuccess: () => {
      adminToast.success("Credits granted");
      setGrantNote("");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerMarketingCredits(providerId) });
    },
  });

  const overrideMut = useMutation({
    mutationFn: (value: PlatformOverride) =>
      adminApi.patchJson(`/api/admin/providers/${encodeURIComponent(providerId)}`, {
        marketing_use_platform_credentials: value,
      }),
    onSuccess: () => {
      adminToast.success("Platform sending override saved");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providers.detail(providerId) });
    },
    onError: (err: Error) => {
      adminToast.error(err.message || "Failed to save override");
      setOverride(marketingUsePlatformCredentials);
    },
  });

  const balance = q.data?.balance;
  const ledger = q.data?.ledger ?? [];

  const handleOverrideChange = (value: string) => {
    const next: PlatformOverride =
      value === "inherit" ? null : value === "force_on" ? true : false;
    setOverride(next);
    overrideMut.mutate(next);
  };

  return (
    <AdminPanel>
      <h2 className="text-lg font-semibold text-gray-900">Marketing credits</h2>
      <p className="mt-1 text-sm text-gray-600">
        Platform marketing send balance (included resets monthly; purchased rolls over).
      </p>

      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <label className="text-xs font-medium text-gray-700">Platform sending override</label>
        <p className="mt-1 text-xs text-gray-500">
          Per-provider override for Growth plan platform credentials. Inherit uses the subscription plan default.
        </p>
        <select
          className="mt-2 min-h-10 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
          value={override === null ? "inherit" : override ? "force_on" : "force_off"}
          onChange={(e) => handleOverrideChange(e.target.value)}
          disabled={overrideMut.isPending}
        >
          <option value="inherit">Inherit from plan</option>
          <option value="force_on">Force platform sending on</option>
          <option value="force_off">Force platform sending off</option>
        </select>
      </div>

      {q.isLoading && <p className="mt-4 text-sm text-gray-500">Loading…</p>}
      {q.error && <p className="mt-4 text-sm text-red-600">{q.error.message}</p>}

      {balance && (
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-gray-500">Total</dt>
            <dd className="text-lg font-semibold">R{balance.total_zar.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Included</dt>
            <dd>R{balance.included_balance_zar.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Purchased</dt>
            <dd>R{balance.purchased_balance_zar.toFixed(2)}</dd>
          </div>
        </dl>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-xs">
          Adjust (ZAR)
          <input
            type="number"
            value={grantAmount}
            onChange={(e) => setGrantAmount(e.target.value)}
            className="mt-1 block w-28 rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
        <p className="w-full text-xs text-gray-500">
          Positive adds purchased credits; negative deducts (audit logged). Included monthly grant is managed by plan + cron.
        </p>
        <label className="text-xs">
          Note
          <input
            value={grantNote}
            onChange={(e) => setGrantNote(e.target.value)}
            className="mt-1 block w-48 rounded border border-gray-300 px-2 py-1 text-sm"
            placeholder="Optional audit note"
          />
        </label>
        <button
          type="button"
          className={adminToolbarButtonClass(grantMut.isPending)}
          disabled={grantMut.isPending}
          onClick={() => grantMut.mutate()}
        >
          Grant / deduct credits
        </button>
      </div>

      {ledger.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>When</AdminTh>
                <AdminTh>Reason</AdminTh>
                <AdminTh>Delta</AdminTh>
                <AdminTh>Balance after</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {ledger.slice(0, 15).map((row) => (
                <tr key={row.id}>
                  <AdminTd className="text-xs">{new Date(row.created_at).toLocaleString()}</AdminTd>
                  <AdminTd>{row.reason}</AdminTd>
                  <AdminTd className={row.delta_zar < 0 ? "text-red-600" : "text-green-700"}>
                    {row.delta_zar >= 0 ? "+" : ""}R{row.delta_zar.toFixed(2)}
                  </AdminTd>
                  <AdminTd>R{row.balance_after.toFixed(2)}</AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        </div>
      )}
    </AdminPanel>
  );
}
