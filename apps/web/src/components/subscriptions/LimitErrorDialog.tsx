"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@beautonomi/i18n";

interface LimitErrorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureType: string;
  message: string;
  currentCount: number;
  limitValue: number | null;
  planName: string;
}

export default function LimitErrorDialog({
  open,
  onOpenChange,
  featureType,
  message,
  currentCount,
  limitValue,
  planName,
}: LimitErrorDialogProps) {
  const { t } = useTranslation();
  const featureLabels: Record<string, string> = {
    bookings: t("web.provider.limitError.featureBookings"),
    messages: t("web.provider.limitError.featureMessages"),
    staff: t("web.provider.limitError.featureStaff"),
    locations: t("web.provider.limitError.featureLocations"),
  };

  const featureLabel = featureLabels[featureType] || featureType;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <DialogTitle>{t("web.provider.limitError.title")}</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            {message}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-600 mb-2">
                {t("web.provider.limitError.currentPlan", { plan: planName })}
              </p>
              {limitValue !== null && (
                <p className="text-sm text-gray-600">
                  {t("web.provider.limitError.usage", { current: currentCount, limit: limitValue })}
                </p>
              )}
            </div>
            <div className="bg-gray-100 rounded-lg p-4">
              <p className="text-sm font-medium mb-2">{t("web.provider.limitError.upgradeToContinue")}</p>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li>{t("web.provider.limitError.removeLimits", { feature: featureLabel })}</li>
                <li>{t("web.provider.limitError.premiumFeatures")}</li>
                <li>{t("web.provider.limitError.prioritySupport")}</li>
              </ul>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button asChild>
            <Link href="/provider/subscription">
              <TrendingUp className="w-4 h-4 me-2" />
              {t("web.provider.limitError.upgradePlan")}
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
