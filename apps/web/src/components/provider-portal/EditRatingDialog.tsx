"use client";

import React, { useState, useEffect } from "react";
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

interface EditRatingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rating: {
    id: string;
    booking_id: string;
    booking_number?: string;
    rating: number;
    comment?: string | null;
  } | null;
  onRatingUpdated?: () => void;
}

export function EditRatingDialog({
  open,
  onOpenChange,
  rating,
  onRatingUpdated,
}: EditRatingDialogProps) {
  const [currentRating, setCurrentRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize form when rating changes
  useEffect(() => {
    if (rating) {
      setCurrentRating(rating.rating);
      setComment(rating.comment || "");
    }
  }, [rating]);

  const handleSubmit = async () => {
    if (!rating || currentRating === 0) {
      toast.error("Please select a rating");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/provider/ratings/${rating.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rating: currentRating,
          comment: comment.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to update rating");
      }

      toast.success("Rating updated successfully");
      onRatingUpdated?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error updating rating:", error);
      toast.error(error instanceof Error ? error.message : "Failed to update rating");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!rating || !confirm("Are you sure you want to delete this rating?")) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/provider/ratings/${rating.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to delete rating");
      }

      toast.success("Rating deleted successfully");
      onRatingUpdated?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error deleting rating:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete rating");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!rating) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Rating</DialogTitle>
          <DialogDescription>
            Update your rating for {rating.booking_number ? `Booking ${rating.booking_number}` : "this booking"}.
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
                  onClick={() => setCurrentRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                >
                  <Star
                    className={`w-8 h-8 transition-colors ${
                      star <= (hoveredRating || currentRating)
                        ? "fill-yellow-400 text-yellow-400"
                        : "fill-gray-200 text-gray-200"
                    }`}
                  />
                </button>
              ))}
            </div>
            {currentRating > 0 && (
              <p className="text-sm text-gray-500 mt-1">
                {currentRating === 1 && "Poor"}
                {currentRating === 2 && "Fair"}
                {currentRating === 3 && "Good"}
                {currentRating === 4 && "Very Good"}
                {currentRating === 5 && "Excellent"}
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

        <DialogFooter className="flex justify-between">
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isSubmitting}
          >
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting || currentRating === 0}>
              {isSubmitting ? "Updating..." : "Update Rating"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
