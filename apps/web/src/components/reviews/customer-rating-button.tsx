"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import RateCustomerModal from "./rate-customer-modal";
import { fetcher } from "@/lib/http/fetcher";
import { Star } from "lucide-react";
interface ProviderClientRatingRow {
  id: string;
  booking_id: string;
  rating: number;
  comment?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface CustomerRatingButtonProps {
  bookingId: string;
  customerId: string;
  customerName: string;
  bookingStatus: string;
  onRatingSubmitted?: () => void;
}

/**
 * Button component for providers to rate customers
 * Shows different states: not rated, already rated, or rating button
 */
export default function CustomerRatingButton({
  bookingId,
  customerId: _customerId,
  customerName,
  bookingStatus,
  onRatingSubmitted,
}: CustomerRatingButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [existingRating, setExistingRating] = useState<ProviderClientRatingRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadExistingRating = useCallback(async () => {
    try {
      const response = await fetcher.get<{
        data?: { has_rating?: boolean; rating?: ProviderClientRatingRow | null };
      }>(`/api/provider/ratings?booking_id=${encodeURIComponent(bookingId)}`);
      const payload = response.data;
      if (payload?.rating && typeof payload.rating.rating === "number") {
        setExistingRating(payload.rating);
      } else {
        setExistingRating(null);
      }
    } catch {
      setExistingRating(null);
    } finally {
      setIsLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    if (bookingStatus === "completed" || bookingStatus === "no_show") {
      loadExistingRating();
    } else {
      setIsLoading(false);
      setExistingRating(null);
    }
  }, [bookingStatus, loadExistingRating]);

  const handleRatingSuccess = () => {
    loadExistingRating();
    onRatingSubmitted?.();
  };

  if (bookingStatus !== "completed" && bookingStatus !== "no_show") {
    return null;
  }

  if (isLoading) {
    return (
      <Button variant="outline" disabled>
        Loading...
      </Button>
    );
  }

  // If already rated, show the rating
  if (existingRating?.rating) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-gray-50">
        <div className="flex items-center gap-1">
          <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
          <span className="text-sm font-medium">
            {existingRating.rating}/5
          </span>
        </div>
        <span className="text-xs text-gray-500">Rated</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsModalOpen(true)}
          className="ml-auto text-xs"
        >
          Edit
        </Button>
      </div>
    );
  }

  // Show rate button
  return (
    <>
      <Button
        variant="outline"
        onClick={() => setIsModalOpen(true)}
        className="flex items-center gap-2"
      >
        <Star className="h-4 w-4" />
        Rate Customer
      </Button>
      <RateCustomerModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        bookingId={bookingId}
        customerName={customerName}
        providerRatingId={existingRating?.id}
        initialRating={existingRating?.rating}
        initialComment={existingRating?.comment ?? ""}
        onSuccess={handleRatingSuccess}
      />
    </>
  );
}
