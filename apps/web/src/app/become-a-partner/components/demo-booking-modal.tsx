"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type EmbedType = "calendly" | "zoho";

interface DemoBookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "calendly" | "zoho" */
  embedType: EmbedType | null;
  /** Calendly: full scheduling URL (e.g. https://calendly.com/username/demo). Zoho: iframe src URL or raw HTML containing iframe */
  embedContent: string | null;
}

/**
 * Renders an in-page embed for demo booking (Calendly or Zoho).
 * Content is driven by CMS: demo_booking_type and demo_booking_embed.
 */
export function DemoBookingModal({
  open,
  onOpenChange,
  embedType,
  embedContent,
}: DemoBookingModalProps) {
  if (!embedContent?.trim()) return null;

  const isCalendly = embedType === "calendly" || !embedType;
  const isZoho = embedType === "zoho";
  // Calendly: content is the scheduling URL (e.g. https://calendly.com/username/demo)
  const calendlyUrl = isCalendly && embedContent.startsWith("http") ? embedContent.trim() : null;
  // Zoho: content can be iframe src URL or full HTML
  const zohoIsIframeHtml = isZoho && embedContent.trim().toLowerCase().includes("<iframe");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-[95vw] w-full max-h-[90vh] overflow-hidden flex flex-col",
          "sm:max-w-[680px] lg:max-w-[900px]"
        )}
      >
        <DialogHeader>
          <DialogTitle>Book a demo</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden rounded-lg border bg-gray-50">
          {isCalendly && calendlyUrl && (
            <iframe
              title="Book a demo"
              src={calendlyUrl}
              className="w-full h-[70vh] min-h-[400px] border-0"
            />
          )}
          {isZoho && zohoIsIframeHtml && (
            <div
              className="w-full h-[70vh] min-h-[400px] overflow-auto p-2 [&_iframe]:w-full [&_iframe]:h-[calc(70vh-1rem)] [&_iframe]:min-h-[380px]"
              dangerouslySetInnerHTML={{ __html: embedContent }}
            />
          )}
          {isZoho && !zohoIsIframeHtml && embedContent.startsWith("http") && (
            <iframe
              title="Book a demo"
              src={embedContent}
              className="w-full h-[70vh] min-h-[400px] border-0"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
