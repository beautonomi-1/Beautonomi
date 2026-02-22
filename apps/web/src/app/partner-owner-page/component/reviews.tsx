"use client";
import React, { useState } from "react";
import Image from "next/image";
import CloseIcon from "./../../../../public/images/close-icon.svg";
// Note: Image placeholder - original image was missing
const Place = "/images/geef.png";
import { Button } from "@/components/ui/button";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

const reviewsData = [
  {
    id: 1,
    campName: "Mohammed Mutlak Camp",
    reviewerName: "customer",
    date: "12 August",
    reviewText:
      "…Spending night in Wadi Rum dessert was incredible experience! We came here for one night and we extended for one more because we didn't get enough of this camp. Starting with delicious breakfast made with fresh",
    placeImage: Place,
    reviewerImage: Place,
  },
  {
    id: 2,
    campName: "Mohammed Mutlak Camp",
    reviewerName: "customer",
    date: "12 August",
    reviewText: "“…Top i recommend…",
    placeImage: Place,
    reviewerImage: Place,
  },
  {
    id: 3,
    campName: "Mohammed Mutlak Camp",
    reviewerName: "customer",
    date: "12 August",
    reviewText:
      "…Spending night in Wadi Rum dessert was incredible experience! We came here for one night and we extended for one more because we didn't get enough of this camp. Starting with delicious breakfast made with fresh",
    placeImage: Place,
    reviewerImage: Place,
  },
  {
    id: 4,
    campName: "Mohammed Mutlak Camp",
    reviewerName: "customer",
    date: "12 August",
    reviewText:
      "…Spending night in Wadi Rum dessert was incredible experience! We came here for one night and we extended for one more because we didn't get enough of this camp. Starting with delicious breakfast made with fresh",
    placeImage: Place,
    reviewerImage: Place,
  },
  {
    id: 5,
    campName: "Mohammed Mutlak Camp",
    reviewerName: "customer",
    date: "12 August",
    reviewText:
      "…Spending night in Wadi Rum dessert was incredible experience! We came here for one night and we extended for one more because we didn't get enough of this camp. Starting with delicious breakfast made with fresh",
    placeImage: Place,
    reviewerImage: Place,
  },
  {
    id: 6,
    campName: "Mohammed Mutlak Camp",
    reviewerName: "customer",
    date: "12 August",
    reviewText:
      "…Spending night in Wadi Rum dessert was incredible experience! We came here for one night and we extended for one more because we didn't get enough of this camp. Starting with delicious breakfast made with fresh",
    placeImage: Place,
    reviewerImage: Place,
  },
  {
    id: 7,
    campName: "Mohammed Mutlak Camp",
    reviewerName: "customer",
    date: "11 August",
    reviewText:
      "…Spending night in Wadi Rum dessert was incredible experience! We came here for one night and we extended for one more because we didn't get enough of this camp. Starting with delicious breakfast made with fresh",
    placeImage: Place,
    reviewerImage: Place,
  },
];

const slidesToShow = 1;
const duplicatedReviews = [
  ...reviewsData.slice(-slidesToShow),
  ...reviewsData,
  ...reviewsData.slice(0, slidesToShow),
];

const Reviews = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [visibleReviews, setVisibleReviews] = useState(3);

  const handlePrev = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex > 0 ? prevIndex - 1 : duplicatedReviews.length - slidesToShow
    );
  };

  const handleNext = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex < duplicatedReviews.length - slidesToShow ? prevIndex + 1 : 0
    );
  };

  const handleClosePopup = () => {
    setIsPopupOpen(false);
  };

  const showMoreReviews = () => {
    setVisibleReviews((prevVisible) => prevVisible + 3); // Show more reviews in increments of 3
  };

  return (
    <div className="">
      {/* Review Slider */}
      <div className="relative">
        <div className="flex justify-between items-center">
          <h2 className="text-[22px] w-full font-normal  text-secondary mb-8">
            Provider Reviews
          </h2>
          <div className="flex gap-4  ">
            <button
              onClick={handlePrev}
              className="ml-2 bg-white border h-8 w-8 rounded-full flex items-center justify-center"
            >
              <ChevronLeftIcon className="h-5 w-5 text-gray-500" />
            </button>
            <button
              onClick={handleNext}
              className="mr-2 bg-white border h-8 w-8 rounded-full flex items-center justify-center"
            >
              <ChevronRightIcon className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 overflow-hidden">
          {duplicatedReviews
            .slice(currentIndex, currentIndex + slidesToShow *2 )
            .map((review) => (
              <div
                key={review.id}
                className="border p-5 rounded-xl flex-none w-full cursor-pointer"
              >
                <p className="text-base font-light text-secondary mb-4">
                  {review.reviewText}
                </p>
                <div className="flex gap-4 items-center">
                  <Image
                    src={review.reviewerImage}
                    alt={review.reviewerName}
                    className="rounded-full h-12 w-12"
                  />
                  <div>
                    <h2 className="text-base font-light text-secondary">
                      {review.reviewerName}
                    </h2>
                    <p className="text-sm font-light text-destructive">
                      {review.date}
                    </p>
                  </div>
                </div>
              </div>
            ))}
        </div>
        <p
          className="cursor-pointer underline text-base font-light  text-secondary"
          onClick={() => setIsPopupOpen(true)}
        >
          Show all {reviewsData.length} reviews
        </p>
      </div>

      {isPopupOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center">
          <div className="bg-white max-w-xl p-7 mx-auto rounded-xl relative">
            <div className="cursor-pointer mb-10" onClick={handleClosePopup}>
              <Image src={CloseIcon} alt="Close" className="h-6 w-6" />
            </div>
            <div className="max-h-[75vh] overflow-y-auto pr-4">
              {" "}
              <p className="text-xl font-light text-secondary mb-8">
                {reviewsData.length} reviews
              </p>
              <div className="border-b border-destructive mb-7">
                <Button variant="underline" size="border">
                  From Clients ({reviewsData.length})
                </Button>
              </div>
              {reviewsData.slice(0, visibleReviews).map((review) => (
                <div
                  key={review.id}
                  className="border-b pb-6 mb-6 border-destructive"
                >
                  <div className="flex justify-between items-start mb-7">
                    <h2 className="text-lg font-light text-secondary">
                      {review.campName}
                    </h2>
                    <Image
                      src={review.placeImage}
                      alt={review.campName}
                      className="h-12 w-20 rounded-xl"
                    />
                  </div>
                  <div className="flex gap-4 items-center mb-4">
                    <Image
                      src={review.reviewerImage}
                      alt={review.reviewerName}
                      className="rounded-full h-12 w-12"
                    />
                    <div>
                      <h2 className="text-base font-light text-secondary">
                        {review.reviewerName}
                      </h2>
                      <p className="text-sm font-light text-destructive">
                        {review.date}
                      </p>
                    </div>
                  </div>
                  <p className="text-base font-light text-secondary">
                    {review.reviewText}
                  </p>
                </div>
              ))}
              {visibleReviews < reviewsData.length && (
                <Button variant="destructive" onClick={showMoreReviews}>
                  Show more reviews
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reviews;
