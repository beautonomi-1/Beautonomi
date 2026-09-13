"use client";

import { useEffect, useState, useRef } from "react";
import { fetcher } from "@/lib/http/fetcher";
import BackButton from "../components/back-button";
import Breadcrumb from "../components/breadcrumb";
import BottomNav from "@/components/layout/bottom-nav";
import { toast } from "sonner";
import { Star, Edit, Trash2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { CustomerReviewListItem } from "./review-list-types";
import { useTranslation } from "@beautonomi/i18n";

type Review = CustomerReviewListItem;

export default function ReviewsPage({
  initialReviews,
}: {
  initialReviews: CustomerReviewListItem[] | null;
}) {
  const { t } = useTranslation();
  const initialSnapshot = useRef(initialReviews);
  const [reviews, setReviews] = useState<Review[]>(() => initialReviews ?? []);
  const [isLoading, setIsLoading] = useState(() => initialReviews === null);
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [editRating, setEditRating] = useState(0);
  const [editComment, setEditComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const skipHydrateLoadOnce = useRef(initialReviews !== null);

  useEffect(() => {
    if (skipHydrateLoadOnce.current) {
      skipHydrateLoadOnce.current = false;
      setReviews(initialSnapshot.current ?? []);
      setIsLoading(false);
      return;
    }
    void loadReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only; initial snapshot is fixed for this navigation
  }, []);

  const loadReviews = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: { reviews: Review[] } }>("/api/me/reviews", { staleTimeMs: 30_000 });
      setReviews(response.data.reviews);
    } catch (error) {
      console.error("Failed to load reviews:", error);
      toast.error(t("web.accountSettings.myReviews.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (review: Review) => {
    setEditingReview(review);
    setEditRating(review.rating);
    setEditComment(review.comment || "");
  };

  const handleSaveEdit = async () => {
    if (!editingReview || editRating === 0) {
      toast.error(t("web.accountSettings.myReviews.selectRating"));
      return;
    }

    try {
      setIsSubmitting(true);
      await fetcher.patch(`/api/bookings/${editingReview.booking_id}/review`, {
        rating: editRating,
        comment: editComment.trim() || null,
      });

      toast.success(t("web.accountSettings.myReviews.updated"));
      setEditingReview(null);
      loadReviews();
    } catch (error) {
      console.error("Failed to update review:", error);
      toast.error(t("web.accountSettings.myReviews.updateFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (reviewId: string, bookingId: string) => {
    if (!confirm(t("web.accountSettings.myReviews.deleteConfirm"))) {
      return;
    }

    try {
      // Note: Delete endpoint would need to be created
      await fetcher.delete(`/api/bookings/${bookingId}/review`);
      toast.success(t("web.accountSettings.myReviews.deleted"));
      loadReviews();
    } catch (error) {
      console.error("Failed to delete review:", error);
      toast.error(t("web.accountSettings.myReviews.deleteFailed"));
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50/50 pb-20 md:pb-0">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8">
          <BackButton href="/account-settings" />
          <Breadcrumb
            items={[
              { label: t("web.accountSettings.myReviews.breadcrumbHome"), href: "/" },
              { label: t("web.accountSettings.myReviews.breadcrumbAccount"), href: "/account-settings" },
              { label: t("web.accountSettings.myReviews.breadcrumbTitle") },
            ]}
          />

          <div
            className="mt-6"
          >
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tighter text-gray-900 mb-8">
              {t("web.accountSettings.myReviews.title")}
            </h1>

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <p className="text-sm text-gray-500">{t("web.accountSettings.loading.loading")}</p>
              </div>
            ) : reviews.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title={t("web.accountSettings.myReviews.emptyTitle")}
                description={t("web.accountSettings.myReviews.emptyDesc")}
              />
            ) : (
              <div className="space-y-4">
                {reviews.map((review) => (
                  <div
                    key={review.id}
                    className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {review.providers?.business_name || t("web.accountSettings.myReviews.providerFallback")}
                          </h3>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`w-4 h-4 ${
                                  star <= review.rating
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "text-gray-300"
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                        {review.bookings && (
                          <p className="text-sm text-gray-600">
                            {t("web.accountSettings.myReviews.bookingNumber", {
                              number: review.bookings.booking_number,
                              date: new Date(review.bookings.scheduled_at).toLocaleDateString(),
                            })}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(review.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(review)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>{t("web.accountSettings.myReviews.editTitle")}</DialogTitle>
                              <DialogDescription>
                                {t("web.accountSettings.myReviews.editDesc", { name: review.providers?.business_name })}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div>
                                <Label>{t("web.accountSettings.myReviews.rating")}</Label>
                                <div className="flex gap-2 mt-2">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                      key={star}
                                      type="button"
                                      onClick={() => setEditRating(star)}
                                      className="focus:outline-none"
                                    >
                                      <Star
                                        className={`w-8 h-8 ${
                                          star <= editRating
                                            ? "fill-yellow-400 text-yellow-400"
                                            : "text-gray-300"
                                        }`}
                                      />
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <Label htmlFor="edit-comment">{t("web.accountSettings.myReviews.comment")}</Label>
                                <Textarea
                                  id="edit-comment"
                                  value={editComment}
                                  onChange={(e) => setEditComment(e.target.value)}
                                  rows={4}
                                  maxLength={1000}
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                  {t("web.accountSettings.myReviews.charactersCount", { count: editComment.length })}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  onClick={() => setEditingReview(null)}
                                  className="flex-1"
                                >
                                  {t("common.cancel")}
                                </Button>
                                <Button
                                  onClick={handleSaveEdit}
                                  disabled={isSubmitting || editRating === 0}
                                  className="flex-1"
                                >
                                  {isSubmitting ? t("web.accountSettings.myReviews.saving") : t("web.accountSettings.myReviews.saveChanges")}
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(review.id, review.booking_id)}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                    {review.comment && (
                      <p className="text-gray-700 mt-4">{review.comment}</p>
                    )}
                    {review.provider_response && (
                      <div className="mt-4 rounded-xl border-s-4 border-pink-400 bg-pink-50/50 p-4">
                        <p className="text-xs font-semibold text-pink-600 mb-1">{t("web.accountSettings.myReviews.providerReply")}</p>
                        <p className="text-sm text-gray-700 leading-relaxed">{review.provider_response}</p>
                        {review.provider_response_at && (
                          <p className="text-xs text-gray-400 mt-2">
                            {new Date(review.provider_response_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <BottomNav />
      </div>
  );
}
