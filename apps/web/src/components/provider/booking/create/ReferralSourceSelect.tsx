"use client";
import { useTranslation } from "@beautonomi/i18n";

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
  isExistingClient?: boolean;
}

export function ReferralSourceSelect({
  value,
  onChange,
  isExistingClient = false,
}: ReferralSourceSelectProps) {
  const { t } = useTranslation();
  const [sources, setSources] = useState<Array<{ id: string; name: string }>>([]);
  const [expanded, setExpanded] = useState(!isExistingClient);

  useEffect(() => {
    if (!isExistingClient) setExpanded(true);
  }, [isExistingClient]);

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

  if (isExistingClient && !expanded) {
    return (
      <BookingSectionCard>
        <button
          type="button"
          className="text-sm font-semibold text-primary touch-manipulation min-h-[44px] px-1 text-start"
          onClick={() => setExpanded(true)}
        >
          {t("web.referralSource.addForVisit")}
        </button>
      </BookingSectionCard>
    );
  }

  return (
    <BookingSectionCard>
      <BookingSectionLabel className="mb-2">{t("web.referralSource.label")}</BookingSectionLabel>
      <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
        <SelectTrigger className="rounded-xl min-h-[44px]">
          <SelectValue placeholder={t("web.referralSource.notSpecified")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t("web.referralSource.notSpecified")}</SelectItem>
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
