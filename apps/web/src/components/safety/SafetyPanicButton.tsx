"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { useModuleConfig, useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface SafetyPanicButtonProps {
  bookingId?: string | null;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  children?: React.ReactNode;
}

/**
 * Safety / panic button. Gated by modules.safety.enabled and flags.safety.panic.enabled.
 * Renders nothing when disabled. Optional bookingId for attribution.
 */
export function SafetyPanicButton({
  bookingId = null,
  variant = "destructive",
  size = "default",
  className,
  children,
}: SafetyPanicButtonProps) {
  const safetyConfig = useModuleConfig("safety") as { enabled?: boolean } | undefined;
  const panicEnabled = useFeatureFlag("safety.panic.enabled");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const enabled = Boolean(safetyConfig?.enabled) && panicEnabled;
  if (!enabled) return null;

  const handlePanic = async () => {
    setLoading(true);
    try {
      await fetcher.post<{ data: { id: string; status: string } }>("/api/me/safety/panic", {
        booking_id: bookingId ?? undefined,
        metadata: { source: "web_booking" },
      });
      toast.success("Help has been requested. Our team will reach out shortly.");
      setOpen(false);
    } catch {
      toast.error("Unable to send request. Please call emergency services if in danger.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {children ?? (
          <Button variant={variant} size={size} className={className} type="button">
            <ShieldAlert className="h-4 w-4 mr-2" />
            Safety / Get help
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Request help</AlertDialogTitle>
          <AlertDialogDescription>
            This will notify our safety team. If you are in immediate danger, please call emergency services (e.g. 112 or 911) first.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handlePanic} disabled={loading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {loading ? "Sending…" : "Request help"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
