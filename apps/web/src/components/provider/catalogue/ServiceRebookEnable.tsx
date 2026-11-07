"use client";

import { useState } from "react";
import { useTranslation } from "@beautonomi/i18n";
import { defaultRebookReminderForNewOffering } from "@beautonomi/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Props = {
  serviceId: string;
  title: string;
  categorySlug?: string | null;
  categoryName?: string | null;
  enabled: boolean;
  onEnabled: () => void;
};

export function ServiceRebookEnable({
  serviceId,
  title,
  categorySlug,
  categoryName,
  enabled,
  onEnabled,
}: Props) {
  const { t } = useTranslation();
  const ns = "web.provider.catalogue.services.rebookOptIn";
  const [loading, setLoading] = useState(false);

  if (enabled) return null;

  const enable = async () => {
    setLoading(true);
    try {
      const weeks = defaultRebookReminderForNewOffering({
        title,
        categorySlug: categorySlug ?? categoryName ?? null,
      }).reminder_to_rebook_weeks;
      const res = await fetch(`/api/provider/services/${serviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reminder_to_rebook_enabled: true,
          reminder_to_rebook_weeks: weeks,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(t(`${ns}.enabled`));
      onEnabled();
    } catch {
      toast.error(t(`${ns}.failed`));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
      <span>{t(`${ns}.hint`)}</span>
      <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={loading} onClick={enable}>
        {t(`${ns}.enable`)}
      </Button>
    </div>
  );
}
