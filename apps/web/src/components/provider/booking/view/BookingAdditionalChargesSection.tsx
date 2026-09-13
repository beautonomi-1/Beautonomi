"use client";

import { useTranslation } from "@beautonomi/i18n";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import { Input } from "@/components/ui/input";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { usePermissions } from "@/hooks/usePermissions";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { PaycloudCollectButton } from "@/components/provider-portal/PaycloudCollectButton";
import { BookingSectionCard, BookingSectionLabel, BookingActionButton, PermissionGateInline } from "../ui";

const PayCloudPaymentDialog = dynamic(
  () =>
    import("@/components/provider-portal/PayCloudPaymentDialog").then((m) => ({
      default: m.PayCloudPaymentDialog,
    })),
  { ssr: false },
);

type AdditionalCharge = {
  id: string;
  description?: string;
  amount?: number;
  status?: string;
};

interface BookingAdditionalChargesSectionProps {
  bookingId: string;
  bookingLocationId?: string | null;
  onUpdated?: () => void;
}

export function BookingAdditionalChargesSection({
  bookingId,
  bookingLocationId = null,
  onUpdated,
}: BookingAdditionalChargesSectionProps) {
  const { format: formatMoney } = useProviderMoneyFormat();
  const { t } = useTranslation();
  const { hasPermission, isOwner } = usePermissions();
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const canProcessPayments = isOwner || hasPermission("process_payments");
  const [charges, setCharges] = useState<AdditionalCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [paycloudChargeId, setPaycloudChargeId] = useState<string | null>(null);
  const [paycloudAmount, setPaycloudAmount] = useState(0);
  const [paycloudOpen, setPaycloudOpen] = useState(false);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetcher.get<{ data?: AdditionalCharge[] }>(
        `/api/provider/bookings/${bookingId}/additional-charges`,
      );
      setCharges(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setCharges([]);
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const requestCharge = async () => {
    const amt = Number(amount);
    if (!description.trim() || !Number.isFinite(amt) || amt <= 0) {
      toast.error(t("web.provider.bookingAdditionalCharges.enterDescriptionAmount"));
      return;
    }
    setSaving(true);
    try {
      await fetcher.post(`/api/provider/bookings/${bookingId}/request-payment`, {
        description: description.trim(),
        amount: amt,
      });
      toast.success(t("web.provider.bookingAdditionalCharges.chargeRequested"));
      setDescription("");
      setAmount("");
      await load();
      onUpdated?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("web.provider.bookingAdditionalCharges.requestFailed"));
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async (chargeId: string) => {
    try {
      await fetcher.post(
        `/api/provider/bookings/${bookingId}/additional-charges/${chargeId}/mark-paid`,
        {},
      );
      toast.success(t("web.provider.bookingAdditionalCharges.markedPaid"));
      await load();
      onUpdated?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("web.provider.bookingAdditionalCharges.markPaidFailed"));
    }
  };

  const sendToClient = async (chargeId: string) => {
    setNotifyingId(chargeId);
    try {
      await fetcher.post(`/api/provider/bookings/${bookingId}/additional-charges/${chargeId}/notify`, {});
      toast.success(t("web.provider.bookingAdditionalCharges.reminderSent"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("web.provider.bookingAdditionalCharges.reminderFailed"));
    } finally {
      setNotifyingId(null);
    }
  };

  const openPaycloudForCharge = (chargeId: string, chargeAmount: number) => {
    if (chargeAmount <= 0) {
      toast.error(t("web.provider.bookingAdditionalCharges.noBalance"));
      return;
    }
    setPaycloudChargeId(chargeId);
    setPaycloudAmount(chargeAmount);
    setPaycloudOpen(true);
  };

  const unpaidStatuses = new Set(["pending", "approved"]);

  return (
    <BookingSectionCard>
      <BookingSectionLabel className="mb-3">{t("web.provider.bookingAdditionalCharges.title")}</BookingSectionLabel>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      ) : charges.length > 0 ? (
        <ul className="space-y-3 mb-4">
          {charges.map((c) => {
            const amt = Number(c.amount ?? 0);
            const isUnpaid = unpaidStatuses.has(String(c.status ?? "").toLowerCase());
            return (
              <li key={c.id} className="rounded-xl border border-gray-100 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{c.description ?? t("web.provider.bookingAdditionalCharges.chargeFallback")}</p>
                    <p className="text-xs text-gray-500 capitalize">{c.status ?? t("web.provider.bookingAdditionalCharges.pending")}</p>
                  </div>
                  <span className="font-medium shrink-0">{formatMoney(amt)}</span>
                </div>
                {isUnpaid && canProcessPayments ? (
                  <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      className="text-xs font-semibold underline touch-manipulation min-h-[36px] px-1"
                      disabled={notifyingId === c.id}
                      onClick={() => void sendToClient(c.id)}
                    >
                      {notifyingId === c.id ? t("web.provider.bookingAdditionalCharges.sending") : t("web.provider.bookingAdditionalCharges.sendToClient")}
                    </button>
                    <button
                      type="button"
                      className="text-xs font-semibold underline touch-manipulation min-h-[36px] px-1"
                      onClick={() => void markPaid(c.id)}
                    >
{t("web.provider.bookingAdditionalCharges.markPaid")}
                    </button>
                    {paycloudEnabled ? (
                      <PaycloudCollectButton
                        amount={amt}
                        currency="ZAR"
                        context="additional_charge"
                        onClick={() => openPaycloudForCharge(c.id, amt)}
                        size="sm"
                        className="min-h-[36px]"
                      />
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-gray-500 mb-3">{t("web.provider.bookingAdditionalCharges.empty")}</p>
      )}

      <PermissionGateInline
        allowed={canProcessPayments}
        message={t("web.provider.bookingAdditionalCharges.noPermission")}
      >
        <div className="space-y-2 border-t pt-3">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("web.provider.bookingAdditionalCharges.description")}
            className="rounded-xl min-h-[44px]"
          />
          <Input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t("web.provider.bookingAdditionalCharges.amount")}
            className="rounded-xl min-h-[44px]"
          />
          <BookingActionButton disabled={saving} onClick={() => void requestCharge()}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Plus className="me-2 h-4 w-4" />
{t("web.provider.bookingAdditionalCharges.requestCharge")}
              </>
            )}
          </BookingActionButton>
        </div>
      </PermissionGateInline>

      {paycloudChargeId ? (
        <PayCloudPaymentDialog
          open={paycloudOpen}
          onOpenChange={setPaycloudOpen}
          entityType="additional_charge"
          entityId={paycloudChargeId}
          amount={paycloudAmount}
          bookingLocationId={bookingLocationId}
          onSuccess={() => {
            setPaycloudOpen(false);
            setPaycloudChargeId(null);
            void load();
            onUpdated?.();
          }}
        />
      ) : null}
    </BookingSectionCard>
  );
}
