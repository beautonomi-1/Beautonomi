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
import { providerPortalFetch } from "@/lib/http/fetcher";
import { useTranslation } from "@beautonomi/i18n";

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
  const { t } = useTranslation();
  const [currentRating, setCurrentRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (rating) {
      setCurrentRating(rating.rating);
      setComment(rating.comment || "");
    }
  }, [rating]);

  const handleSubmit = async () => {
    if (!rating || currentRating === 0) {
      toast.error(t("web.provider.portal.editRating.selectRating"));
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await providerPortalFetch(`/api/provider/ratings/${rating.id}`, {
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
        throw new Error(errorData.message || t("web.provider.portal.editRating.updateFailed"));
      }

      toast.success(t("web.provider.portal.editRating.updated"));
      onRatingUpdated?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error updating rating:", error);
      toast.error(error instanceof Error ? error.message : t("web.provider.portal.editRating.updateFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!rating || !confirm(t("web.provider.portal.editRating.deleteConfirm"))) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await providerPortalFetch(`/api/provider/ratings/${rating.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || t("web.provider.portal.editRating.deleteFailed"));
      }

      toast.success(t("web.provider.portal.editRating.deleted"));
      onRatingUpdated?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error deleting rating:", error);
      toast.error(error instanceof Error ? error.message : t("web.provider.portal.editRating.deleteFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!rating) return null;

  const ratingLabels: Record<number, string> = {
    1: t("web.provider.portal.editRating.poor"),
    2: t("web.provider.portal.editRating.fair"),
    3: t("web.provider.portal.editRating.good"),
    4: t("web.provider.portal.editRating.veryGood"),
    5: t("web.provider.portal.editRating.excellent"),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("web.provider.portal.editRating.title")}</DialogTitle>
          <DialogDescription>
            {rating.booking_number
              ? t("web.provider.portal.editRating.descriptionBooking", { number: rating.booking_number })
              : t("web.provider.portal.editRating.descriptionGeneric")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label className="text-sm font-medium mb-2 block">{t("web.provider.portal.editRating.rating")}</Label>
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
                {ratingLabels[currentRating]}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="comment" className="text-sm font-medium mb-2 block">
              {t("web.provider.portal.editRating.commentOptional")}
            </Label>
            <Textarea
              id="comment"
              placeholder={t("web.provider.portal.editRating.commentPlaceholder")}
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
            {t("common.delete")}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting || currentRating === 0}>
              {isSubmitting
                ? t("web.provider.portal.editRating.updating")
                : t("web.provider.portal.editRating.updateRating")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
