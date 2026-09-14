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
import { useTranslation } from "@beautonomi/i18n";
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
  const { t } = useTranslation();
  const prefix = "web.provider.recurrenceSection";
  const disabled = isWalkIn || !hasSavedClient;

  return (
    <BookingSectionCard>
      <div className="flex items-center justify-between gap-3 mb-2">
        <BookingSectionLabel className="mb-0">{t(`${prefix}.title`)}</BookingSectionLabel>
        <Switch
          checked={enabled && !disabled}
          disabled={disabled}
          onCheckedChange={onEnabledChange}
        />
      </div>
      {disabled ? (
        <p className="text-xs text-gray-500">
          {isWalkIn
            ? t(`${prefix}.walkInDisabled`)
            : t(`${prefix}.selectClient`)}
        </p>
      ) : enabled ? (
        <div className="space-y-3 mt-2">
          <Select value={pattern} onValueChange={(v) => onPatternChange(v as RecurrencePattern)}>
            <SelectTrigger className="rounded-xl min-h-[44px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">{t(`${prefix}.daily`)}</SelectItem>
              <SelectItem value="weekly">{t(`${prefix}.weekly`)}</SelectItem>
              <SelectItem value="biweekly">{t(`${prefix}.biweekly`)}</SelectItem>
              <SelectItem value="monthly">{t(`${prefix}.monthly`)}</SelectItem>
            </SelectContent>
          </Select>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              {t(`${prefix}.visitsOptional`)}
            </label>
            <Input
              type="number"
              min={2}
              inputMode="numeric"
              value={occurrenceCount}
              onChange={(e) => onOccurrenceCountChange(e.target.value)}
              placeholder={t(`${prefix}.visitsPlaceholder`)}
              className="rounded-xl min-h-[44px]"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">{t(`${prefix}.endDateOptional`)}</label>
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
