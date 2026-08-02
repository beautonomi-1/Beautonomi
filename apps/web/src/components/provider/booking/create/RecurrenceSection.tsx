"use client";

import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookingSectionCard, BookingSectionLabel } from "../ui";

export type RecurrencePattern = "daily" | "weekly" | "biweekly" | "monthly";

interface RecurrenceSectionProps {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  pattern: RecurrencePattern;
  onPatternChange: (p: RecurrencePattern) => void;
  endDate: string;
  onEndDateChange: (d: string) => void;
  occurrenceCount: string;
  onOccurrenceCountChange: (v: string) => void;
  hasSavedClient: boolean;
  isWalkIn: boolean;
}

export function RecurrenceSection({
  enabled,
  onEnabledChange,
  pattern,
  onPatternChange,
  endDate,
  onEndDateChange,
  occurrenceCount,
  onOccurrenceCountChange,
  hasSavedClient,
  isWalkIn,
}: RecurrenceSectionProps) {
  const disabled = isWalkIn || !hasSavedClient;

  return (
    <BookingSectionCard>
      <div className="flex items-center justify-between gap-3 mb-2">
        <BookingSectionLabel className="mb-0">Repeating visit</BookingSectionLabel>
        <Switch
          checked={enabled && !disabled}
          disabled={disabled}
          onCheckedChange={onEnabledChange}
        />
      </div>
      {disabled ? (
        <p className="text-xs text-gray-500">
          {isWalkIn
            ? "Walk-in bookings cannot be set as repeating."
            : "Select a saved client to create a repeating series."}
        </p>
      ) : enabled ? (
        <div className="space-y-3 mt-2">
          <Select value={pattern} onValueChange={(v) => onPatternChange(v as RecurrencePattern)}>
            <SelectTrigger className="rounded-xl min-h-[44px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="biweekly">Every 2 weeks</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              Number of visits (optional)
            </label>
            <Input
              type="number"
              min={2}
              inputMode="numeric"
              value={occurrenceCount}
              onChange={(e) => onOccurrenceCountChange(e.target.value)}
              placeholder="e.g. 6"
              className="rounded-xl min-h-[44px]"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">End date (optional)</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="rounded-xl min-h-[44px]"
            />
          </div>
        </div>
      ) : null}
    </BookingSectionCard>
  );
}
