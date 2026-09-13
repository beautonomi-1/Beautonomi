"use client";

/**
 * VerificationStatusCard
 *
 * Renders the correct state for each NormalizedVerificationStatus.
 * Status is conveyed by icon + text (not color alone) for accessibility.
 * Uses a live-region for dynamic status updates.
 */

import { useEffect, useRef } from "react";
import { useTranslation } from "@beautonomi/i18n";
import type { NormalizedVerificationStatus } from "@/lib/identity-verification/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck, ShieldAlert, Clock, AlertCircle,
  RotateCcw, ArrowRight, Loader2,
} from "lucide-react";

interface Props {
  status: NormalizedVerificationStatus | null;
  rejectionReason?: string | null;
  onStart?: () => void;
  onRetry?: () => void;
  onContinue?: () => void;
  loading?: boolean;
  launching?: boolean;
  isProvider?: boolean;
  businessVerificationPending?: boolean;
  businessVerificationSummary?: string;
}

const STATUS_META: Record<
  NormalizedVerificationStatus,
  {
    icon: typeof ShieldCheck;
    iconClass: string;
    badgeVariant: "default" | "secondary" | "destructive" | "outline";
    badgeKey: string;
    titleKey: string;
    descriptionKey: string;
  }
> = {
  not_started: {
    icon: ShieldAlert,
    iconClass: "text-muted-foreground",
    badgeVariant: "outline",
    badgeKey: "notStarted",
    titleKey: "verifyTitle",
    descriptionKey: "verifyDescription",
  },
  session_created: {
    icon: ShieldAlert,
    iconClass: "text-muted-foreground",
    badgeVariant: "outline",
    badgeKey: "notStarted",
    titleKey: "verifyTitle",
    descriptionKey: "verifyDescription",
  },
  in_progress: {
    icon: Clock,
    iconClass: "text-yellow-500",
    badgeVariant: "secondary",
    badgeKey: "inProgress",
    titleKey: "continueTitle",
    descriptionKey: "continueDescription",
  },
  pending_review: {
    icon: Clock,
    iconClass: "text-blue-500",
    badgeVariant: "secondary",
    badgeKey: "underReview",
    titleKey: "underReviewTitle",
    descriptionKey: "underReviewDescription",
  },
  approved: {
    icon: ShieldCheck,
    iconClass: "text-green-600",
    badgeVariant: "default",
    badgeKey: "verified",
    titleKey: "identityVerified",
    descriptionKey: "identityVerifiedDescription",
  },
  rejected: {
    icon: AlertCircle,
    iconClass: "text-destructive",
    badgeVariant: "destructive",
    badgeKey: "failed",
    titleKey: "failedTitle",
    descriptionKey: "failedDescription",
  },
  expired: {
    icon: AlertCircle,
    iconClass: "text-amber-500",
    badgeVariant: "outline",
    badgeKey: "expired",
    titleKey: "expiredTitle",
    descriptionKey: "expiredDescription",
  },
  abandoned: {
    icon: AlertCircle,
    iconClass: "text-amber-500",
    badgeVariant: "outline",
    badgeKey: "notCompleted",
    titleKey: "notCompletedTitle",
    descriptionKey: "notCompletedDescription",
  },
  requires_retry: {
    icon: RotateCcw,
    iconClass: "text-amber-500",
    badgeVariant: "outline",
    badgeKey: "retryRequired",
    titleKey: "retryTitle",
    descriptionKey: "retryDescription",
  },
  errored: {
    icon: AlertCircle,
    iconClass: "text-destructive",
    badgeVariant: "destructive",
    badgeKey: "error",
    titleKey: "errorTitle",
    descriptionKey: "errorDescription",
  },
};

export function VerificationStatusCard({
  status,
  rejectionReason,
  onStart,
  onRetry,
  onContinue,
  loading,
  launching,
  isProvider = false,
  businessVerificationPending = false,
  businessVerificationSummary,
}: Props) {
  const { t } = useTranslation();
  const prefix = "web.accountSettings.identityVerification.statusCard";
  const liveRef = useRef<HTMLDivElement>(null);
  const resolvedStatus = status ?? "not_started";
  const baseMeta = STATUS_META[resolvedStatus] ?? STATUS_META.not_started;
  const badgeLabel =
    businessVerificationPending && resolvedStatus === "approved"
      ? t(`${prefix}.identityVerified`)
      : t(`${prefix}.${baseMeta.badgeKey}`);
  const title =
    businessVerificationPending && resolvedStatus === "approved"
      ? t(`${prefix}.identityVerified`)
      : t(`${prefix}.${baseMeta.titleKey}`);
  const description =
    businessVerificationPending && resolvedStatus === "approved"
      ? businessVerificationSummary ?? t(`${prefix}.businessPendingDescription`)
      : t(`${prefix}.${baseMeta.descriptionKey}`);
  const Icon = baseMeta.icon;

  useEffect(() => {
    if (liveRef.current) {
      liveRef.current.textContent = t(`${prefix}.liveStatus`, {
        label: badgeLabel,
        description,
      });
    }
  }, [resolvedStatus, badgeLabel, description, t, prefix]);

  if (loading && status == null) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
          <span className="sr-only">{t(`${prefix}.loadingStatus`)}</span>
        </CardContent>
      </Card>
    );
  }

  const showContinue = resolvedStatus === "in_progress";
  const showStart    = resolvedStatus === "not_started" || resolvedStatus === "session_created";
  const showRetry    = resolvedStatus === "rejected" || resolvedStatus === "expired" || resolvedStatus === "abandoned" || resolvedStatus === "requires_retry";

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div
          ref={liveRef}
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        />

        <div className="flex items-center gap-3">
          <Icon
            className={`h-7 w-7 shrink-0 ${baseMeta.iconClass}`}
            aria-hidden="true"
          />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-base">{title}</h3>
              <Badge variant={baseMeta.badgeVariant}>{badgeLabel}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>

        {resolvedStatus === "rejected" && rejectionReason && (
          <div
            className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2"
            role="alert"
          >
            <p className="text-sm font-medium">{t(`${prefix}.reason`, { reason: rejectionReason })}</p>
          </div>
        )}

        {resolvedStatus === "pending_review" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-label={t(`${prefix}.underReview`)}>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>{t(`${prefix}.reviewingDocuments`)}</span>
          </div>
        )}

        {launching && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>{t(`${prefix}.checkingStatus`)}</span>
          </div>
        )}

        {(showStart || showRetry) && (
          <p className="text-xs text-muted-foreground">
            {t(`${prefix}.consentBefore`)}{" "}
            <a
              href="https://didit.me"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {t(`${prefix}.didit`)}
            </a>{" "}
            {t(`${prefix}.consentMid`)}{" "}
            <a href="/privacy" className="underline">{t(`${prefix}.privacyNotice`)}</a>{" "}
            {t(`${prefix}.consentAnd`)}{" "}
            <a
              href="https://didit.me/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {t(`${prefix}.diditTerms`)}
            </a>
            {t(`${prefix}.consentEnd`)}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {showStart && onStart && (
            <Button
              onClick={onStart}
              disabled={loading || launching}
              aria-label={t(`${prefix}.startAria`)}
            >
              {loading ? (
                <><Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />{t(`${prefix}.loading`)}</>
              ) : (
                <><ArrowRight className="me-2 h-4 w-4" aria-hidden="true" />{t(`${prefix}.startVerification`)}</>
              )}
            </Button>
          )}
          {showContinue && onContinue && (
            <Button
              onClick={onContinue}
              disabled={loading}
              aria-label={t(`${prefix}.continueAria`)}
            >
              <ArrowRight className="me-2 h-4 w-4" aria-hidden="true" />{t(`${prefix}.continueVerification`)}
            </Button>
          )}
          {showRetry && onRetry && (
            <Button
              variant="outline"
              onClick={onRetry}
              disabled={loading}
              aria-label={t(`${prefix}.retryAria`)}
            >
              <RotateCcw className="me-2 h-4 w-4" aria-hidden="true" />{t(`${prefix}.tryAgain`)}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
