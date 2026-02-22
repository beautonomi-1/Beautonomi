"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import { Loader2, Flag } from "lucide-react";

interface ReportProviderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
  providerName: string;
  onSuccess?: () => void;
}

export function ReportProviderModal({
  open,
  onOpenChange,
  providerId,
  providerName,
  onSuccess,
}: ReportProviderModalProps) {
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = description.trim();
    if (!trimmed) {
      toast.error("Please describe your concern");
      return;
    }
    setSubmitting(true);
    try {
      await fetcher.post("/api/reports", {
        report_type: "customer_reported_provider",
        provider_id: providerId,
        description: trimmed,
      });
      toast.success("Report submitted. Our team will review it.");
      setDescription("");
      onOpenChange(false);
      onSuccess?.();
    } catch {
      toast.error("Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-amber-500" />
            Report this provider
          </DialogTitle>
          <DialogDescription>
            Report &quot;{providerName}&quot;. Your report will be reviewed by our team. Please provide a clear description of your concern.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your concern (e.g. misleading services, unprofessional behaviour...)"
            className="w-full min-h-[120px] rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-[#FF0077]/30 focus:border-[#FF0077] outline-none resize-y"
            maxLength={2000}
            disabled={submitting}
          />
          <p className="text-xs text-gray-500 mt-1">{description.length}/2000</p>
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={submitting || !description.trim()}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Submitting...
                </>
              ) : (
                "Submit report"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
