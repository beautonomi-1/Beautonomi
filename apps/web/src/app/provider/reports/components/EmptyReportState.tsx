"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, RefreshCw } from "lucide-react";

interface EmptyReportStateProps {
  title?: string;
  description?: string;
  /** Optional retry action — render a button (e.g. to re-run a failed fetch). */
  action?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
}

export function EmptyReportState({
  title = "No Data Available",
  description = "There is no data to display for the selected date range.",
  action,
}: EmptyReportStateProps) {
  return (
    <Card className="rounded-xl border-gray-200 shadow-sm">
      <CardContent className="p-12 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="p-4 bg-gray-50 rounded-2xl">
            <FileText className="w-12 h-12 text-gray-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
            <p className="text-sm text-gray-600 max-w-md">{description}</p>
          </div>
          {action ? (
            <Button
              type="button"
              variant="outline"
              onClick={action.onClick}
              disabled={action.disabled}
              className="rounded-xl"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {action.label}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
