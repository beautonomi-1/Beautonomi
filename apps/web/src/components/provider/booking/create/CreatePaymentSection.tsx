"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Banknote,
  CreditCard,
  Link2,
  Smartphone,
  Clock,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { usePaycloudCollectReady } from "@/hooks/usePaycloudCollectReady";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { manualCardCollectOptionLabel } from "@beautonomi/utils";
import { BookingSectionCard, BookingSectionLabel } from "../ui";

export type CreatePaymentMethod =
  | "pay_later"
  | "cash"
  | "card"
  | "payment_link"
  | "yoco_pos"
  | "paycloud_terminal"
  | "paystack_terminal";

interface CreatePaymentSectionProps {
  paymentMethod: CreatePaymentMethod;
  onPaymentMethodChange: (method: CreatePaymentMethod) => void;
  collectDeposit: boolean;
  onCollectDepositChange: (value: boolean) => void;
  sendNotification: boolean;
  onSendNotificationChange: (value: boolean) => void;
  depositPercentage?: number;
  showDeposit?: boolean;
  totalAmount?: number;
}

type MethodChip = {
  id: CreatePaymentMethod;
  label: string;
  icon: typeof Clock;
};

export function CreatePaymentSection({
  paymentMethod,
  onPaymentMethodChange,
  collectDeposit,
  onCollectDepositChange,
  sendNotification,
  onSendNotificationChange,
  depositPercentage = 50,
  showDeposit = true,
  totalAmount = 0,
}: CreatePaymentSectionProps) {
  const yocoEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.PAYMENT_YOCO);
  const paycloudEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.PAYMENT_PAYCLOUD);
  const paystackEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.PAYMENT_PAYSTACK_VIRTUAL_TERMINAL);
  const paymentLinkEnabled = useFeatureFlag("payment_link");
  const manualCardEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.PAYMENT_MANUAL_CARD);
  const { ready: paycloudReady, blockers } = usePaycloudCollectReady();

  const methods: MethodChip[] = useMemo(() => {
    const list: MethodChip[] = [
      { id: "pay_later", label: "Pay later", icon: Clock },
      { id: "cash", label: "Cash", icon: Banknote },
    ];
    if (manualCardEnabled) {
      list.push({ id: "card", label: manualCardCollectOptionLabel(), icon: CreditCard });
    }
    if (paymentLinkEnabled) {
      list.push({ id: "payment_link", label: "Payment link", icon: Link2 });
    }
    if (yocoEnabled) {
      list.push({ id: "yoco_pos", label: "Yoco", icon: Smartphone });
    }
    if (paycloudEnabled && paycloudReady) {
      list.push({ id: "paycloud_terminal", label: "PayCloud", icon: CreditCard });
    }
    if (paystackEnabled) {
      list.push({ id: "paystack_terminal", label: "Paystack", icon: Wallet });
    }
    return list;
  }, [
    manualCardEnabled,
    paymentLinkEnabled,
    yocoEnabled,
    paycloudEnabled,
    paycloudReady,
    paystackEnabled,
  ]);

  useEffect(() => {
    if (!methods.some((m) => m.id === paymentMethod)) {
      onPaymentMethodChange("pay_later");
    }
  }, [methods, paymentMethod, onPaymentMethodChange]);

  const depositDue =
    collectDeposit && depositPercentage > 0 && totalAmount > 0
      ? Math.ceil((totalAmount * depositPercentage) / 100)
      : 0;

  return (
    <BookingSectionCard>
      <BookingSectionLabel className="mb-3">Payment & notifications</BookingSectionLabel>
      <div className="space-y-4">
        <div>
          <p className="text-xs font-medium text-gray-600 mb-2">Payment method</p>
          <div className="flex flex-wrap gap-2">
            {methods.map(({ id, label, icon: Icon }) => {
              const active = paymentMethod === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onPaymentMethodChange(id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold touch-manipulation min-h-[40px]",
                    active
                      ? "bg-gray-900 border-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {paycloudEnabled && !paycloudReady ? (
          <p className="text-xs text-amber-800">
            PayCloud is enabled but not ready.{" "}
            <Link
              href={blockers[0]?.href ?? "/provider/settings/sales/card-machines"}
              className="font-semibold underline"
            >
              Set up card machine
            </Link>
          </p>
        ) : null}

        {showDeposit ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-600">Amount to collect now</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onCollectDepositChange(false)}
                className={cn(
                  "flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold touch-manipulation",
                  !collectDeposit
                    ? "bg-gray-900 border-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-700",
                )}
              >
                Full payment
              </button>
              <button
                type="button"
                onClick={() => onCollectDepositChange(true)}
                className={cn(
                  "flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold touch-manipulation",
                  collectDeposit
                    ? "bg-gray-900 border-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-700",
                )}
              >
                Deposit ({depositPercentage}%)
              </button>
            </div>
            {collectDeposit && depositDue > 0 ? (
              <p className="text-xs text-gray-500">Deposit due now: {depositDue.toFixed(2)}</p>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 pt-1 border-t">
          <div>
            <p className="text-sm font-medium text-gray-900">Notify client</p>
            <p className="text-xs text-gray-500">Send booking confirmation</p>
          </div>
          <Switch checked={sendNotification} onCheckedChange={onSendNotificationChange} />
        </div>
      </div>
    </BookingSectionCard>
  );
}
