"use client";

import { useTranslation } from "@beautonomi/i18n";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Star } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";

interface RateCustomerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  customerName: string;
  /** When set, submit updates this provider_client_ratings row (PATCH). */
  providerRatingId?: string | null;
  initialRating?: number;
  initialComment?: string;
  onSuccess?: () => void;
}

export default function RateCustomerModal({
  open,
  onOpenChange,
  bookingId,
  customerName,
  providerRatingId,
  initialRating,
  initialComment,
  onSuccess,
}: RateCustomerModalProps) {
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [comment, setComment] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    setRating(
      typeof initialRating === "number" && initialRating >= 1 && initialRating <= 5 ? initialRating : 0
    );
    setComment(typeof initialComment === "string" ? initialComment : "");
  }, [open, initialRating, initialComment]);

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error(t("web.reviews.rateCustomer.selectRating"));
      return;
    }

    try {
      setIsSubmitting(true);
      if (providerRatingId) {
        await fetcher.patch(`/api/provider/ratings/${providerRatingId}`, {
          rating,
          comment: comment.trim() || undefined,
        });
        toast.success(t("web.reviews.rateCustomer.updated"));
      } else {
        await fetcher.post("/api/provider/ratings", {
          booking_id: bookingId,
          rating,
          comment: comment.trim() || undefined,
        });
        toast.success(t("web.reviews.rateCustomer.submitted"));
      }
      onSuccess?.();
      onOpenChange(false);
      // Reset form
      setRating(0);
      setComment("");
    } catch (error: unknown) {
      console.error("Error submitting rating:", error);
      const message = error instanceof Error ? error.message : t("web.reviews.rateCustomer.submitFailed");
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onOpenChange(false);
      setRating(0);
      setComment("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">
            {providerRatingId ? t("web.reviews.rateCustomer.updateTitle", { name: customerName }) : t("web.reviews.rateCustomer.rateTitle", { name: customerName })}
          </DialogTitle>
          <DialogDescription>
{t("web.reviews.rateCustomer.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Star Rating */}
          <div>
            <Label className="text-base font-medium mb-3 block">
{t("web.reviews.rateCustomer.howWouldYouRate")}
            </Label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  disabled={isSubmitting}
                  className="focus:outline-none transition-transform hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Star
                    className={`h-10 w-10 ${
                      star <= (hoveredRating || rating)
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-gray-300"
                    } transition-colors`}
                  />
                </button>
              ))}
              {rating > 0 && (
                <span className="ms-2 text-sm text-gray-600">
{rating === 1
                    ? t("web.reviews.rateCustomer.poor")
                    : rating === 2
                    ? t("web.reviews.rateCustomer.fair")
                    : rating === 3
                    ? t("web.reviews.rateCustomer.good")
                    : rating === 4
                    ? t("web.reviews.rateCustomer.veryGood")
                    : t("web.reviews.rateCustomer.excellent")}
                </span>
              )}
            </div>
          </div>

          {/* Comment */}
          <div>
            <Label htmlFor="comment" className="text-base font-medium mb-3 block">
{t("web.reviews.rateCustomer.addComment")}
            </Label>
            <Textarea
              id="comment"
              placeholder={t("web.reviews.rateCustomer.commentPlaceholder")}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={isSubmitting}
              rows={4}
              className="resize-none"
              maxLength={500}
            />
            <p className="text-xs text-gray-500 mt-1">
{t("web.reviews.rateCustomer.charCount", { count: comment.length })}
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
{t("common.cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || rating === 0}
              className="bg-gradient-to-r from-[#FF0077] to-[#D60565] hover:from-[#D60565] hover:to-[#FF0077] text-white"
            >
{isSubmitting ? t("web.reviews.rateCustomer.submitting") : t("web.reviews.rateCustomer.submitRating")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
