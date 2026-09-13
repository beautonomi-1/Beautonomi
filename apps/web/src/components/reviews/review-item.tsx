"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Trash2, Flag, MessageSquare } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";
import { useAuth } from "@/providers/AuthProvider";

interface ReviewItemProps {
  review: {
    id: string;
    reviewer_name: string;
    reviewer_image?: string;
    review_text: string;
    rating: number;
    date: string;
    provider_response?: string;
    provider_response_at?: string;
  };
  onDelete?: () => void;
  onReport?: () => void;
  onRespond?: (response: string) => void;
  showActions?: boolean;
  userRole?: "customer" | "provider" | "superadmin";
}

export default function ReviewItem({
  review,
  onDelete,
  onReport,
  onRespond,
  showActions = true,
  userRole,
}: ReviewItemProps) {
  const { t } = useTranslation();
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [showResponseDialog, setShowResponseDialog] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [responseText, setResponseText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user: _user } = useAuth();

  const canDelete = userRole === "superadmin";
  const canRespond = userRole === "provider" || userRole === "superadmin";
  const canReport = userRole === "customer" || userRole === "provider";

  const handleReport = async () => {
    if (!reportReason.trim()) {
      toast.error(t("web.reviews.reviewItem.reportReasonRequired"));
      return;
    }

    try {
      setIsSubmitting(true);
      await fetcher.post("/api/reviews/report", {
        review_id: review.id,
        reason: reportReason,
      });
      toast.success(t("web.reviews.reviewItem.reported"));
      setShowReportDialog(false);
      setReportReason("");
      if (onReport) onReport();
    } catch (error) {
      toast.error(t("web.reviews.reviewItem.reportFailed"));
      console.error("Error reporting review:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRespond = async () => {
    if (!responseText.trim()) {
      toast.error(t("web.reviews.reviewItem.responseRequired"));
      return;
    }

    try {
      setIsSubmitting(true);
      await fetcher.post("/api/reviews/respond", {
        review_id: review.id,
        response: responseText,
      });
      toast.success(t("web.reviews.reviewItem.responseAdded"));
      setShowResponseDialog(false);
      setResponseText("");
      if (onRespond) onRespond(responseText);
    } catch (error) {
      toast.error(t("web.reviews.reviewItem.responseFailed"));
      console.error("Error responding to review:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("web.reviews.reviewItem.deleteConfirm"))) {
      return;
    }

    try {
      setIsSubmitting(true);
      await fetcher.delete(`/api/reviews/${review.id}`);
      toast.success(t("web.reviews.reviewItem.deleted"));
      if (onDelete) onDelete();
    } catch (error) {
      toast.error(t("web.reviews.reviewItem.deleteFailed"));
      console.error("Error deleting review:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="border-b pb-6 mb-6 border-gray-200">
        <div className="flex justify-between items-start mb-4">
          <div className="flex gap-4 items-center flex-1">
            <div className="relative w-12 h-12 rounded-full overflow-hidden bg-gray-200">
              {review.reviewer_image?.trim() ? (
                <Image
                  src={review.reviewer_image.trim()}
                  alt={review.reviewer_name}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 font-semibold">
                  {review.reviewer_name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1">
              <h3 className="text-base font-medium text-gray-900">{review.reviewer_name}</h3>
              <p className="text-sm text-gray-500">{review.date}</p>
              <div className="flex items-center gap-1 mt-1">
                {[...Array(5)].map((_, i) => (
                  <span
                    key={i}
                    className={`text-lg ${
                      i < review.rating ? "text-yellow-400" : "text-gray-300"
                    }`}
                  >
                    ★
                  </span>
                ))}
              </div>
            </div>
          </div>

          {showActions && (
            <div className="flex gap-2">
              {canReport && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowReportDialog(true)}
                  className="text-gray-600 hover:text-red-600"
                >
                  <Flag className="w-4 h-4 me-1" />
                  {t("web.reviews.reviewItem.report")}
                </Button>
              )}
              {canRespond && !review.provider_response && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowResponseDialog(true)}
                  className="text-gray-600 hover:text-blue-600"
                >
                  <MessageSquare className="w-4 h-4 me-1" />
                  {t("web.reviews.reviewItem.respond")}
                </Button>
              )}
              {canDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isSubmitting}
                  className="text-gray-600 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4 me-1" />
                  {t("web.reviews.reviewItem.delete")}
                </Button>
              )}
            </div>
          )}
        </div>

        <p className="text-base text-gray-700 mb-4">{review.review_text}</p>

        {review.provider_response && (
          <div className="bg-gray-50 rounded-lg p-4 mt-4 border-s-4 border-[#FF0077]">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-semibold text-sm text-gray-900">{t("web.reviews.reviewItem.providerResponse")}</span>
              {review.provider_response_at && (
                <span className="text-xs text-gray-500">{new Date(review.provider_response_at).toLocaleDateString()}</span>
              )}
            </div>
            <p className="text-sm text-gray-700">{review.provider_response}</p>
          </div>
        )}
      </div>

      {/* Report Dialog */}
      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("web.reviews.reviewItem.reportTitle")}</DialogTitle>
            <DialogDescription>
              {t("web.reviews.reviewItem.reportDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="reason">{t("web.reviews.reviewItem.reasonLabel")}</Label>
              <Textarea
                id="reason"
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder={t("web.reviews.reviewItem.reasonPlaceholder")}
                rows={4}
                className="mt-1"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowReportDialog(false)}>
                {t("web.reviews.reviewItem.cancel")}
              </Button>
              <Button
                onClick={handleReport}
                disabled={isSubmitting || !reportReason.trim()}
                className="bg-[#FF0077] hover:bg-[#E6006A]"
              >
                {isSubmitting ? t("web.reviews.reviewItem.submitting") : t("web.reviews.reviewItem.submitReport")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Response Dialog */}
      <Dialog open={showResponseDialog} onOpenChange={setShowResponseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("web.reviews.reviewItem.respondTitle")}</DialogTitle>
            <DialogDescription>
              {t("web.reviews.reviewItem.respondDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="response">{t("web.reviews.reviewItem.yourResponse")}</Label>
              <Textarea
                id="response"
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                placeholder={t("web.reviews.reviewItem.responsePlaceholder")}
                rows={4}
                className="mt-1"
                maxLength={500}
              />
              <p className="text-xs text-gray-500 mt-1">
                {t("web.reviews.reviewItem.charCount", { count: responseText.length })}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowResponseDialog(false)}>
                {t("web.reviews.reviewItem.cancel")}
              </Button>
              <Button
                onClick={handleRespond}
                disabled={isSubmitting || !responseText.trim()}
                className="bg-[#FF0077] hover:bg-[#E6006A]"
              >
                {isSubmitting ? t("web.reviews.reviewItem.submitting") : t("web.reviews.reviewItem.postResponse")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
