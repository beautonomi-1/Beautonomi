"use client";

import { useTranslation } from "@beautonomi/i18n";

import React from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Gift, Camera } from "lucide-react";

interface PostForRewardNudgeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PostForRewardNudge({ open, onOpenChange }: PostForRewardNudgeProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-amber-500" />
            {t("web.providerExtras.earnRewardPoints")}
          </DialogTitle>
          <DialogDescription>
            {t("web.providerExtras.earnRewardBody")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.storeReview.notNow")}
          </Button>
          <Button asChild className="bg-primary hover:bg-primary/90 text-white">
            <Link href="/provider/explore/new?addToGallery=1" onClick={() => onOpenChange(false)}>
              <Camera className="w-4 h-4 me-2" />
              {t("web.providerExtras.addPhotoOfWork")}
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
