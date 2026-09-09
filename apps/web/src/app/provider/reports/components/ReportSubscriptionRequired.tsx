"use client";

import { SubscriptionGate } from "@/components/provider/SubscriptionGate";

type ReportSubscriptionRequiredProps = {
  feature: string;
  /** API or catalog message — shown as body copy under the report title. */
  message?: string | null;
};

export function ReportSubscriptionRequired({ feature, message }: ReportSubscriptionRequiredProps) {
  return (
    <SubscriptionGate
      feature={feature}
      message=""
      upgradeMessage={
        message?.trim() ||
        "This report is not included in your current plan. Upgrade under Subscription to unlock it."
      }
    />
  );
}
