"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Calendar, Loader2 } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

interface AvailableSlot {
  date: string;
  time: string;
  staff_id: string;
  staff_name: string;
}

interface QuickBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  waitlistEntryId: string;
  clientName: string;
  serviceName: string;
  availableSlots: AvailableSlot[];
  onSuccess?: () => void;
}

export default function QuickBookingModal({
  isOpen,
  onClose,
  waitlistEntryId,
  clientName,
  serviceName,
  availableSlots,
  onSuccess,
}: QuickBookingModalProps) {
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedSlot) {
      toast.error("Please select a time slot");
      return;
    }

    setIsSubmitting(true);
    try {
      const [date, time, staffId] = selectedSlot.split("|");
      await fetcher.post(`/api/provider/waitlist/${waitlistEntryId}/quick-book`, {
        date,
        time,
        staff_id: staffId,
      });

      toast.success("Booking created successfully!");
      onClose();
      setSelectedSlot("");
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to create booking. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const slotOptions = availableSlots.map((slot) => ({
    value: `${slot.date}|${slot.time}|${slot.staff_id}`,
    label: `${format(parseISO(slot.date), "MMM d, yyyy")} at ${slot.time} with ${slot.staff_name}`,
    slot,
  }));

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Quick Book from Waitlist</DialogTitle>
          <DialogDescription>
            Create a booking for {clientName} from the waitlist.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="space-y-2">
              <div>
                <span className="text-sm font-medium text-gray-700">Client:</span>
                <span className="ml-2 text-sm text-gray-900">{clientName}</span>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700">Service:</span>
                <span className="ml-2 text-sm text-gray-900">{serviceName}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="slot">Select Time Slot *</Label>
            <Select value={selectedSlot} onValueChange={setSelectedSlot}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a time slot" />
              </SelectTrigger>
              <SelectContent>
                {slotOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      <span>{option.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {slotOptions.length === 0 && (
              <p className="text-sm text-amber-600">
                No available slots. Please refresh the waitlist matches.
              </p>
            )}
          </div>

          {selectedSlot && (
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-blue-900">
                This will create a booking and notify the client automatically.
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              className="flex-1 bg-[#FF0077] hover:bg-[#D60565]"
              disabled={isSubmitting || !selectedSlot || slotOptions.length === 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Booking"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
