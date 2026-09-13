"use client";

import { useTranslation } from "@beautonomi/i18n";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface BookingConflictAlertProps {
  conflictMessage: string;
  onRefresh?: () => void;
  onDismiss?: () => void;
}

export function BookingConflictAlert({
  conflictMessage,
  onRefresh,
  onDismiss
}: BookingConflictAlertProps) {
  const { t } = useTranslation();
  return (
    <Alert variant="destructive" className="mb-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{t("web.conflictAlert.title")}</AlertTitle>
      <AlertDescription className="mt-2">
        <p className="mb-3">{conflictMessage}</p>
        <div className="flex gap-2">
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              className="bg-white"
            >
              <RefreshCw className="w-3 h-3 me-2" />
              {t("web.conflictAlert.refreshRetry")}
            </Button>
          )}
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
            >
              {t("common.dismiss")}
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
