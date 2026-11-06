"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { useTranslation } from "@beautonomi/i18n";
import type { GroupBookingParticipant } from "@/lib/provider-portal/types";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { BookingActionButton, BookingSectionCard, BookingSectionLabel } from "../ui";

type StepId = "start" | "checkIn" | "collect" | "complete" | "receipt";

interface GroupSessionStepsProps {
  status: string;
  participants: GroupBookingParticipant[];
  outstanding: number;
  busy: boolean;
  canEdit: boolean;
  canProcessPayments: boolean;
  onStart: () => void;
  onCollect: () => void;
  onComplete: () => void;
  onReceipt: () => void;
}

function isActiveParticipant(p: GroupBookingParticipant): boolean {
  const s = String(p.booking_status ?? "").toLowerCase();
  return s !== "cancelled" && s !== "no_show";
}

/** Walks the provider through a group session in the order the server enforces. */
export function GroupSessionSteps({
  status,
  participants,
  outstanding,
  busy,
  canEdit,
  canProcessPayments,
  onStart,
  onCollect,
  onComplete,
  onReceipt,
}: GroupSessionStepsProps) {
  const { t } = useTranslation();
  const { format: formatMoney } = useProviderMoneyFormat();
  const k = "web.provider.bookings.groupView.steps";

  const normalized = status.toLowerCase();
  if (normalized === "cancelled") return null;
  const completed = normalized === "completed";
  const started = normalized === "started" || completed;
  const active = participants.filter(isActiveParticipant);
  const checkedIn = active.filter((p) => p.checked_in).length;
  const allCheckedIn = active.length > 0 && checkedIn === active.length;
  const paidUp = outstanding <= 0.01;

  const steps: Array<{ id: StepId; done: boolean; detail: string }> = [
    { id: "start", done: started, detail: t(`${k}.startDetail`) },
    {
      id: "checkIn",
      done: completed || allCheckedIn,
      detail: t(`${k}.checkInDetail`, { checkedIn, total: active.length }),
    },
    {
      id: "collect",
      done: paidUp,
      detail: paidUp ? t(`${k}.collectDone`) : t(`${k}.collectDetail`, { amount: formatMoney(outstanding) }),
    },
    { id: "complete", done: completed, detail: t(`${k}.completeDetail`) },
    { id: "receipt", done: false, detail: t(`${k}.receiptDetail`) },
  ];
  const currentId = steps.find((s) => !s.done)?.id ?? "receipt";

  const actionFor = (id: StepId) => {
    if (id === "start" && canEdit && !started) {
      return (
        <BookingActionButton size="sm" fullWidth={false} disabled={busy} onClick={onStart}>
          {t(`${k}.startAction`)}
        </BookingActionButton>
      );
    }
    if (id === "collect" && canProcessPayments && !paidUp && !completed) {
      return (
        <BookingActionButton size="sm" fullWidth={false} disabled={busy} onClick={onCollect}>
          {t(`${k}.collectAction`)}
        </BookingActionButton>
      );
    }
    if (id === "complete" && canEdit && started && !completed) {
      return (
        <BookingActionButton size="sm" fullWidth={false} disabled={busy} onClick={onComplete}>
          {t(`${k}.completeAction`)}
        </BookingActionButton>
      );
    }
    if (id === "receipt" && completed) {
      return (
        <BookingActionButton size="sm" fullWidth={false} variant="outline" onClick={onReceipt}>
          {t(`${k}.receiptAction`)}
        </BookingActionButton>
      );
    }
    return null;
  };

  return (
    <BookingSectionCard data-testid="group-session-steps">
      <BookingSectionLabel className="mb-3">{t(`${k}.title`)}</BookingSectionLabel>
      <ol className="space-y-3">
        {steps.map((step, index) => {
          const isCurrent = step.id === currentId;
          return (
            <li key={step.id} className="flex items-start gap-3 text-sm">
              {step.done ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" aria-hidden />
              ) : (
                <Circle
                  className={`h-5 w-5 shrink-0 ${isCurrent ? "text-gray-900" : "text-gray-300"}`}
                  aria-hidden
                />
              )}
              <div className="min-w-0 flex-1">
                <p className={`font-medium ${isCurrent ? "text-gray-900" : step.done ? "text-gray-700" : "text-gray-500"}`}>
                  {index + 1}. {t(`${k}.${step.id}`)}
                </p>
                <p className="text-xs text-gray-500">{step.detail}</p>
                {isCurrent ? <div className="mt-2">{actionFor(step.id)}</div> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </BookingSectionCard>
  );
}
