"use client";

import { useTranslation } from "@beautonomi/i18n";
import { cn } from "@/lib/utils";
import { MIN_TAP } from "../tokens";

export type AppointmentKindValue = "in_salon" | "walk_in" | "at_home";

const OPTIONS: { value: AppointmentKindValue; labelKey: string }[] = [
  { value: "in_salon", labelKey: "kindInSalon" },
  { value: "walk_in", labelKey: "kindWalkIn" },
  { value: "at_home", labelKey: "kindAtHome" },
];

interface AppointmentKindSelectorProps {
  value: AppointmentKindValue;
  onChange: (value: AppointmentKindValue) => void;
}

export function AppointmentKindSelector({ value, onChange }: AppointmentKindSelectorProps) {
  const { t } = useTranslation();
  const ns = "web.provider.bookings.appointmentCreate";

  return (
    <div className="flex gap-1 p-1 rounded-xl bg-gray-100">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex-1 rounded-lg py-2.5 text-sm font-semibold touch-manipulation transition-colors",
            MIN_TAP,
            value === opt.value ? "bg-gray-900 text-white shadow-sm" : "text-gray-600 hover:text-gray-900",
          )}
        >
          {t(`${ns}.${opt.labelKey}`)}
        </button>
      ))}
    </div>
  );
}
