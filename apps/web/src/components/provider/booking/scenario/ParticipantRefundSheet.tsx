"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";
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
import { fetcher } from "@/lib/http/fetcher";
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
  const { hasPermission, isOwner } = usePermissions();
  const canProcessPayments = isOwner || hasPermission("process_payments");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<"store_credit" | "cash" | "original">("cash");
  const [saving, setSaving] = useState(false);
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const { ready: paycloudReady } = usePaycloudCollectReady();

  useEffect(() => {
    if (open) {
      setAmount(maxAmount != null ? String(maxAmount) : "");
      setReason("");
      setRefundMethod(paycloudEnabled && paycloudReady ? "original" : "cash");
    }
  }, [open, maxAmount, paycloudEnabled, paycloudReady]);

  const handleSubmit = async () => {
    if (!canProcessPayments) {
      toast.error(t(`${prefix}.noPermissionToast`));
      return;
    }
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error(t(`${prefix}.invalidAmount`));
      return;
    }
    setSaving(true);
    try {
      await fetcher.post(`/api/provider/bookings/${bookingId}/refund`, {
        amount: parsed,
        reason: reason.trim() || undefined,
        refund_method: refundMethod,
      });
      toast.success(t(`${prefix}.issued`));
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(formatApiErrorMessage(error, t(`${prefix}.failed`)));
    } finally {
      setSaving(false);
    }
  };

  const footer = canProcessPayments ? (
    <BookingActionButton disabled={saving} onClick={handleSubmit}>
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
          <Select value={refundMethod} onValueChange={(v) => setRefundMethod(v as typeof refundMethod)}>
            <SelectTrigger className="rounded-xl min-h-[44px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {paycloudEnabled && paycloudReady ? (
                <SelectItem value="original">{t(`${prefix}.originalMethod`)}</SelectItem>
              ) : null}
              <SelectItem value="store_credit">{t(`${prefix}.storeCredit`)}</SelectItem>
              <SelectItem value="cash">{t(`${prefix}.cash`)}</SelectItem>
            </SelectContent>
          </Select>
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
