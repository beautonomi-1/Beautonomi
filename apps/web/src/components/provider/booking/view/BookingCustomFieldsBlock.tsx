"use client";

import { BookingSectionCard, BookingSectionLabel, BookingSummaryRow } from "../ui";

interface BookingCustomFieldsBlockProps {
  values?: Record<string, unknown> | null;
}

export function BookingCustomFieldsBlock({ values }: BookingCustomFieldsBlockProps) {
  if (!values || Object.keys(values).length === 0) return null;

  return (
    <BookingSectionCard>
      <BookingSectionLabel className="mb-3">Custom fields</BookingSectionLabel>
      {Object.entries(values).map(([name, value]) => (
        <BookingSummaryRow
          key={name}
          label={name.replace(/_/g, " ")}
          value={
            value === null || value === undefined
              ? "—"
              : typeof value === "object"
                ? JSON.stringify(value)
                : String(value)
          }
        />
      ))}
    </BookingSectionCard>
  );
}
