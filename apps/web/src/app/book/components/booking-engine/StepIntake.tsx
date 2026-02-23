"use client";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BookingData, ClientIntake } from "../../types/booking-engine";

const MIN_TAP = "min-h-[44px] min-w-[44px]";

interface StepIntakeProps {
  data: BookingData;
  onChange: (client: Partial<ClientIntake>) => void;
  onNext: () => void;
}

export function StepIntake({ data, onChange, onNext }: StepIntakeProps) {
  const c = data.client;
  const canNext =
    c.firstName.trim() !== "" &&
    c.lastName.trim() !== "" &&
    c.email.trim() !== "" &&
    c.phone.trim() !== "";

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Your details</h2>
        <p className="mt-1 text-sm text-gray-500">We’ll use this to confirm your booking</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="first-name" className="text-gray-700">First name</Label>
          <Input
            id="first-name"
            placeholder="First name"
            value={c.firstName}
            onChange={(e) => onChange({ firstName: e.target.value })}
            className="rounded-2xl h-12 border-gray-200"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="last-name" className="text-gray-700">Last name</Label>
          <Input
            id="last-name"
            placeholder="Last name"
            value={c.lastName}
            onChange={(e) => onChange({ lastName: e.target.value })}
            className="rounded-2xl h-12 border-gray-200"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email" className="text-gray-700">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={c.email}
          onChange={(e) => onChange({ email: e.target.value })}
          className="rounded-2xl h-12 border-gray-200"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone" className="text-gray-700">Phone</Label>
        <Input
          id="phone"
          type="tel"
          placeholder="+27 00 000 0000"
          value={c.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
          className="rounded-2xl h-12 border-gray-200"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="special-requests" className="text-gray-700">
          Special requests <span className="text-gray-400 font-normal">(optional)</span>
        </Label>
        <textarea
          id="special-requests"
          placeholder="Allergies, preferences, access notes..."
          value={c.specialRequests}
          onChange={(e) => onChange({ specialRequests: e.target.value })}
          rows={3}
          className={cn(
            "w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#EC4899]/50 focus:border-[#EC4899]"
          )}
        />
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        className={cn(
          "w-full rounded-2xl h-12 font-medium text-white transition-all touch-manipulation active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100",
          MIN_TAP
        )}
        style={{ backgroundColor: "#EC4899" }}
      >
        Continue
      </button>
    </div>
  );
}
