"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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
      toast.error("You do not have permission to issue refunds");
      return;
    }
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Enter a valid refund amount");
      return;
    }
    setSaving(true);
    try {
      await fetcher.post(`/api/provider/bookings/${bookingId}/refund`, {
        amount: parsed,
        reason: reason.trim() || undefined,
        refund_method: refundMethod,
      });
      toast.success("Refund issued");
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(formatApiErrorMessage(error, "Failed to issue refund"));
    } finally {
      setSaving(false);
    }
  };

  const footer = canProcessPayments ? (
    <BookingActionButton disabled={saving} onClick={handleSubmit}>
      {saving ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Processing…
        </>
      ) : (
        "Issue refund"
      )}
    </BookingActionButton>
  ) : undefined;

  return (
    <BookingBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      mode="edit"
      title={participantName ? `Refund — ${participantName}` : "Participant refund"}
      footer={footer}
    >
      <div className="space-y-4 pb-4">
        {!canProcessPayments ? (
          <PermissionGateInline
            allowed={false}
            message="You do not have permission to issue refunds."
          />
        ) : (
        <>
        <BookingSectionCard>
          <BookingSectionLabel htmlFor="refund-amount" className="mb-2">
            Amount
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
            <p className="text-xs text-gray-500 mt-1">Max refundable: {maxAmount.toFixed(2)}</p>
          ) : null}
        </BookingSectionCard>

        <BookingSectionCard>
          <BookingSectionLabel className="mb-2">Refund method</BookingSectionLabel>
          <Select value={refundMethod} onValueChange={(v) => setRefundMethod(v as typeof refundMethod)}>
            <SelectTrigger className="rounded-xl min-h-[44px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {paycloudEnabled && paycloudReady ? (
                <SelectItem value="original">Original payment method</SelectItem>
              ) : null}
              <SelectItem value="store_credit">Store credit</SelectItem>
              <SelectItem value="cash">Cash / in person</SelectItem>
            </SelectContent>
          </Select>
        </BookingSectionCard>

        <BookingSectionCard>
          <BookingSectionLabel htmlFor="refund-reason" className="mb-2">
            Reason
          </BookingSectionLabel>
          <Textarea
            id="refund-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="rounded-xl"
            placeholder="Optional reason for audit trail"
          />
        </BookingSectionCard>
        </>
        )}
      </div>
    </BookingBottomSheet>
  );
}
