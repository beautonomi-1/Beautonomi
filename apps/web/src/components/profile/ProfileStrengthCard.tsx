"use client";

import { useTranslation } from "@beautonomi/i18n";

import React from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle2 } from "lucide-react";

interface ChecklistItem {
  id: string;
  label: string;
  timeEstimate: string;
  completed: boolean;
  required: boolean;
}

interface ProfileStrengthCardProps {
  completed: number;
  total: number;
  percentage: number;
  topItems?: ChecklistItem[];
  onCompleteClick?: () => void;
  onItemClick?: (itemId: string) => void;
  variant?: "compact" | "expanded";
}

export default function ProfileStrengthCard({
  completed,
  total,
  percentage,
  topItems = [],
  onCompleteClick,
  onItemClick,
  variant = "compact",
}: ProfileStrengthCardProps) {
  const { t } = useTranslation();
  const isComplete = percentage === 100;

  return (
    <Card className="bg-white border border-gray-200 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between mb-2">
          <CardTitle className="text-lg font-semibold text-gray-900">
            {t("web.profile.floatingProgress.title")}
          </CardTitle>
          {isComplete && (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          )}
        </div>
        <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
          <span>
            {t("web.profile.floatingProgress.completedOf", { completed, total })}
          </span>
          <span className="font-semibold text-[#FF0077]">{percentage}%</span>
        </div>
        <Progress value={percentage} className="h-2.5" />
      </CardHeader>
      {variant === "expanded" && topItems.length > 0 && !isComplete && (
        <CardContent className="pt-0">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-700 mb-2">
              {t("web.profile.topItems")}
            </p>
            {topItems.slice(0, 3).map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onItemClick?.(item.id);
                }}
                className="w-full text-start flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors group border border-transparent hover:border-gray-200"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {item.completed ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-orange-500 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900 block truncate">
                      {item.label}
                    </span>
                    <span className="text-xs text-gray-500">
                      {item.timeEstimate}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-[#FF0077] font-medium ms-2 flex-shrink-0 group-hover:underline">
                  {item.completed ? t("common.edit") : t("web.profile.start")}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      )}
      {!isComplete && (
        <CardContent className="pt-0">
          <Button
            onClick={onCompleteClick}
            className="w-full bg-[#FF0077] hover:bg-[#E6006A] text-white"
          >
            {t("web.profile.floatingProgress.completeProfile")}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
