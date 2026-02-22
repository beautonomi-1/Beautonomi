"use client";

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
  return (
    <Alert variant="destructive" className="mb-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Conflict Detected</AlertTitle>
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
              <RefreshCw className="w-3 h-3 mr-2" />
              Refresh & Retry
            </Button>
          )}
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
            >
              Dismiss
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
