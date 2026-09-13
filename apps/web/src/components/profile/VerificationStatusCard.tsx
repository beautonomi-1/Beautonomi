"use client";

import { useTranslation } from "@beautonomi/i18n";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, XCircle, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface VerificationStatusCardProps {
  status: "none" | "pending" | "verified" | "failed";
  submittedAt?: Date;
  estimatedTime?: string;
  failureReason?: string;
  onAction: () => void;
}

export default function VerificationStatusCard({
  status,
  submittedAt,
  estimatedTime,
  failureReason,
  onAction,
}: VerificationStatusCardProps) {
  const { t } = useTranslation();
  const getStatusConfig = () => {
    switch (status) {
      case "verified":
        return {
          icon: CheckCircle2,
          iconColor: "text-green-600",
          bgColor: "bg-green-50",
          borderColor: "border-green-200",
          title: t("web.global.profile.identityVerified"),
          description: t("web.global.profile.identityVerifiedDesc"),
          buttonText: t("web.global.profile.viewStatus"),
          buttonVariant: "outline" as const,
          showButton: false,
        };
      case "pending":
        return {
          icon: Clock,
          iconColor: "text-yellow-600",
          bgColor: "bg-yellow-50",
          borderColor: "border-yellow-200",
          title: t("web.global.profile.verificationPending"),
          description: submittedAt
            ? t("web.global.profile.submittedOn", { date: submittedAt.toLocaleDateString(), eta: estimatedTime || t("web.global.profile.underReviewNotify") })
            : t("web.global.profile.pendingReview"),
          buttonText: t("web.global.profile.viewStatus"),
          buttonVariant: "outline" as const,
          showButton: false,
        };
      case "failed":
        return {
          icon: XCircle,
          iconColor: "text-red-600",
          bgColor: "bg-red-50",
          borderColor: "border-red-200",
          title: t("web.global.profile.verificationFailed"),
          description: failureReason || t("web.global.profile.verificationNotApproved"),
          buttonText: t("web.global.profile.uploadAgain"),
          buttonVariant: "default" as const,
          showButton: true,
        };
      default:
        return {
          icon: AlertCircle,
          iconColor: "text-gray-600",
          bgColor: "bg-gray-50",
          borderColor: "border-gray-200",
          title: t("web.global.profile.getVerified"),
          description:
            t("web.global.profile.getVerifiedDesc"),
          buttonText: t("web.global.profile.uploadId"),
          buttonVariant: "default" as const,
          showButton: true,
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <Card className={cn("w-full", config.bgColor, config.borderColor, "border-2")}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Icon className={cn("h-5 w-5 flex-shrink-0 mt-0.5", config.iconColor)} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className={cn("font-semibold text-sm", config.iconColor)}>
                {config.title}
              </h4>
              {status === "pending" && (
                <Badge variant="outline" className="text-xs border-yellow-300 text-yellow-700">
                  {t("web.global.profile.underReview")}
                </Badge>
              )}
            </div>
            <p className="text-sm text-gray-700 mb-3">{config.description}</p>
            {config.showButton && (
              <Button
                onClick={onAction}
                variant={config.buttonVariant}
                size="sm"
                className={cn(
                  config.buttonVariant === "default" &&
                    "bg-primary hover:bg-primary-hover text-white"
                )}
              >
                {config.buttonText}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
