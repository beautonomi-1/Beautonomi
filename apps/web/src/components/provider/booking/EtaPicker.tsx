"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const PRESET_MINUTES = [5, 10, 15, 20, 30, 45, 60] as const;

export type EtaPickerProps = {
  value: number | null;
  onChange: (minutes: number | null) => void;
  disabled?: boolean;
  className?: string;
};

export function EtaPicker({ value, onChange, disabled, className }: EtaPickerProps) {
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState("");

  const selectPreset = (minutes: number) => {
    setCustomMode(false);
    onChange(minutes);
  };

  const selectNotSure = () => {
    setCustomMode(false);
    onChange(null);
  };

  const applyCustom = () => {
    const n = Math.round(Number(customValue));
    if (Number.isFinite(n) && n >= 1 && n <= 240) {
      onChange(n);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-sm font-medium text-gray-700">Estimated arrival</p>
      <div className="flex flex-wrap gap-2">
        {PRESET_MINUTES.map((m) => (
          <button
            key={m}
            type="button"
            disabled={disabled}
            onClick={() => selectPreset(m)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              value === m
                ? "border-primary bg-primary text-white"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
              disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            {m} min
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={selectNotSure}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
            value === null
              ? "border-primary bg-primary text-white"
              : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          Not sure
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setCustomMode((v) => !v)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
            customMode || (value != null && !PRESET_MINUTES.includes(value as (typeof PRESET_MINUTES)[number]))
              ? "border-primary bg-primary/10 text-primary"
              : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          Custom
        </button>
      </div>
      {customMode ? (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={240}
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            placeholder="Minutes"
            disabled={disabled}
            className="w-24 rounded-md border border-gray-200 px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            disabled={disabled}
            onClick={applyCustom}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white"
          >
            Set
          </button>
        </div>
      ) : null}
    </div>
  );
}
