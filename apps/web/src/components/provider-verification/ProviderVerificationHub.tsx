"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { IdentityVerificationPanel } from "@/components/identity-verification/IdentityVerificationPanel";
import {
  ProviderEntityTypeSelector,
  type PayeeEntityData,
} from "./ProviderEntityTypeSelector";

type VerificationStep = "person_kyc" | "business_kyb" | "manual_upload" | "manual_business_review";

type StepInfo = {
  step: VerificationStep;
  required: boolean;
  label: string;
  description: string;
  status: string;
  locked?: boolean;
};

export type VerificationHubStatus = {
  verification_plan: {
    required_steps: VerificationStep[];
    optional_steps: VerificationStep[];
    progress: { completed: number; total: number };
    steps: StepInfo[];
    is_complete: boolean;
    effective_summary: string;
  } | null;
  payee_entity: PayeeEntityData | null;
  didit_available?: boolean;
  kyb_available?: boolean;
  manual_available?: boolean;
};

function stepStatusLabel(status: string, locked?: boolean): string {
  if (locked) return "Complete identity first";
  if (status === "approved") return "Done";
  if (status === "not_required") return "Not needed";
  if (status === "pending_review") return "Under review";
  if (status === "in_progress" || status === "session_created") return "In progress";
  if (status === "rejected") return "Action needed";
  return "Not started";
}

type Props = {
  statusData: VerificationHubStatus;
  onRefresh: () => Promise<void>;
  manualUploadSection?: React.ReactNode;
};

export function ProviderVerificationHub({ statusData, onRefresh, manualUploadSection }: Props) {
  const [expandedStep, setExpandedStep] = useState<VerificationStep | null>("person_kyc");
  const [kybLaunching, setKybLaunching] = useState(false);

  const plan = statusData.verification_plan;
  const payeeEntity = statusData.payee_entity;

  const startBusinessVerification = useCallback(async () => {
    setKybLaunching(true);
    try {
      const res = await fetcher.post<{ data: { url: string } }>(
        "/api/provider/identity-verification/business-session",
        { language_code: "en" },
      );
      const url = res.data?.url;
      if (!url) throw new Error("No verification URL returned");
      window.location.href = url;
    } finally {
      setKybLaunching(false);
      await onRefresh();
    }
  }, [onRefresh]);

  if (!payeeEntity) return null;

  const progress = plan?.progress ?? { completed: 0, total: 0 };
  const allSteps = plan?.steps ?? [];
  const businessVerificationPending =
    !!plan &&
    !plan.is_complete &&
    (plan.required_steps.includes("business_kyb") ||
      plan.required_steps.includes("manual_business_review"));

  return (
    <div className="space-y-8">
      <ProviderEntityTypeSelector initial={payeeEntity} onSaved={() => void onRefresh()} />

      {plan && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Your verification</h2>
            {progress.total > 0 && (
              <span className="text-sm text-muted-foreground">
                {progress.completed} of {progress.total} complete
              </span>
            )}
          </div>

          {plan.is_complete ? (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800">
              You&apos;re verified — you can go live.
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{plan.effective_summary}</p>
          )}

          <div className="space-y-3">
            {allSteps.map((step, index) => {
              const expanded = expandedStep === step.step;
              const canStartKyb =
                step.step === "business_kyb" &&
                !step.locked &&
                statusData.kyb_available &&
                step.status !== "approved" &&
                step.status !== "pending_review";

              return (
                <div key={step.step} className="rounded-xl border bg-card overflow-hidden">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 p-4 text-left"
                    onClick={() => setExpandedStep(expanded ? null : step.step)}
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        step.status === "approved" ? "bg-green-100" : "bg-muted",
                      )}
                    >
                      {step.status === "approved" ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <span className="text-sm font-bold text-muted-foreground">{index + 1}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{step.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {stepStatusLabel(step.status, step.locked)}
                        {!step.required ? " · Optional" : ""}
                      </p>
                    </div>
                    {expanded ? (
                      <ChevronUp className="h-5 w-5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
                    )}
                  </button>

                  {expanded && step.step === "person_kyc" && (
                    <div className="border-t px-4 pb-4">
                      {statusData.didit_available ? (
                        <IdentityVerificationPanel
                          persona="provider"
                          isProvider
                          businessVerificationPending={businessVerificationPending}
                          businessVerificationSummary={plan.effective_summary}
                          onApproved={() => void onRefresh()}
                        />
                      ) : (
                        manualUploadSection
                      )}
                    </div>
                  )}

                  {expanded && step.step === "business_kyb" && (
                    <div className="space-y-3 border-t p-4">
                      <p className="text-sm text-muted-foreground">{step.description}</p>
                      {canStartKyb && (
                        <Button type="button" onClick={() => void startBusinessVerification()} disabled={kybLaunching}>
                          {kybLaunching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          {step.status === "not_started" ? "Start business verification" : "Continue"}
                        </Button>
                      )}
                      {step.status === "approved" && (
                        <p className="text-sm font-medium text-green-700">Business verified</p>
                      )}
                    </div>
                  )}

                  {expanded && step.step === "manual_upload" && (
                    <div className="border-t px-4 pb-4">
                      {manualUploadSection ?? (
                        <p className="py-3 text-sm text-muted-foreground">
                          Upload identity documents from this screen when manual verification is enabled.
                        </p>
                      )}
                    </div>
                  )}

                  {expanded && step.step === "manual_business_review" && (
                    <div className="space-y-2 border-t p-4">
                      <p className="text-sm text-muted-foreground">
                        Automated business verification is not available for your registration country.
                        Email support with your company registration documents, or ask an admin to complete
                        a manual business review.
                      </p>
                      {step.status === "approved" ? (
                        <p className="text-sm font-medium text-green-700">Business review approved</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Status: {stepStatusLabel(step.status)} — our team will update this after review.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
