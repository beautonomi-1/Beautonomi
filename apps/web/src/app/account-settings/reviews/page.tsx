"use client";

import { useEffect, useState } from "react";
import { fetcher } from "@/lib/http/fetcher";
import AuthGuard from "@/components/auth/auth-guard";
import BackButton from "../components/back-button";
import Breadcrumb from "../components/breadcrumb";
import BottomNav from "@/components/layout/bottom-nav";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Star, Edit, Trash2, Loader2, MessageSquare } from "lucide-react";
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

interface Review {
  id: string;
  booking_id: string;
  provider_id: string;
  rating: number;
  comment: string | null;
  photos: string[] | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
  bookings: {
    id: string;
    booking_number: string;
    scheduled_at: string;
    status: string;
  } | null;
  providers: {
    id: string;
    business_name: string;
    thumbnail_url: string | null;
    avatar_url?: string | null;
  } | null;
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [editRating, setEditRating] = useState(0);
  const [editComment, setEditComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadReviews();
  }, []);

  const loadReviews = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: { reviews: Review[] } }>("/api/me/reviews", { cache: "no-store" });
      setReviews(response.data.reviews);
    } catch (error) {
      console.error("Failed to load reviews:", error);
      toast.error("Failed to load reviews");
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
      toast.error("Please select a rating");
      return;
    }

    try {
      setIsSubmitting(true);
      await fetcher.patch(`/api/bookings/${editingReview.booking_id}/review`, {
        rating: editRating,
        comment: editComment.trim() || null,
      });

      toast.success("Review updated successfully");
      setEditingReview(null);
      loadReviews();
    } catch (error) {
      console.error("Failed to update review:", error);
      toast.error("Failed to update review");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (reviewId: string, bookingId: string) => {
    if (!confirm("Are you sure you want to delete this review?")) {
      return;
    }

    try {
      // Note: Delete endpoint would need to be created
      await fetcher.delete(`/api/bookings/${bookingId}/review`);
      toast.success("Review deleted successfully");
      loadReviews();
    } catch (error) {
      console.error("Failed to delete review:", error);
      toast.error("Failed to delete review");
    }
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-50/50 pb-20 md:pb-0">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8">
          <BackButton href="/account-settings" />
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: "Account Settings", href: "/account-settings" },
              { label: "My Reviews" },
            ]}
          />

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-6"
          >
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tighter text-gray-900 mb-8">
              My Reviews
            </h1>

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-[#FF0077] animate-spin" />
              </div>
            ) : reviews.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="No reviews yet"
                description="Your reviews will appear here once you submit them for completed bookings."
              />
            ) : (
              <div className="space-y-4">
                {reviews.map((review) => (
                  <motion.div
                    key={review.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {review.providers?.business_name || "Provider"}
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
                            Booking #{review.bookings.booking_number} •{" "}
                            {new Date(review.bookings.scheduled_at).toLocaleDateString()}
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
                              <DialogTitle>Edit Review</DialogTitle>
                              <DialogDescription>
                                Update your review for {review.providers?.business_name}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div>
                                <Label>Rating</Label>
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
                                <Label htmlFor="edit-comment">Comment</Label>
                                <Textarea
                                  id="edit-comment"
                                  value={editComment}
                                  onChange={(e) => setEditComment(e.target.value)}
                                  rows={4}
                                  maxLength={1000}
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                  {editComment.length}/1000 characters
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  onClick={() => setEditingReview(null)}
                                  className="flex-1"
                                >
                                  Cancel
                                </Button>
                                <Button
                                  onClick={handleSaveEdit}
                                  disabled={isSubmitting || editRating === 0}
                                  className="flex-1"
                                >
                                  {isSubmitting ? "Saving..." : "Save Changes"}
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
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
        <BottomNav />
      </div>
    </AuthGuard>
  );
}
