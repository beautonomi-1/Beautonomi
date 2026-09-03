"use client";

import { Checkbox } from "@/components/ui/checkbox";

const CHECKBOX_CLASS =
  "mt-0.5 h-6 w-6 shrink-0 rounded-full border-2 border-gray-400 data-[state=checked]:bg-primary data-[state=checked]:border-primary";

export function MarketingConsentCheckbox({
  id,
  checked,
  onCheckedChange,
  className,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <div className={className ?? "mb-4 flex items-start gap-3"}>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(c) => onCheckedChange(c === true)}
        className={CHECKBOX_CLASS}
        aria-describedby={`${id}-text`}
      />
      <label htmlFor={id} id={`${id}-text`} className="text-xs text-gray-600 cursor-pointer leading-relaxed">
        Send me tips, offers, and product updates. You can unsubscribe anytime.
      </label>
    </div>
  );
}
