"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { usePaycloudCollectReady } from "@/hooks/usePaycloudCollectReady";
import {
  formatPaycloudCollectLabel,
  PAYCLOUD_SETUP_LABEL,
  type PaycloudCollectContext,
} from "@/lib/payments/paycloud-collect-cta";

type ButtonVariant = ComponentProps<typeof Button>["variant"];
type ButtonSize = ComponentProps<typeof Button>["size"];

export interface PaycloudCollectButtonProps {
  amount: number;
  currency: string;
  context: PaycloudCollectContext;
  onClick: () => void;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  showIcon?: boolean;
  inFlight?: boolean;
  depositAmount?: number | null;
  fullOutstanding?: number | null;
}

export function PaycloudCollectButton({
  amount,
  currency,
  context,
  onClick,
  className,
  variant = "outline",
  size = "sm",
  showIcon = true,
  inFlight,
  depositAmount,
  fullOutstanding,
}: PaycloudCollectButtonProps) {
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const { ready, loading, blockers, terminals } = usePaycloudCollectReady();

  if (!paycloudEnabled) return null;

  if (loading) {
    return (
      <Button variant={variant} size={size} className={className} disabled>
        {showIcon ? <CreditCard className="h-4 w-4" /> : null}
        Card machine…
      </Button>
    );
  }

  const hasInFlight = inFlight ?? (terminals?.inFlight ?? 0) > 0;
  const label = formatPaycloudCollectLabel({
    context,
    amount,
    currency,
    inFlight: hasInFlight,
    depositAmount,
    fullOutstanding,
  });

  if (!ready && !hasInFlight) {
    const href = blockers[0]?.href ?? "/provider/settings/sales/card-machines";
    const setupLabel = blockers[0]?.title ?? PAYCLOUD_SETUP_LABEL;
    return (
      <Button variant={variant} size={size} className={className} asChild>
        <Link href={href}>{setupLabel}</Link>
      </Button>
    );
  }

  return (
    <Button variant={variant} size={size} className={className} onClick={onClick}>
      {showIcon ? <CreditCard className="h-4 w-4" /> : null}
      {label}
    </Button>
  );
}
