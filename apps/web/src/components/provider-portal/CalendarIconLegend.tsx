"use client";

import { useTranslation } from "@beautonomi/i18n";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ICON_FLAG_MAPPING } from "@/lib/scheduling/visualMapping";

const LEGEND_KEYS = [
  "isNewClient",
  "hasNotes",
  "isRepeating",
  "hasMembership",
  "hasFormsIncomplete",
  "hasPhotos",
  "hasConversation",
  "isGroup",
  "hasCustomization",
  "isWalkIn",
  "isAtHome",
] as const;

export function CalendarIconLegend() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        {t("web.provider.scheduling.calendarIconLegendTitle")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("web.provider.scheduling.calendarIconLegendTitle")}</DialogTitle>
          </DialogHeader>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {LEGEND_KEYS.map((key) => {
              const cfg = ICON_FLAG_MAPPING[key];
              if (!cfg) return null;
              return (
                <li key={key}>
                  {t(`web.provider.scheduling.calendarIcons.${key}`)}
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
