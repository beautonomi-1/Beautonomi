"use client";

import { useEffect, useMemo, useState } from "react";
import {
  composeLegalDobIso,
  daysInMonth,
  LEGAL_DOB_MONTHS,
  legalDobYearRange,
  parseLegalDobIso,
  type LegalDobParts,
} from "@beautonomi/utils";
import { Label } from "@/components/ui/label";

interface Props {
  value: string;
  onChange: (isoDate: string) => void;
  error?: string;
  minAge?: number;
  idPrefix?: string;
}

export function LegalDobPicker({
  value,
  onChange,
  error,
  minAge = 18,
  idPrefix = "legal-dob",
}: Props) {
  const [parts, setParts] = useState<LegalDobParts>(() => parseLegalDobIso(value));

  useEffect(() => {
    setParts(parseLegalDobIso(value));
  }, [value]);

  const years = useMemo(() => legalDobYearRange({ minAge }), [minAge]);
  const dayOptions = useMemo(() => {
    if (parts.month == null || parts.year == null) return Array.from({ length: 31 }, (_, i) => i + 1);
    const max = daysInMonth(parts.year, parts.month);
    return Array.from({ length: max }, (_, i) => i + 1);
  }, [parts.month, parts.year]);

  function update(next: LegalDobParts) {
    setParts(next);
    onChange(composeLegalDobIso(next));
  }

  const selectClass = (hasError: boolean) =>
    `flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
      hasError ? "border-destructive" : "border-input"
    }`;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-day`}>
        Date of birth <span aria-hidden="true" className="text-destructive">*</span>
      </Label>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label htmlFor={`${idPrefix}-day`} className="sr-only">Day</label>
          <select
            id={`${idPrefix}-day`}
            value={parts.day ?? ""}
            onChange={(e) => {
              const day = e.target.value ? Number(e.target.value) : null;
              update({ ...parts, day });
            }}
            aria-required="true"
            aria-describedby={error ? `${idPrefix}-err` : `${idPrefix}-hint`}
            className={selectClass(Boolean(error))}
          >
            <option value="">Day</option>
            {dayOptions.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${idPrefix}-month`} className="sr-only">Month</label>
          <select
            id={`${idPrefix}-month`}
            value={parts.month ?? ""}
            onChange={(e) => {
              const month = e.target.value ? Number(e.target.value) : null;
              let day = parts.day;
              if (day != null && parts.year != null && month != null && day > daysInMonth(parts.year, month)) {
                day = daysInMonth(parts.year, month);
              }
              update({ ...parts, month, day });
            }}
            aria-required="true"
            className={selectClass(Boolean(error))}
          >
            <option value="">Month</option>
            {LEGAL_DOB_MONTHS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${idPrefix}-year`} className="sr-only">Year</label>
          <select
            id={`${idPrefix}-year`}
            value={parts.year ?? ""}
            onChange={(e) => {
              const year = e.target.value ? Number(e.target.value) : null;
              let day = parts.day;
              if (day != null && year != null && parts.month != null && day > daysInMonth(year, parts.month)) {
                day = daysInMonth(year, parts.month);
              }
              update({ ...parts, year, day });
            }}
            aria-required="true"
            className={selectClass(Boolean(error))}
          >
            <option value="">Year</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>
      {error ? (
        <p id={`${idPrefix}-err`} className="text-xs text-destructive" role="alert">{error}</p>
      ) : (
        <p id={`${idPrefix}-hint`} className="text-xs text-muted-foreground">
          Select day, month, and year as on your ID. You must be at least {minAge}.
        </p>
      )}
    </div>
  );
}
