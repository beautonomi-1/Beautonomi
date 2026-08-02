"use client";

import { useEffect, useState } from "react";
import { fetcher } from "@/lib/http/fetcher";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookingSectionCard, BookingSectionLabel } from "../ui";

interface ReferralSourceSelectProps {
  value: string;
  onChange: (id: string) => void;
}

export function ReferralSourceSelect({ value, onChange }: ReferralSourceSelectProps) {
  const [sources, setSources] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetcher.get<{
          data?: Array<{ id: string; name: string; is_active?: boolean }>;
        }>("/api/provider/referral-sources");
        const list = (res?.data ?? []).filter((s) => s.is_active !== false);
        if (!cancelled) setSources(list);
      } catch {
        if (!cancelled) setSources([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (sources.length === 0) return null;

  return (
    <BookingSectionCard>
      <BookingSectionLabel className="mb-2">How did this client find you?</BookingSectionLabel>
      <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
        <SelectTrigger className="rounded-xl min-h-[44px]">
          <SelectValue placeholder="Not specified" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Not specified</SelectItem>
          {sources.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </BookingSectionCard>
  );
}
