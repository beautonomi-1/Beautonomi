"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface VideoTourModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Embed URL for the video iframe (e.g. YouTube or Vimeo embed) */
  embedUrl: string | null;
}

/**
 * In-context popup modal that shows the video tour in an iframe.
 * Used when video_tour_url is set in CMS for the become-a-partner page.
 */
export function VideoTourModal({
  open,
  onOpenChange,
  embedUrl,
}: VideoTourModalProps) {
  if (!embedUrl?.trim()) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full max-h-[90vh] overflow-hidden flex flex-col sm:max-w-[720px] lg:max-w-[960px]">
        <DialogHeader>
          <DialogTitle>Video tour</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden rounded-lg border bg-black/5 aspect-video">
          <iframe
            title="Video tour"
            src={embedUrl}
            className="w-full h-full min-h-[320px] border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
