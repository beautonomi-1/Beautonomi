"use client";

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
      toast.error("Enter description and amount");
      return;
    }
    setSaving(true);
    try {
      await fetcher.post(`/api/provider/bookings/${bookingId}/request-payment`, {
        description: description.trim(),
        amount: amt,
      });
      toast.success("Charge requested");
      setDescription("");
      setAmount("");
      await load();
      onUpdated?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to request charge");
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
      toast.success("Charge marked paid");
      await load();
      onUpdated?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to mark paid");
    }
  };

  const sendToClient = async (chargeId: string) => {
    setNotifyingId(chargeId);
    try {
      await fetcher.post(`/api/provider/bookings/${bookingId}/additional-charges/${chargeId}/notify`, {});
      toast.success("Reminder sent");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send reminder");
    } finally {
      setNotifyingId(null);
    }
  };

  const openPaycloudForCharge = (chargeId: string, chargeAmount: number) => {
    if (chargeAmount <= 0) {
      toast.error("There is no remaining balance to collect.");
      return;
    }
    setPaycloudChargeId(chargeId);
    setPaycloudAmount(chargeAmount);
    setPaycloudOpen(true);
  };

  const unpaidStatuses = new Set(["pending", "approved"]);

  return (
    <BookingSectionCard>
      <BookingSectionLabel className="mb-3">Additional charges</BookingSectionLabel>
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
                    <p className="font-medium truncate">{c.description ?? "Charge"}</p>
                    <p className="text-xs text-gray-500 capitalize">{c.status ?? "pending"}</p>
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
                      {notifyingId === c.id ? "Sending…" : "Send to client"}
                    </button>
                    <button
                      type="button"
                      className="text-xs font-semibold underline touch-manipulation min-h-[36px] px-1"
                      onClick={() => void markPaid(c.id)}
                    >
                      Mark paid
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
        <p className="text-sm text-gray-500 mb-3">No additional charges yet.</p>
      )}

      <PermissionGateInline
        allowed={canProcessPayments}
        message="You do not have permission to request additional charges."
      >
        <div className="space-y-2 border-t pt-3">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
            className="rounded-xl min-h-[44px]"
          />
          <Input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            className="rounded-xl min-h-[44px]"
          />
          <BookingActionButton disabled={saving} onClick={() => void requestCharge()}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Request charge
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
