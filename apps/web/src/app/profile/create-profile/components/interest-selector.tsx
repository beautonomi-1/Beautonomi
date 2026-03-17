"use client";

import React from "react";
import { ChipCombobox } from "@/components/ui/chip-combobox";

interface InterestSelectorProps {
  interests: string[] | null;
  setInterests: (value: string[] | null) => void;
}

const INTEREST_SUGGESTIONS = [
  "Hair",
  "Nails",
  "Skincare",
  "Makeup",
  "Pedicure",
  "Manicure",
  "Facial",
  "Massage",
  "Hair colour",
  "Braids",
  "Waxing",
  "Lashes",
  "Brows",
  "Travel",
  "Photography",
  "Cooking",
];

export default function InterestSelector({ interests, setInterests }: InterestSelectorProps) {
  return (
    <div className="max-w-5xl mx-auto px-6 bg-white">
      <h2 className="text-[22px] font-medium text-secondary mb-2">What you&apos;re into</h2>
      <p className="text-base font-light text-destructive mb-4">
        Find common ground with other clients and Providers by adding interests to your profile. Select or type below.
      </p>
      <ChipCombobox
        singleSelect={false}
        value={interests ?? []}
        onChange={(next) => setInterests(next.length > 0 ? next : null)}
        staticSuggestions={INTEREST_SUGGESTIONS.map((i) => ({ value: i, label: i }))}
        allowFreeForm
        placeholder="e.g. Hair, Nails, Skincare..."
        aria-label="Your interests"
      />
    </div>
  );
}
