"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Star, Send, ArrowLeft, Upload, X } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import Link from "next/link";
import AuthGuard from "@/components/auth/auth-guard";
import { useAuth } from "@/providers/AuthProvider";

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  useAuth();
  const bookingId = params.id as string;

  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [booking, setBooking] = useState<any>(null);

  useEffect(() => {
    loadBooking();
  }, [bookingId]); // eslint-disable-line react-hooks/exhaustive-deps -- load on mount when bookingId changes

  const loadBooking = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<any>(`/api/me/bookings/${bookingId}`, { cache: "no-store" });
      setBooking(response.data);
    } catch (error) {
      console.error("Failed to load booking:", error);
      toast.error("Failed to load booking");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // In a real implementation, upload to storage and get URLs
    // For now, we'll just show a placeholder
    toast.info("Photo upload functionality coming soon");
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }

    try {
      setIsSubmitting(true);
      await fetcher.post(`/api/bookings/${bookingId}/review`, {
        rating,
        comment: comment.trim() || null,
        photos,
      });

      toast.success("Review submitted successfully!");
      router.push(`/account-settings/bookings/${bookingId}`);
    } catch (error) {
      console.error("Failed to submit review:", error);
      toast.error(
        error instanceof FetchError
          ? error.message
          : "Failed to submit review. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading..." />
      </div>
    );
  }

  return (
    <AuthGuard>
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Link href={`/account-settings/bookings/${bookingId}`}>
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Booking
          </Button>
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Write a Review</CardTitle>
            {booking && (
              <p className="text-gray-600 mt-2">
                Share your experience with {booking.provider?.business_name || "this provider"}
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="text-base font-medium mb-3 block">
                How would you rate your experience? *
              </Label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoveredRating(star)}
                    onMouseLeave={() => setHoveredRating(0)}
                    className="focus:outline-none"
                  >
                    <Star
                      className={`w-10 h-10 transition-colors ${
                        star <= (hoveredRating || rating)
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-gray-300"
                      }`}
                    />
                  </button>
                ))}
              </div>
              {rating > 0 && (
                <p className="text-sm text-gray-600 mt-2">
                  {rating === 5
                    ? "Excellent!"
                    : rating === 4
                    ? "Great!"
                    : rating === 3
                    ? "Good"
                    : rating === 2
                    ? "Fair"
                    : "Poor"}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="comment" className="text-base font-medium mb-3 block">
                Tell us about your experience
              </Label>
              <Textarea
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share details about your experience..."
                rows={6}
                maxLength={1000}
              />
              <p className="text-xs text-gray-500 mt-2">
                {comment.length}/1000 characters
              </p>
            </div>

            <div>
              <Label className="text-base font-medium mb-3 block">
                Add Photos (Optional)
              </Label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600 mb-2">
                  Upload photos of your experience
                </p>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoUpload}
                  className="hidden"
                  id="photo-upload"
                />
                <label htmlFor="photo-upload">
                  <Button variant="outline" type="button" asChild>
                    <span>Choose Photos</span>
                  </Button>
                </label>
              </div>
              {photos.length > 0 && (
                <div className="mt-4 flex gap-2">
                  {photos.map((photo, index) => (
                    <div key={index} className="relative">
                      <img
                        src={photo}
                        alt={`Review photo ${index + 1}`}
                        className="w-20 h-20 object-cover rounded"
                      />
                      <button
                        onClick={() => setPhotos(photos.filter((_, i) => i !== index))}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-4 pt-4">
              <Button
                variant="outline"
                onClick={() => router.back()}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || rating === 0}
                className="flex-1 bg-[#FF0077] hover:bg-[#D60565]"
              >
                {isSubmitting ? (
                  "Submitting..."
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Submit Review
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AuthGuard>
  );
}
