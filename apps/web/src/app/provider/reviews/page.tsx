"use client";

import React, { useState, useEffect } from "react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Star, MessageSquare, Flag, Eye, EyeOff, Edit2, Send } from "lucide-react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  provider_response: string | null;
  provider_response_at: string | null;
  is_flagged: boolean;
  is_visible: boolean;
  created_at: string;
  customer: {
    id: string;
    full_name: string;
    email: string;
  };
  booking: {
    id: string;
    booking_number: string;
    scheduled_at: string;
  };
}

export default function ProviderReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending_response" | "responded">("all");
  const [_selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [responseText, setResponseText] = useState("");
  const [isResponding, setIsResponding] = useState(false);
  const [isModerating, setIsModerating] = useState(false);

  useEffect(() => {
    loadReviews();
  }, [statusFilter]);

  const loadReviews = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetcher.get<{ data: { reviews: Review[] } }>(
        `/api/provider/reviews?status=${statusFilter}`,
        { timeoutMs: 30000 } // 30 second timeout
      );
      setReviews(response.data.reviews || []);
    } catch (err) {
      setError(err instanceof FetchError ? err.message : "Failed to load reviews");
      console.error("Error loading reviews:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRespond = async (reviewId: string, isEdit: boolean = false) => {
    if (!responseText.trim()) {
      toast.error("Please enter a response");
      return;
    }

    try {
      setIsResponding(true);
      const endpoint = `/api/provider/reviews/${reviewId}/respond`;
      await fetcher[isEdit ? "PATCH" : "POST"](endpoint, {
        response: responseText.trim(),
      });

      toast.success(isEdit ? "Response updated successfully" : "Response added successfully");
      setSelectedReview(null);
      setResponseText("");
      loadReviews();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to save response");
      console.error("Error saving response:", err);
    } finally {
      setIsResponding(false);
    }
  };

  const handleModerate = async (reviewId: string, action: "flag" | "unflag" | "hide" | "unhide", reason?: string) => {
    try {
      setIsModerating(true);
      await fetcher.post(`/api/provider/reviews/${reviewId}/moderate`, {
        action,
        reason,
      });

      toast.success(`Review ${action}ed successfully`);
      loadReviews();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to moderate review");
      console.error("Error moderating review:", err);
    } finally {
      setIsModerating(false);
    }
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reviews" },
        ]}
      >
        <LoadingTimeout loadingMessage="Loading reviews..." />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Reviews" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title="Reviews"
          subtitle="Manage and respond to customer reviews"
        />

        <div className="flex gap-2">
            <Button
              variant={statusFilter === "all" ? "default" : "outline"}
              onClick={() => setStatusFilter("all")}
            >
              All Reviews
            </Button>
            <Button
              variant={statusFilter === "pending_response" ? "default" : "outline"}
              onClick={() => setStatusFilter("pending_response")}
            >
              Pending Response
            </Button>
            <Button
              variant={statusFilter === "responded" ? "default" : "outline"}
              onClick={() => setStatusFilter("responded")}
            >
              Responded
            </Button>
          </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          {reviews.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-gray-600">No reviews found</p>
              </CardContent>
            </Card>
          ) : (
            reviews.map((review) => (
              <Card key={review.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`w-5 h-5 ${
                                star <= review.rating
                                  ? "fill-yellow-400 text-yellow-400"
                                  : "text-gray-300"
                              }`}
                            />
                          ))}
                        </div>
                        <span className="font-semibold">{review.rating}.0</span>
                      </div>
                      <p className="font-medium">{review.customer.full_name}</p>
                      <p className="text-sm text-gray-600">
                        Booking #{review.booking.booking_number} • {new Date(review.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {review.is_flagged && (
                        <Badge variant="destructive">Flagged</Badge>
                      )}
                      {!review.is_visible && (
                        <Badge variant="secondary">Hidden</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {review.comment && (
                    <p className="mb-4 text-gray-700">{review.comment}</p>
                  )}

                  {review.provider_response ? (
                    <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <p className="font-semibold text-blue-900">Your Response</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedReview(review);
                            setResponseText(review.provider_response || "");
                          }}
                        >
                          <Edit2 className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                      </div>
                      <p className="text-blue-800">{review.provider_response}</p>
                      <p className="text-xs text-blue-600 mt-2">
                        {new Date(review.provider_response_at || "").toLocaleDateString()}
                      </p>
                    </div>
                  ) : (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedReview(review);
                            setResponseText("");
                          }}
                        >
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Respond
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Respond to Review</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <Textarea
                            placeholder="Write your response..."
                            value={responseText}
                            onChange={(e) => setResponseText(e.target.value)}
                            rows={6}
                            maxLength={1000}
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              onClick={() => {
                                setSelectedReview(null);
                                setResponseText("");
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              onClick={() => handleRespond(review.id, false)}
                              disabled={isResponding}
                            >
                              <Send className="w-4 h-4 mr-2" />
                              Send Response
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}

                  <div className="flex gap-2 mt-4 pt-4 border-t">
                    {!review.is_flagged && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleModerate(review.id, "flag", "Inappropriate content")}
                        disabled={isModerating}
                      >
                        <Flag className="w-4 h-4 mr-1" />
                        Flag
                      </Button>
                    )}
                    {review.is_flagged && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleModerate(review.id, "unflag")}
                        disabled={isModerating}
                      >
                        Unflag
                      </Button>
                    )}
                    {review.is_visible ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleModerate(review.id, "hide")}
                        disabled={isModerating}
                      >
                        <EyeOff className="w-4 h-4 mr-1" />
                        Hide
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleModerate(review.id, "unhide")}
                        disabled={isModerating}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Show
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </SettingsDetailLayout>
  );
}
