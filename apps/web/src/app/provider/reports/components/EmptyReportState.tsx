"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";

interface EmptyReportStateProps {
  title?: string;
  description?: string;
}

export function EmptyReportState({
  title = "No Data Available",
  description = "There is no data to display for the selected date range.",
}: EmptyReportStateProps) {
  return (
    <Card className="border-gray-200">
      <CardContent className="p-12 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="p-4 bg-gray-50 rounded-full">
            <FileText className="w-12 h-12 text-gray-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
            <p className="text-sm text-gray-600 max-w-md">{description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
