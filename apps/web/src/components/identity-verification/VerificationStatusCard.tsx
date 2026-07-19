"use client";

/**
 * VerificationStatusCard
 *
 * Renders the correct state for each NormalizedVerificationStatus.
 * Status is conveyed by icon + text (not color alone) for accessibility.
 * Uses a live-region for dynamic status updates.
 */

import { useEffect, useRef } from "react";
import type { NormalizedVerificationStatus } from "@/lib/identity-verification/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck, ShieldAlert, Clock, AlertCircle,
  RotateCcw, ArrowRight, Loader2,
} from "lucide-react";

interface Props {
  status: NormalizedVerificationStatus;
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

const STATUS_CONFIG: Record<
  NormalizedVerificationStatus,
  {
    icon: typeof ShieldCheck;
    iconClass: string;
    badgeVariant: "default" | "secondary" | "destructive" | "outline";
    badgeLabel: string;
    title: string;
    description: string;
  }
> = {
  not_started: {
    icon: ShieldAlert,
    iconClass: "text-muted-foreground",
    badgeVariant: "outline",
    badgeLabel: "Not started",
    title: "Verify your identity",
    description:
      "We verify identities to keep the platform safe for everyone. You'll need a valid government ID or passport and your camera. Takes about 2 minutes.",
  },
  session_created: {
    icon: ShieldAlert,
    iconClass: "text-muted-foreground",
    badgeVariant: "outline",
    badgeLabel: "Not started",
    title: "Verify your identity",
    description:
      "We verify identities to keep the platform safe for everyone. You'll need a valid government ID or passport and your camera. Takes about 2 minutes.",
  },
  in_progress: {
    icon: Clock,
    iconClass: "text-yellow-500",
    badgeVariant: "secondary",
    badgeLabel: "In progress",
    title: "Continue verification",
    description: "Your verification session is in progress. Continue where you left off.",
  },
  pending_review: {
    icon: Clock,
    iconClass: "text-blue-500",
    badgeVariant: "secondary",
    badgeLabel: "Under review",
    title: "Verification under review",
    description:
      "We're reviewing your documents — this can take a few minutes if additional checks are running. You can continue using Beautonomi; we'll notify you when verification is complete.",
  },
  approved: {
    icon: ShieldCheck,
    iconClass: "text-green-600",
    badgeVariant: "default",
    badgeLabel: "Verified",
    title: "Identity verified",
    description: "Your identity has been successfully verified.",
  },
  rejected: {
    icon: AlertCircle,
    iconClass: "text-destructive",
    badgeVariant: "destructive",
    badgeLabel: "Verification failed",
    title: "We couldn't verify your identity",
    description: "Please review the reason below and try again with a clear photo of your ID.",
  },
  expired: {
    icon: AlertCircle,
    iconClass: "text-amber-500",
    badgeVariant: "outline",
    badgeLabel: "Expired",
    title: "Your verification session ended",
    description: "Your verification session has expired. You can start a new one.",
  },
  abandoned: {
    icon: AlertCircle,
    iconClass: "text-amber-500",
    badgeVariant: "outline",
    badgeLabel: "Not completed",
    title: "Verification not completed",
    description: "It looks like you didn't finish the verification. Start again when you're ready.",
  },
  requires_retry: {
    icon: RotateCcw,
    iconClass: "text-amber-500",
    badgeVariant: "outline",
    badgeLabel: "Retry required",
    title: "Verification needs to be retried",
    description: "Please start a new verification session.",
  },
  errored: {
    icon: AlertCircle,
    iconClass: "text-destructive",
    badgeVariant: "destructive",
    badgeLabel: "Error",
    title: "Verification temporarily unavailable",
    description:
      "We're having trouble with verification right now. Please try again shortly. If the problem persists, contact support.",
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
  const liveRef = useRef<HTMLDivElement>(null);
  const baseConfig = STATUS_CONFIG[status] ?? STATUS_CONFIG.not_started;
  const config =
    businessVerificationPending && status === "approved"
      ? {
          ...baseConfig,
          badgeLabel: "Identity verified",
          title: "Identity verified",
          description:
            businessVerificationSummary ??
            "Your personal identity is verified. Complete business verification to finish setup and go live.",
        }
      : baseConfig;
  const Icon = config.icon;

  // Announce status changes for screen readers
  useEffect(() => {
    if (liveRef.current) {
      liveRef.current.textContent = `Verification status: ${config.badgeLabel}. ${config.description}`;
    }
  }, [status, config.badgeLabel, config.description]);

  const showContinue = status === "in_progress";
  const showStart    = status === "not_started" || status === "session_created";
  const showRetry    = status === "rejected" || status === "expired" || status === "abandoned" || status === "requires_retry";

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {/* Live region for a11y */}
        <div
          ref={liveRef}
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        />

        <div className="flex items-center gap-3">
          <Icon
            className={`h-7 w-7 shrink-0 ${config.iconClass}`}
            aria-hidden="true"
          />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-base">{config.title}</h3>
              <Badge variant={config.badgeVariant}>{config.badgeLabel}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{config.description}</p>
          </div>
        </div>

        {/* Rejection reason */}
        {status === "rejected" && rejectionReason && (
          <div
            className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2"
            role="alert"
          >
            <p className="text-sm font-medium">Reason: {rejectionReason}</p>
          </div>
        )}

        {/* Pending review spinner */}
        {status === "pending_review" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-label="Under review">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>Reviewing your documents…</span>
          </div>
        )}

        {/* Optimistic checking state after SDK */}
        {launching && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>Checking verification status…</span>
          </div>
        )}

        {/* Consent disclosure */}
        {(showStart || showRetry) && (
          <p className="text-xs text-muted-foreground">
            Beautonomi uses{" "}
            <a
              href="https://didit.me"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Didit
            </a>{" "}
            to verify your identity. By proceeding you agree to our{" "}
            <a href="/privacy" className="underline">privacy notice</a> and{" "}
            <a
              href="https://didit.me/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Didit&apos;s end-user terms
            </a>.
          </p>
        )}

        {/* CTAs */}
        <div className="flex flex-wrap gap-2">
          {showStart && onStart && (
            <Button
              onClick={onStart}
              disabled={loading || launching}
              aria-label="Start identity verification"
            >
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Loading…</>
              ) : (
                <><ArrowRight className="mr-2 h-4 w-4" aria-hidden="true" />Start verification</>
              )}
            </Button>
          )}
          {showContinue && onContinue && (
            <Button
              onClick={onContinue}
              disabled={loading}
              aria-label="Continue identity verification"
            >
              <ArrowRight className="mr-2 h-4 w-4" aria-hidden="true" />Continue verification
            </Button>
          )}
          {showRetry && onRetry && (
            <Button
              variant="outline"
              onClick={onRetry}
              disabled={loading}
              aria-label="Try identity verification again"
            >
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />Try again
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
