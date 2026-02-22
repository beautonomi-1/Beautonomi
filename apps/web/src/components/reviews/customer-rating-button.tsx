"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import RateCustomerModal from "./rate-customer-modal";
import { fetcher } from "@/lib/http/fetcher";
import { Star } from "lucide-react";
import type { Review } from "@/types/beautonomi";

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
  const [existingRating, setExistingRating] = useState<Review | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Only load rating if booking is completed
    if (bookingStatus === "completed") {
      loadExistingRating();
    } else {
      setIsLoading(false);
    }
  }, [bookingId, bookingStatus]);

  const loadExistingRating = async () => {
    try {
      const response = await fetcher.get<{ data: Review }>(
        `/api/me/reviews?booking_id=${bookingId}`
      );
      if (response.data && response.data.customer_rating) {
        setExistingRating(response.data);
      }
    } catch {
      // Review might not exist yet, that's okay
      console.log("No existing rating found");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRatingSuccess = () => {
    loadExistingRating();
    onRatingSubmitted?.();
  };

  // Don't show button if booking is not completed
  if (bookingStatus !== "completed") {
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
  if (existingRating?.customer_rating) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-gray-50">
        <div className="flex items-center gap-1">
          <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
          <span className="text-sm font-medium">
            {existingRating.customer_rating}/5
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
        onSuccess={handleRatingSuccess}
      />
    </>
  );
}
