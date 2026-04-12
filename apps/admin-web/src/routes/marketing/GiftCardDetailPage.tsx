import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToast } from "@/lib/adminToast";
import { useTenantFeatureFlags, TENANT_PAYMENT_FEATURE_KEYS } from "@/hooks/useTenantFeatureFlags";
import { useEffect, useState } from "react";

type Gc = Record<string, unknown> & {
  id?: string;
  code?: string;
  balance?: number;
  initial_balance?: number;
  currency?: string;
  is_active?: boolean;
  expires_at?: string | null;
  redemptions?: unknown[];
};

type DetailPayload = { gift_card: Gc };

export function GiftCardDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_MARKETING_COMMS,
    "Marketing & comms access is required."
  );
  const qc = useQueryClient();
  const flagsQ = useTenantFeatureFlags([TENANT_PAYMENT_FEATURE_KEYS.GIFT_CARDS], allowed);
  const showGiftDisabledBanner =
    flagsQ.isSuccess && flagsQ.data?.features?.[TENANT_PAYMENT_FEATURE_KEYS.GIFT_CARDS] === false;

  const [balance, setBalance] = useState("");
  const [expires, setExpires] = useState("");

  const q = useQuery({
    queryKey: adminQueryKeys.giftCardDetail(id),
    queryFn: () => adminApi.getJson<DetailPayload>(`/api/admin/gift-cards/${id}`, { timeoutMs: 60_000 }),
    enabled: allowed && !!id,
  });

  const card = q.data?.gift_card;

  useEffect(() => {
    if (!card) return;
    setBalance(String(card.balance ?? ""));
    setExpires(card.expires_at ? String(card.expires_at).slice(0, 10) : "");
  }, [card?.id, card?.balance, card?.expires_at]);

  const patch = useMutation({
    mutationFn: (body: { balance?: number; is_active?: boolean; expires_at?: string | null }) =>
      adminApi.patchJson<unknown>(`/api/admin/gift-cards/${id}`, body),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.giftCardDetail(id) });
      void qc.invalidateQueries({ queryKey: [...adminQueryKeys.root, "gift-cards"] });
      if ("is_active" in vars) {
        adminToast.success(vars.is_active ? "Gift card activated" : "Gift card deactivated");
      } else if ("balance" in vars) {
        adminToast.success("Balance updated");
      } else {
        adminToast.success("Gift card updated");
      }
    },
    onError: (e: Error) => adminToast.error(`Failed to update gift card: ${e.message}`),
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Gift card" />
        <AdminPanel>
          <AdminPageSkeleton rows={4} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }
  if (!card) {
    return <AdminRetryBlock message="Gift card not found" onRetry={() => void q.refetch()} />;
  }

  const redemptions = Array.isArray(card.redemptions) ? card.redemptions : [];
  const err = patch.error instanceof Error ? patch.error.message : null;

  return (
    <div className="space-y-6">
      <p className="text-sm">
        <Link to={adminSpaTo("/admin/gift-cards")} className="text-gray-900 underline">
          ← Gift cards
        </Link>
      </p>
      <AdminPageHeader title={`Gift card ${card.code ?? id}`} description="PATCH /api/admin/gift-cards/[id]" />
      {showGiftDisabledBanner ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          The <code className="rounded bg-amber-100 px-1">gift_cards</code> feature flag is off for this market.
          Customer purchase flows are disabled; you can still adjust balances for support.
        </div>
      ) : null}
      <AdminPanel>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Currency</dt>
            <dd className="font-medium">{String(card.currency ?? "—")}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Initial balance</dt>
            <dd className="tabular-nums">{String(card.initial_balance ?? "—")}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Active</dt>
            <dd>{card.is_active ? "yes" : "no"}</dd>
          </div>
        </dl>
      </AdminPanel>
      <AdminPanel>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Update</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Balance
            <input
              className="ml-2 w-28 rounded border border-gray-300 px-2 py-1 tabular-nums"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Expires (date or empty)
            <input
              className="ml-2 rounded border border-gray-300 px-2 py-1"
              type="date"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
            disabled={patch.isPending}
            onClick={() => {
              const b = parseFloat(balance);
              if (Number.isNaN(b) || b < 0) return;
              patch.mutate({
                balance: b,
                expires_at: expires ? new Date(expires).toISOString() : null,
              });
            }}
          >
            Save balance & expiry
          </button>
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={patch.isPending}
            onClick={() => patch.mutate({ is_active: !card.is_active })}
          >
            {card.is_active ? "Deactivate" : "Activate"}
          </button>
        </div>
        {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
      </AdminPanel>
      <AdminPanel>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Redemptions ({redemptions.length})</h2>
        {redemptions.length === 0 ? (
          <p className="text-sm text-gray-600">No redemptions recorded for this gift card.</p>
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>User / Email</AdminTh>
                <AdminTh>Amount</AdminTh>
                <AdminTh>Booking / Order</AdminTh>
                <AdminTh>Redeemed at</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {redemptions.map((r, i) => {
                const row = r as Record<string, unknown>;
                return (
                  <tr key={String(row.id ?? i)}>
                    <AdminTd className="text-xs">
                      {String(row.user_email ?? row.email ?? row.user_id ?? "—")}
                    </AdminTd>
                    <AdminTd className="tabular-nums text-xs">
                      {String(row.amount ?? row.redeemed_amount ?? "—")}
                      {row.currency ? ` ${String(row.currency)}` : ""}
                    </AdminTd>
                    <AdminTd className="font-mono text-xs text-gray-500">
                      {String(row.booking_id ?? row.order_id ?? "—").slice(0, 16)}
                    </AdminTd>
                    <AdminTd className="text-xs text-gray-500">
                      {String(row.redeemed_at ?? row.created_at ?? "—").slice(0, 16).replace("T", " ")}
                    </AdminTd>
                  </tr>
                );
              })}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>
    </div>
  );
}
