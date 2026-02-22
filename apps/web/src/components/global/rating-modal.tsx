"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface RatingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appStoreUrl?: string;
  platform?: "ios" | "android" | "other";
}

export default function RatingModal({
  open,
  onOpenChange,
  appStoreUrl,
  platform = "other",
}: RatingModalProps) {
  // Get App Store URL from prop, environment variable, or fallback
  const storeUrl = 
    appStoreUrl || 
    process.env.NEXT_PUBLIC_APP_STORE_URL ||
    "https://apps.apple.com/app/beautonomi"; // Default fallback

  // Determine store name and button text based on platform
  const storeName =
    platform === "ios"
      ? "App Store"
      : platform === "android"
      ? "Google Play"
      : "App Store"; // Default to App Store

  const buttonText =
    platform === "ios"
      ? "Rate on App Store"
      : platform === "android"
      ? "Rate on Google Play"
      : "Rate on App Store"; // Default to App Store
  const handleRateClick = () => {
    // Open App Store URL
    if (typeof window !== "undefined") {
      window.open(storeUrl, "_blank", "noopener,noreferrer");
    }
    // Close modal and mark as rated
    onOpenChange(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("app_rating_dismissed", "rated");
    }
  };

  const handleMaybeLater = () => {
    // Close modal and mark as dismissed (not rated)
    onOpenChange(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("app_rating_dismissed", "later");
      // Store timestamp of when they dismissed it
      localStorage.setItem("app_rating_last_dismissed", new Date().toISOString());
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95%] sm:max-w-[500px] p-6 sm:p-8">
        <DialogHeader className="text-center">
          <DialogTitle className="text-2xl sm:text-3xl font-medium text-secondary mb-4">
            Enjoying Beautonomi?
          </DialogTitle>
          <DialogDescription className="text-base sm:text-lg text-destructive font-light">
            Your feedback helps us improve! Please take a moment to rate us on the {storeName}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-6">
          <Button
            onClick={handleRateClick}
            variant="default"
            size="default"
            className="w-full"
          >
            {buttonText}
          </Button>
          <Button
            onClick={handleMaybeLater}
            variant="outline"
            size="default"
            className="w-full"
          >
            Maybe Later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
