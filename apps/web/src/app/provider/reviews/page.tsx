"use client";

import { useTranslation } from "@beautonomi/i18n";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  const { t } = useTranslation();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending_response" | "responded">("all");
  /** Which review the respond/edit modal is for (controlled dialog closes reliably after submit). */
  const [responseDialogReviewId, setResponseDialogReviewId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");
  const [isResponding, setIsResponding] = useState(false);
  const [isModerating, setIsModerating] = useState(false);

  useEffect(() => {
    loadReviews();
  }, [statusFilter]);

  useEffect(() => {
    if (!responseDialogReviewId) return;
    if (!reviews.some((r) => r.id === responseDialogReviewId)) {
      setResponseDialogReviewId(null);
      setResponseText("");
    }
  }, [reviews, responseDialogReviewId]);

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
      setError(err instanceof FetchError ? err.message : t("web.provider.pages.reviews.failedToLoad"));
      console.error("Error loading reviews:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const closeResponseDialog = () => {
    setResponseDialogReviewId(null);
    setResponseText("");
  };

  const handleRespond = async (reviewId: string, isEdit: boolean = false) => {
    if (!responseText.trim()) {
      toast.error(t("web.provider.pages.reviews.pleaseEnterResponse"));
      return;
    }

    try {
      setIsResponding(true);
      const endpoint = `/api/provider/reviews/${reviewId}/respond`;
      await fetcher[isEdit ? "patch" : "post"](endpoint, {
        response: responseText.trim(),
      });

      toast.success(isEdit ? t("web.provider.pages.reviews.responseUpdated") : t("web.provider.pages.reviews.responseAdded"));
      closeResponseDialog();
      await loadReviews();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.provider.pages.reviews.failedToSaveResponse"));
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

      toast.success(t("web.provider.pages.reviews.reviewActioned", { action }));
      await loadReviews();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.provider.pages.reviews.failedToModerate"));
      console.error("Error moderating review:", err);
    } finally {
      setIsModerating(false);
    }
  };

  const responseDialogReview =
    responseDialogReviewId == null
      ? null
      : reviews.find((r) => r.id === responseDialogReviewId) ?? null;

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reviews") },
        ]}
      >
        <LoadingTimeout loadingMessage={t("web.provider.pages.reviews.loading")} />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.sidebar.items.reviews") },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title={t("web.provider.sidebar.items.reviews")}
          subtitle={t("web.provider.pages.reviews.subtitle")}
        />

        <div className="flex gap-2">
            <Button
              variant={statusFilter === "all" ? "default" : "outline"}
              onClick={() => setStatusFilter("all")}
            >
              {t("web.provider.pages.reviews.allReviews")}
            </Button>
            <Button
              variant={statusFilter === "pending_response" ? "default" : "outline"}
              onClick={() => setStatusFilter("pending_response")}
            >
              {t("web.provider.pages.reviews.pendingResponse")}
            </Button>
            <Button
              variant={statusFilter === "responded" ? "default" : "outline"}
              onClick={() => setStatusFilter("responded")}
            >
              {t("web.provider.pages.reviews.responded")}
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
                <p className="text-gray-600">{t("web.provider.pages.reviews.noReviewsFound")}</p>
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
                        {t("web.provider.pages.reviews.bookingNumber", { number: review.booking.booking_number, date: new Date(review.created_at).toLocaleDateString() })}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {review.is_flagged && (
                        <Badge variant="destructive">{t("web.provider.pages.reviews.flagged")}</Badge>
                      )}
                      {!review.is_visible && (
                        <Badge variant="secondary">{t("web.provider.pages.reviews.hidden")}</Badge>
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
                        <p className="font-semibold text-blue-900">{t("web.provider.pages.reviews.yourResponse")}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setResponseDialogReviewId(review.id);
                            setResponseText(review.provider_response || "");
                          }}
                        >
                          <Edit2 className="w-4 h-4 me-1" />
                          {t("web.provider.common.edit")}
                        </Button>
                      </div>
                      <p className="text-blue-800">{review.provider_response}</p>
                      <p className="text-xs text-blue-600 mt-2">
                        {new Date(review.provider_response_at || "").toLocaleDateString()}
                      </p>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setResponseDialogReviewId(review.id);
                        setResponseText("");
                      }}
                    >
                      <MessageSquare className="w-4 h-4 me-2" />
                      {t("web.provider.common.respond")}
                    </Button>
                  )}

                  <div className="flex gap-2 mt-4 pt-4 border-t">
                    {!review.is_flagged && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleModerate(review.id, "flag", "Inappropriate content")}
                        disabled={isModerating}
                      >
                        <Flag className="w-4 h-4 me-1" />
                        {t("web.provider.common.flag")}
                      </Button>
                    )}
                    {review.is_flagged && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleModerate(review.id, "unflag")}
                        disabled={isModerating}
                      >
                        {t("web.provider.common.unflag")}
                      </Button>
                    )}
                    {review.is_visible ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleModerate(review.id, "hide")}
                        disabled={isModerating}
                      >
                        <EyeOff className="w-4 h-4 me-1" />
                        {t("web.provider.common.hide")}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleModerate(review.id, "unhide")}
                        disabled={isModerating}
                      >
                        <Eye className="w-4 h-4 me-1" />
                        {t("web.provider.common.show")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Dialog
          open={responseDialogReviewId !== null && responseDialogReview !== null}
          onOpenChange={(open) => {
            if (!open) closeResponseDialog();
          }}
        >
          <DialogContent>
            {responseDialogReview ? (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {responseDialogReview.provider_response ? t("web.provider.pages.reviews.editYourResponse") : t("web.provider.pages.reviews.respondToReview")}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <Textarea
                    placeholder={t("web.provider.pages.reviews.writeResponsePlaceholder")}
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    rows={6}
                    maxLength={1000}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={closeResponseDialog}>
                      {t("web.provider.common.cancel")}
                    </Button>
                    <Button
                      onClick={() =>
                        handleRespond(
                          responseDialogReview.id,
                          Boolean(responseDialogReview.provider_response)
                        )
                      }
                      disabled={isResponding}
                    >
                      <Send className="w-4 h-4 me-2" />
                      {responseDialogReview.provider_response ? t("web.provider.pages.reviews.saveChanges") : t("web.provider.pages.reviews.sendResponse")}
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </SettingsDetailLayout>
  );
}
