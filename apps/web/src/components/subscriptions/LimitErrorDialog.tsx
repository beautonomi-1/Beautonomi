"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, TrendingUp } from "lucide-react";
import Link from "next/link";

interface LimitErrorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureType: string;
  message: string;
  currentCount: number;
  limitValue: number | null;
  planName: string;
}

export default function LimitErrorDialog({
  open,
  onOpenChange,
  featureType,
  message,
  currentCount,
  limitValue,
  planName,
}: LimitErrorDialogProps) {
  const featureLabels: Record<string, string> = {
    bookings: "Bookings",
    messages: "Messages",
    staff: "Staff Members",
    locations: "Locations",
  };

  const featureLabel = featureLabels[featureType] || featureType;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <DialogTitle>Limit Reached</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            {message}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-600 mb-2">
                Current Plan: <span className="font-semibold">{planName}</span>
              </p>
              {limitValue !== null && (
                <p className="text-sm text-gray-600">
                  Usage: <span className="font-semibold">{currentCount} / {limitValue}</span>
                </p>
              )}
            </div>
            <div className="bg-gray-100 rounded-lg p-4">
              <p className="text-sm font-medium mb-2">Upgrade to continue:</p>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li>Remove {featureLabel.toLowerCase()} limits</li>
                <li>Access to premium features</li>
                <li>Priority support</li>
              </ul>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button asChild>
            <Link href="/provider/subscription">
              <TrendingUp className="w-4 h-4 mr-2" />
              Upgrade Plan
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
