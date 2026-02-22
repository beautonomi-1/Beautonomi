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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Star } from "lucide-react";
import { toast } from "sonner";

interface ProviderClientRatingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  customerName: string;
  locationId?: string | null;
  locationName?: string | null;
  onRatingSubmitted?: () => void;
  /** When true (e.g. after completing a booking), rating is required and Skip is hidden */
  requireRating?: boolean;
}

export function ProviderClientRatingDialog({
  open,
  onOpenChange,
  bookingId,
  customerName,
  locationId,
  locationName,
  onRatingSubmitted,
  requireRating = false,
}: ProviderClientRatingDialogProps) {
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/provider/ratings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          booking_id: bookingId,
          rating,
          comment: comment.trim() || undefined,
          location_id: locationId || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to submit rating");
      }

      toast.success("Rating submitted successfully");
      onRatingSubmitted?.();
      onOpenChange(false);
      // Reset form
      setRating(0);
      setComment("");
    } catch (error) {
      console.error("Error submitting rating:", error);
      toast.error(error instanceof Error ? error.message : "Failed to submit rating");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    onOpenChange(false);
    // Reset form
    setRating(0);
    setComment("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Rate {customerName}</DialogTitle>
          <DialogDescription>
            {requireRating
              ? "Please rate this client to complete the booking. Your rating helps maintain service quality."
              : "How was your experience with this client? Your rating helps maintain service quality."}
            {locationName && (
              <span className="block mt-1 text-xs text-gray-500">
                Location: {locationName}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Star Rating */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Rating</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className="focus:outline-none"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                >
                  <Star
                    className={`w-8 h-8 transition-colors ${
                      star <= (hoveredRating || rating)
                        ? "fill-yellow-400 text-yellow-400"
                        : "fill-gray-200 text-gray-200"
                    }`}
                  />
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="text-sm text-gray-500 mt-1">
                {rating === 1 && "Poor"}
                {rating === 2 && "Fair"}
                {rating === 3 && "Good"}
                {rating === 4 && "Very Good"}
                {rating === 5 && "Excellent"}
              </p>
            )}
          </div>

          {/* Comment */}
          <div>
            <Label htmlFor="comment" className="text-sm font-medium mb-2 block">
              Comment (Optional)
            </Label>
            <Textarea
              id="comment"
              placeholder="Add any additional notes about this client..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          {!requireRating && (
            <Button variant="outline" onClick={handleSkip} disabled={isSubmitting}>
              Skip
            </Button>
          )}
          <Button onClick={handleSubmit} disabled={isSubmitting || rating === 0}>
            {isSubmitting ? "Submitting..." : "Submit Rating"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
