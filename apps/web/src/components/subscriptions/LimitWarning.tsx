"use client";

import { useTranslation } from "@beautonomi/i18n";

import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, TrendingUp } from "lucide-react";
import Link from "next/link";

interface LimitWarningProps {
  featureType: "bookings" | "messages" | "staff" | "locations";
  currentUsage: number;
  limit: number | null;
  percentageUsed: number;
  planName: string;
  onUpgrade?: () => void;
  className?: string;
}

export default function LimitWarning({
  featureType,
  currentUsage,
  limit,
  percentageUsed,
  planName,
  onUpgrade,
  className = "",
}: LimitWarningProps) {
  const { t } = useTranslation();
  if (limit === null) {
    return null; // Unlimited, no warning needed
  }

  const isWarning = percentageUsed >= 80 && percentageUsed < 100;
  const isExceeded = percentageUsed >= 100;

  if (!isWarning && !isExceeded) {
    return null;
  }

  const featureLabel = t(
    {
      bookings: "web.layout.navbar.bookings",
      messages: "web.provider.sidebar.items.messages",
      staff: "web.providerExtras.staffMembers",
      locations: "web.provider.sidebar.items.locations",
    }[featureType],
  );

  return (
    <Alert
      variant={isExceeded ? "destructive" : "default"}
      className={`${className} ${
        isWarning ? "border-yellow-500 bg-yellow-50" : ""
      }`}
    >
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>
        {isExceeded
          ? t("web.providerExtras.limitReached", { feature: featureLabel })
          : t("web.providerExtras.limitWarning", { feature: featureLabel })}
      </AlertTitle>
      <AlertDescription className="mt-2">
        <div className="space-y-2">
          <p>
            {isExceeded
              ? t("web.providerExtras.limitReachedBody", {
                  feature: featureLabel.toLowerCase(),
                  current: currentUsage,
                  limit,
                  plan: planName,
                })
              : t("web.providerExtras.limitWarningBody", {
                  feature: featureLabel.toLowerCase(),
                  current: currentUsage,
                  limit,
                  percent: Math.round(percentageUsed),
                })}
          </p>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${
                isExceeded
                  ? "bg-red-600"
                  : isWarning
                  ? "bg-yellow-500"
                  : "bg-green-500"
              }`}
              style={{ width: `${Math.min(percentageUsed, 100)}%` }}
            />
          </div>
          <div className="flex items-center gap-2 mt-3">
            <Button
              asChild
              variant={isExceeded ? "default" : "outline"}
              size="sm"
              onClick={onUpgrade}
            >
              <Link href="/provider/subscription">
                <TrendingUp className="w-4 h-4 me-2" />
                {t("web.providerExtras.upgradePlan")}
              </Link>
            </Button>
            {isExceeded && (
              <p className="text-sm text-gray-600">
                {t("web.providerExtras.upgradeToContinue")}
              </p>
            )}
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
}
