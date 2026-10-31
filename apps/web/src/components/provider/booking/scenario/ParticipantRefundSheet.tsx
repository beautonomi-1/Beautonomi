"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { usePaycloudCollectReady } from "@/hooks/usePaycloudCollectReady";
import { usePermissions } from "@/hooks/usePermissions";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { formatApiErrorMessage } from "@/lib/http/api-error";
import {
  BookingBottomSheet,
  BookingActionButton,
  BookingSectionCard,
  BookingSectionLabel,
} from "../ui";
import { PermissionGateInline } from "./PermissionGateInline";

interface ParticipantRefundSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  participantName?: string;
  maxAmount?: number;
  onSuccess?: () => void;
}

export function ParticipantRefundSheet({
  open,
  onOpenChange,
  bookingId,
  participantName,
  maxAmount,
  onSuccess,
}: ParticipantRefundSheetProps) {
  const { t } = useTranslation();
  const prefix = "web.provider.portal.participantRefund";
  const refundPrefix = "web.provider.bookings.detail.refund";
  const { hasPermission, isOwner } = usePermissions();
  const canProcessPayments = isOwner || hasPermission("process_payments");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<"store_credit" | "cash" | "original">("cash");
  const [saving, setSaving] = useState(false);
  const [yocoPendingRecord, setYocoPendingRecord] = useState(false);
  const [pendingCashTotal, setPendingCashTotal] = useState(0);
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const { ready: paycloudReady } = usePaycloudCollectReady();
  const cardRefundAvailable = (paycloudEnabled && paycloudReady) || yocoEnabled;

  useEffect(() => {
    if (open) {
      setAmount(maxAmount != null ? String(maxAmount) : "");
      setReason("");
      setYocoPendingRecord(false);
      setPendingCashTotal(0);
      setRefundMethod(paycloudEnabled && paycloudReady ? "original" : "cash");
    }
  }, [open, maxAmount, paycloudEnabled, paycloudReady]);

  useEffect(() => {
    if (!open || !bookingId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetcher.get<{
          data?: { pending_cash_refunds?: Array<{ amount?: number }> };
        }>(`/api/provider/bookings/${bookingId}`);
        if (cancelled) return;
        const rows = res?.data?.pending_cash_refunds ?? [];
        const total = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
        setPendingCashTotal(total);
      } catch {
        if (!cancelled) setPendingCashTotal(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, bookingId]);

  const handleSubmit = async (options?: { recordOnly?: boolean }) => {
    if (!canProcessPayments) {
      toast.error(t(`${prefix}.noPermissionToast`));
      return;
    }
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error(t(`${prefix}.invalidAmount`));
      return;
    }
    if (!reason.trim()) {
      toast.error(t("web.provider.bookings.detail.toast.enterRefundReason"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetcher.post<{ data?: { pending_terminal?: boolean } }>(
        `/api/provider/bookings/${bookingId}/refund`,
        {
          amount: parsed,
          reason: reason.trim(),
          refund_method: options?.recordOnly ? "original" : refundMethod,
          ...(options?.recordOnly ? { record_only: true } : {}),
        },
      );
      if (options?.recordOnly) {
        toast.success(t(`${refundPrefix}.yocoRecorded`));
      } else if (res?.data?.pending_terminal) {
        toast.success(t(`${refundPrefix}.sentToCardMachine`));
      } else {
        toast.success(t(`${prefix}.issued`));
      }
      setYocoPendingRecord(false);
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      if (error instanceof FetchError && error.code === "YOCO_REFUND_ON_MACHINE") {
        setYocoPendingRecord(true);
        return;
      }
      toast.error(formatApiErrorMessage(error, t(`${prefix}.failed`)));
    } finally {
      setSaving(false);
    }
  };

  const footer = canProcessPayments ? (
    <BookingActionButton disabled={saving || !reason.trim()} onClick={() => void handleSubmit()}>
      {saving ? (
        <>
          <Loader2 className="me-2 h-4 w-4 animate-spin" />
          {t(`${prefix}.processing`)}
        </>
      ) : (
        t(`${prefix}.issueRefund`)
      )}
    </BookingActionButton>
  ) : undefined;

  return (
    <BookingBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      mode="edit"
      title={participantName ? t(`${prefix}.titleNamed`, { name: participantName }) : t(`${prefix}.title`)}
      footer={footer}
    >
      <div className="space-y-4 pb-4">
        {!canProcessPayments ? (
          <PermissionGateInline
            allowed={false}
            message={t(`${prefix}.noPermission`)}
          />
        ) : (
        <>
        {pendingCashTotal > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">{t(`${prefix}.pendingCashBlockTitle`)}</p>
            <p className="mt-1">
              {t(`${prefix}.pendingCashBlockBody`, { amount: pendingCashTotal.toFixed(2) })}
            </p>
          </div>
        ) : null}
        <BookingSectionCard>
          <BookingSectionLabel htmlFor="refund-amount" className="mb-2">
            {t(`${prefix}.amount`)}
          </BookingSectionLabel>
          <Input
            id="refund-amount"
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="rounded-xl min-h-[44px]"
          />
          {maxAmount != null ? (
            <p className="text-xs text-gray-500 mt-1">{t(`${prefix}.maxRefundable`, { amount: maxAmount.toFixed(2) })}</p>
          ) : null}
        </BookingSectionCard>

        <BookingSectionCard>
          <BookingSectionLabel className="mb-2">{t(`${prefix}.refundMethod`)}</BookingSectionLabel>
          <Select
            value={refundMethod}
            onValueChange={(v) => {
              setYocoPendingRecord(false);
              setRefundMethod(v as typeof refundMethod);
            }}
          >
            <SelectTrigger className="rounded-xl min-h-[44px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {cardRefundAvailable ? (
                <SelectItem value="original">{t(`${prefix}.originalMethod`)}</SelectItem>
              ) : null}
              <SelectItem value="store_credit">{t(`${prefix}.storeCredit`)}</SelectItem>
              <SelectItem value="cash">{t(`${prefix}.cash`)}</SelectItem>
            </SelectContent>
          </Select>
          {yocoPendingRecord ? (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">{t(`${refundPrefix}.yocoOnMachineTitle`)}</p>
              <p className="mt-1">
                {t(`${refundPrefix}.yocoOnMachineBody`, { amount: Number(amount || 0).toFixed(2) })}
              </p>
              <Button
                className="mt-3 w-full"
                variant="outline"
                disabled={saving}
                onClick={() => void handleSubmit({ recordOnly: true })}
              >
                {t(`${refundPrefix}.yocoRecordCta`)}
              </Button>
            </div>
          ) : null}
        </BookingSectionCard>

        <BookingSectionCard>
          <BookingSectionLabel htmlFor="refund-reason" className="mb-2">
            {t(`${prefix}.reason`)}
          </BookingSectionLabel>
          <Textarea
            id="refund-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="rounded-xl"
            placeholder={t(`${prefix}.reasonPlaceholder`)}
          />
        </BookingSectionCard>
        </>
        )}
      </div>
    </BookingBottomSheet>
  );
}
