"use client";

import { useState } from "react";
import { useTranslation } from "@beautonomi/i18n";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberName: string;
  candidates: Array<{ id: string; name: string }>;
  onConfirm: (reassignTo: string) => void;
};

export function ReassignBookingsDialog({
  open,
  onOpenChange,
  memberName,
  candidates,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<string>("any");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("web.provider.teamReassign.title")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t("web.provider.teamReassign.body", { name: memberName })}
        </p>
        <div className="space-y-2">
          <Label>{t("web.provider.teamReassign.confirm")}</Label>
          <Select value={choice} onValueChange={setChoice}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{t("web.provider.teamReassign.firstAvailable")}</SelectItem>
              {candidates.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("web.provider.teamReassign.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => {
              onConfirm(choice);
              onOpenChange(false);
            }}
          >
            {t("web.provider.teamReassign.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
