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
import Image from "next/image";
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
  const [photoUploading, setPhotoUploading] = useState(false);
  const [services, setServices] = useState<Array<{ offering_id: string; offering_name: string; staff_id?: string | null; staff_name?: string | null }>>([]);
  const [serviceRatings, setServiceRatings] = useState<Record<string, number>>({});
  const [staffRatings, setStaffRatings] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [booking, setBooking] = useState<{ id: string; booking_number?: string; provider?: { business_name?: string }; services?: Array<Record<string, unknown>> } | null>(null);

  useEffect(() => {
    loadBooking();
  }, [bookingId]); // eslint-disable-line react-hooks/exhaustive-deps -- load on mount when bookingId changes

  const loadBooking = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: { id: string; booking_number?: string; provider?: { business_name?: string }; services?: Array<Record<string, unknown>> } }>(`/api/me/bookings/${bookingId}`, { cache: "no-store" });
      const row = (response.data as unknown as { booking?: { id: string; booking_number?: string; provider?: { business_name?: string }; services?: Array<Record<string, unknown>> } })?.booking ?? response.data;
      setBooking(row);
      const mappedServices = (row.services ?? [])
        .map((svc) => ({
          offering_id: String(svc.offering_id ?? ""),
          offering_name: String(svc.offering_name ?? svc.service_name ?? "Service"),
          staff_id: svc.staff_id ? String(svc.staff_id) : null,
          staff_name: svc.staff_name ? String(svc.staff_name) : null,
        }))
        .filter((s) => s.offering_id.length > 0);
      setServices(mappedServices);
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

    // §Customer-launch (audit 2026-04): previously a "coming soon" toast.
    // Wire the existing /api/upload route (already supports customer
    // uploads up to 5MB) to persist review photos to Supabase storage
    // and stash the returned public URLs for submit.
    const MAX_BYTES = 5 * 1024 * 1024;
    const MAX_PHOTOS = 6;
    const remaining = Math.max(0, MAX_PHOTOS - photos.length);
    if (remaining === 0) {
      toast.error(`You can upload up to ${MAX_PHOTOS} photos.`);
      e.target.value = "";
      return;
    }

    const accepted = Array.from(files).slice(0, remaining).filter((f) => {
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name} is larger than 5MB and was skipped.`);
        return false;
      }
      return true;
    });

    if (accepted.length === 0) {
      e.target.value = "";
      return;
    }

    setPhotoUploading(true);
    const uploadedUrls: string[] = [];
    for (const file of accepted) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", "review-photos");
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        if (!res.ok) throw new Error(`upload failed: ${res.status}`);
        const payload = (await res.json()) as { data?: { url?: string } };
        const url = payload?.data?.url;
        if (url) uploadedUrls.push(url);
      } catch (err) {
        console.error("Review photo upload failed", err);
        toast.error(`Could not upload ${file.name}.`);
      }
    }
    if (uploadedUrls.length > 0) {
      setPhotos((prev) => [...prev, ...uploadedUrls]);
      toast.success(`Added ${uploadedUrls.length} photo${uploadedUrls.length === 1 ? "" : "s"}`);
    }
    setPhotoUploading(false);
    e.target.value = "";
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }

    const uniqueStaff = Array.from(
      new Map(
        services
          .filter((s) => !!s.staff_id)
          .map((s) => [s.staff_id as string, s.staff_name || "Staff"])
      ).entries()
    ).map(([id, name]) => ({ id, name }));
    const normalizedServiceRatings = services.map((svc) => ({
      offering_id: svc.offering_id,
      rating: serviceRatings[svc.offering_id] ?? rating,
    }));
    const selectedStaff = uniqueStaff.find((s) => typeof staffRatings[s.id] === "number");
    const normalizedStaffRating =
      uniqueStaff.length === 0
        ? undefined
        : selectedStaff
          ? { staff_id: selectedStaff.id, rating: staffRatings[selectedStaff.id] ?? rating }
          : { staff_id: uniqueStaff[0].id, rating };

    try {
      setIsSubmitting(true);
      await fetcher.post(`/api/bookings/${bookingId}/review`, {
        rating,
        comment: comment.trim() || null,
        photos,
        service_ratings: normalizedServiceRatings,
        staff_rating: normalizedStaffRating,
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

            {services.length > 0 && (
              <div>
                <Label className="text-base font-medium mb-3 block">
                  Rate each service
                </Label>
                <div className="space-y-3">
                  {services.map((svc) => {
                    const selected = serviceRatings[svc.offering_id] ?? rating;
                    return (
                      <div key={svc.offering_id} className="rounded-lg border border-gray-200 p-3">
                        <p className="text-sm font-medium text-gray-800 mb-2">{svc.offering_name}</p>
                        <div className="flex gap-2">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={`${svc.offering_id}-${star}`}
                              type="button"
                              onClick={() => setServiceRatings((prev) => ({ ...prev, [svc.offering_id]: star }))}
                              className="focus:outline-none"
                            >
                              <Star className={`w-6 h-6 ${star <= selected ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {Array.from(
              new Map(
                services
                  .filter((s) => !!s.staff_id)
                  .map((s) => [s.staff_id as string, s.staff_name || "Staff"])
              ).entries()
            ).length > 0 && (
              <div>
                <Label className="text-base font-medium mb-3 block">
                  Rate staff
                </Label>
                <div className="space-y-3">
                  {Array.from(
                    new Map(
                      services
                        .filter((s) => !!s.staff_id)
                        .map((s) => [s.staff_id as string, s.staff_name || "Staff"])
                    ).entries()
                  ).map(([staffId, staffName]) => {
                    const selected = staffRatings[staffId] ?? rating;
                    return (
                      <div key={staffId} className="rounded-lg border border-gray-200 p-3">
                        <p className="text-sm font-medium text-gray-800 mb-2">{staffName}</p>
                        <div className="flex gap-2">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={`${staffId}-${star}`}
                              type="button"
                              onClick={() => setStaffRatings({ [staffId]: star })}
                              className="focus:outline-none"
                            >
                              <Star className={`w-6 h-6 ${star <= selected ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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
                  <Button variant="outline" type="button" asChild disabled={photoUploading}>
                    <span>{photoUploading ? "Uploading..." : "Choose Photos"}</span>
                  </Button>
                </label>
              </div>
              {photos.length > 0 && (
                <div className="mt-4 flex gap-2">
                  {photos.map((photo, index) => (
                    <div key={index} className="relative">
                      <Image
                        src={photo}
                        alt={`Review photo ${index + 1}`}
                        width={80}
                        height={80}
                        className="w-20 h-20 object-cover rounded"
                        unoptimized
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
