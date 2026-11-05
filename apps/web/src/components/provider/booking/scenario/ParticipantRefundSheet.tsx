"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { usePermissions } from "@/hooks/usePermissions";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { formatApiErrorMessage } from "@/lib/http/api-error";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  BookingBottomSheet,
  BookingActionButton,
  BookingSectionCard,
  BookingSectionLabel,
} from "../ui";
import { PermissionGateInline } from "./PermissionGateInline";

type RefundCaps = {
  maxRefundable: number;
  onlineCap: number;
  cashCap: number;
  terminalCap: number;
  hasCustomerAccount: boolean;
  suggestedMethod: "store_credit" | "cash" | "original";
};

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
  const gb = (key: string, opts?: Record<string, unknown>) =>
    String(t(`provider.mobile.screens.groupBookings.${key}`, opts as never));
  const { hasPermission, isOwner } = usePermissions();
  const canIssueRefunds = isOwner || hasPermission("issue_refunds");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<"store_credit" | "cash" | "original">("cash");
  const [saving, setSaving] = useState(false);
  const [yocoPendingRecord, setYocoPendingRecord] = useState(false);
  const [refundCaps, setRefundCaps] = useState<RefundCaps | null>(null);
  const [refundOptionsLoading, setRefundOptionsLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paycloudEnabled = useFeatureFlag("payment_paycloud");

  const fallbackMax = maxAmount ?? 0;
  const maxRefundable = refundCaps?.maxRefundable ?? fallbackMax;

  useEffect(() => {
    if (open) {
      setAmount("");
      setReason("");
      setYocoPendingRecord(false);
      setRefundCaps(null);
      setConfirmOpen(false);
    }
  }, [open, bookingId]);

  useEffect(() => {
    if (!open || !bookingId || !canIssueRefunds) return;
    let cancelled = false;
    setRefundOptionsLoading(true);
    void (async () => {
      try {
        const res = await fetcher.get<{ data?: { caps?: RefundCaps } }>(
          `/api/provider/bookings/${bookingId}/refund-options`,
        );
        if (cancelled) return;
        const caps = res?.data?.caps;
        if (caps) {
          setRefundCaps(caps);
          setRefundMethod(caps.suggestedMethod);
        }
      } catch {
        if (!cancelled) setRefundCaps(null);
      } finally {
        if (!cancelled) setRefundOptionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, bookingId, canIssueRefunds]);

  const showWalletMethod =
    (refundCaps?.onlineCap ?? 0) > 0.01 && refundCaps?.hasCustomerAccount === true;
  const showOriginalMethod =
    (refundCaps?.terminalCap ?? 0) > 0.01 && (yocoEnabled || paycloudEnabled);
  const showCashMethod = (refundCaps?.cashCap ?? maxRefundable) > 0.01 || !refundCaps;

  const refundMethodLabel = (method: typeof refundMethod) => {
    if (method === "original") return t(`${prefix}.originalMethod`);
    if (method === "store_credit") return t(`${prefix}.storeCredit`);
    return t(`${prefix}.cash`);
  };

  const handleSubmit = async (options?: { recordOnly?: boolean }) => {
    if (!canIssueRefunds) {
      toast.error(t(`${prefix}.noPermissionToast`));
      return;
    }
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error(t(`${prefix}.invalidAmount`));
      return;
    }
    if (parsed > maxRefundable + 0.01) {
      toast.error(t("web.provider.bookings.detail.toast.refundExceeds", { amount: maxRefundable.toFixed(2) }));
      return;
    }
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      toast.error(t("web.provider.bookings.detail.toast.enterRefundReason"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetcher.post<{ data?: { pending_terminal?: boolean } }>(
        `/api/provider/bookings/${bookingId}/refund`,
        {
          amount: parsed,
          reason: trimmedReason,
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
      setConfirmOpen(false);
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      if (error instanceof FetchError && error.code === "YOCO_REFUND_ON_MACHINE") {
        setYocoPendingRecord(true);
        return;
      }
      if (error instanceof FetchError && error.code === "WALLET_REFUND_CAP_EXCEEDED") {
        toast.error(gb("refundWalletCapExceeded"));
        return;
      }
      toast.error(formatApiErrorMessage(error, t(`${prefix}.failed`)));
    } finally {
      setSaving(false);
    }
  };

  const requestSubmit = (options?: { recordOnly?: boolean }) => {
    if (options?.recordOnly) {
      void handleSubmit(options);
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
    setConfirmOpen(true);
  };

  const footer = canIssueRefunds ? (
    <BookingActionButton
      disabled={saving || !reason.trim() || maxRefundable <= 0}
      onClick={() => requestSubmit()}
    >
      {saving ? (
        <>
          <Loader2 className="me-2 h-4 w-4 animate-spin" />
          {t(`${prefix}.processing`)}
        </>
      ) : (
        gb("refundConfirm")
      )}
    </BookingActionButton>
  ) : undefined;

  return (
    <>
      <BookingBottomSheet
        open={open}
        onOpenChange={onOpenChange}
        mode="edit"
        title={participantName ? t(`${prefix}.titleNamed`, { name: participantName }) : t(`${prefix}.title`)}
        footer={footer}
      >
        <div className="space-y-4 pb-4">
          {!canIssueRefunds ? (
            <PermissionGateInline allowed={false} message={t(`${prefix}.noPermission`)} />
          ) : (
            <>
              {refundOptionsLoading ? (
                <div className="flex items-center text-xs text-gray-500">
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  {t(`${prefix}.processing`)}
                </div>
              ) : null}
              {refundCaps ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 space-y-1">
                  <p className="font-semibold uppercase text-gray-500">{gb("refundCapsTitle")}</p>
                  {showWalletMethod ? (
                    <p>{gb("refundCapsOnline", { amount: refundCaps.onlineCap.toFixed(2) })}</p>
                  ) : null}
                  {showCashMethod ? (
                    <p>{gb("refundCapsCash", { amount: refundCaps.cashCap.toFixed(2) })}</p>
                  ) : null}
                  {showOriginalMethod ? (
                    <p>{gb("refundCapsTerminal", { amount: refundCaps.terminalCap.toFixed(2) })}</p>
                  ) : null}
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
                  placeholder={gb("refundAmountPlaceholder")}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {gb("refundNetRefundable", {
                    amount: maxRefundable.toFixed(2),
                    detail: "",
                  })}
                </p>
              </BookingSectionCard>

              {(showOriginalMethod || showWalletMethod || showCashMethod) && (
                <BookingSectionCard>
                  <BookingSectionLabel className="mb-2">{t(`${prefix}.refundMethod`)}</BookingSectionLabel>
                  <div className="flex flex-wrap gap-2">
                    {showOriginalMethod ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={refundMethod === "original" ? "default" : "outline"}
                        onClick={() => {
                          setYocoPendingRecord(false);
                          setRefundMethod("original");
                        }}
                      >
                        {t(`${refundPrefix}.backToCard`)}
                      </Button>
                    ) : null}
                    {showWalletMethod ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={refundMethod === "store_credit" ? "default" : "outline"}
                        onClick={() => {
                          setYocoPendingRecord(false);
                          setRefundMethod("store_credit");
                        }}
                      >
                        {t(`${prefix}.storeCredit`)}
                      </Button>
                    ) : null}
                    {showCashMethod ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={refundMethod === "cash" ? "default" : "outline"}
                        onClick={() => {
                          setYocoPendingRecord(false);
                          setRefundMethod("cash");
                        }}
                      >
                        {t(`${prefix}.cash`)}
                      </Button>
                    ) : null}
                  </div>
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
              )}

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

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{gb("refundConfirmSummaryTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line">
              {gb("refundConfirmSummaryBody", {
                amount: Number(amount || 0).toFixed(2),
                method: refundMethodLabel(refundMethod),
                reason: reason.trim(),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{gb("cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={() => void handleSubmit()}>
              {gb("refundConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
