"use client";

import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** 3-step workflow: Arrived → In Service → Checkout */
const STEPS = [
  { id: "arrived", labels: ["confirmed", "arriving", "late", "checked_in"] },
  { id: "in_service", labels: ["in_service"] },
  { id: "checkout", labels: ["ready_to_pay", "completed", "cancelled"] },
] as const;

const STEP_LABELS = ["Arrived", "In Service", "Checkout"] as const;

function getStepIndex(badge: string): number {
  for (let i = 0; i < STEPS.length; i++) {
    if ((STEPS[i].labels as readonly string[]).includes(badge)) return i;
  }
  if (["completed", "cancelled"].includes(badge)) return 2;
  if (badge === "in_service") return 1;
  return 0;
}

/** Step icon: Check (lucide) when active, number when inactive */
function StepIcon({ isActive, stepNum }: { isActive: boolean; stepNum: number }) {
  if (isActive) {
    return <Check className="w-5 h-5 text-white" strokeWidth={3} />;
  }
  return (
    <span className="text-sm font-bold text-[#0F172A]/40">
      {stepNum}
    </span>
  );
}

interface WorkflowStepperProps {
  currentBadge: string;
  className?: string;
}

export function WorkflowStepper({ currentBadge, className }: WorkflowStepperProps) {
  const currentStep = getStepIndex(currentBadge);

  return (
    <div className={cn("space-y-4", className)}>
      <p className="text-[9px] font-black uppercase tracking-widest text-[#0F172A]/50">
        Workflow
      </p>
      <div className="flex items-center gap-2">
        {STEP_LABELS.map((label, i) => {
          const isComplete = i <= currentStep;
          return (
            <React.Fragment key={label}>
              <div
                className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-500",
                  isComplete
                    ? "bg-[#0F172A] text-white"
                    : "bg-[#0F172A]/[0.06]"
                )}
              >
                <StepIcon isActive={isComplete} stepNum={i + 1} />
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div
                  className={cn(
                    "flex-1 h-0.5 min-w-[20px] rounded-full transition-all duration-500",
                    isComplete && i < currentStep ? "bg-[#0F172A]/40" : "bg-[#0F172A]/[0.08]"
                  )}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
      <p className="text-sm font-semibold text-[#0F172A]">
        {STEP_LABELS[currentStep]}
      </p>
    </div>
  );
}
