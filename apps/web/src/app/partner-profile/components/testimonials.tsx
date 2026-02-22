"use client";
import React, { useState, useEffect } from "react";
import Image from "next/image";
import UserImage from "./../../../../public/images/8aa5cbca-b607-4a45-bd0c-2d63a663aa30.webp";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Search from "./../../../../public/images/search-alt-1-svgrepo-com.svg";
import CloseIcon from "./../../../../public/images/close-icon.svg";
import CloseIconWhite from "./../../../../public/images/xmark-solid.svg";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import Ratings from "./ratings";
const testimonials = [
  {
    id: 1,
    name: "Echrak",
    location: "Montreal, Canada",
    date: "April 2024",
    duration: "Stayed one night",
    text: "After a short stay in Abu Dhabi, given all the qualities of the apartment and its Beauty Partner we did not hesitate to return to the apartment to finish our trip with peace of mind.",
    image: UserImage,
  },
  {
    id: 2,
    name: "Echrak",
    location: "Montreal, Canada",
    date: "April 2024",
    duration: "Stayed one night",
    text: "After a short stay in Abu Dhabi, given all the qualities of the apartment and its Beauty Partner we did not hesitate to return to the apartment to finish our trip with peace of mind.",
    image: UserImage,
  },
  {
    id: 3,
    name: "Echrak",
    location: "Montreal, Canada",
    date: "April 2024",
    duration: "Stayed one night",
    text: "After a short stay in Abu Dhabi, given all the qualities of the apartment and its Beauty Partner we did not hesitate to return to the apartment to finish our trip with peace of mind.",
    image: UserImage,
  },
  {
    id: 4,
    name: "Echrak",
    location: "Montreal, Canada",
    date: "April 2024",
    duration: "Stayed one night",
    text: "After a short stay in Abu Dhabi, given all the qualities of the apartment and its Beauty Partner we did not hesitate to return to the apartment to finish our trip with peace of mind.",
    image: UserImage,
  },
];

const Testimonials = () => {
  const [showPopup, setShowPopup] = useState(false);
  const [showReviewInfoPopup, setShowReviewInfoPopup] = useState(false); 
  const [selectedItem, setSelectedItem] = useState("most recent");
  const [displayedTestimonials, setDisplayedTestimonials] = useState(testimonials.length);

  useEffect(() => {
    const handleResize = () => {
      setDisplayedTestimonials(window.innerWidth >= 1024 ? 6 : testimonials.length);
    };

    handleResize(); // Set initial value
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleChange = (value: React.SetStateAction<string>) => {
    setSelectedItem(value);
  };

  const handleShowMoreClick = () => {
    setShowPopup(true);
  };

  const handleClosePopup = () => {
    setShowPopup(false);
  };

  const handleShowReviewInfoClick = () => {
    setShowReviewInfoPopup(true); 
  };

  const handleCloseReviewInfoPopup = () => {
    setShowReviewInfoPopup(false); 
  };

  return (
    <div className="bg-[#fbf7ed] md:bg-white">
    <div className="max-w-[2340px] mx-auto px-10">
      <div className="border-b mb-6 md:mb-10 lg:mb-14 pb-14 lg:pb-12">
        <div className="flex md:grid grid-cols-1 lg:grid-cols-2 w-full overflow-x-scroll gap-5 gap-y-0"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
          {testimonials.slice(0, displayedTestimonials).map((testimonial) => (
            <div key={testimonial.id} className="flex-none mb-7 md:-mb-2 lg:mb-10 max-w-lg w-full bg-white  p-4 rounded-xl">
              <div className="hidden md:flex gap-3 items-center mb-2">
                <Image
                  src={testimonial.image}
                  alt={`${testimonial.name}'s image`}
                  className="h-12 w-12 rounded-full"
                />
                <div>
                  <p className="text-base font-normal  text-secondary">
                    {testimonial.name}
                  </p>
                  <p className="text-sm font-light  text-secondary">
                    {testimonial.location}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-y-0 mb-2 gap-2">
                <p className="text-sm font-light  text-secondary">
                  {testimonial.date}
                </p>
                <p className="text-sm font-light  text-destructive">
                  {testimonial.duration}
                </p>
              </div>
              <div>
                <p className="text-base font-light  text-secondary mb-3">
                  {testimonial.text}
                </p>
              </div>
              <button
                onClick={handleShowMoreClick}
                className="underline text-base font-light  mb-5"
              >
                Show more
              </button>
              <div className="flex md:hidden gap-3 items-center mb-2">
                <Image
                  src={testimonial.image}
                  alt={`${testimonial.name}'s image`}
                  className="h-12 w-12 rounded-full"
                />
                <div>
                  <p className="text-base font-light  text-secondary">
                    {testimonial.name}
                  </p>
                  <p className="text-sm font-light  text-secondary">
                    {testimonial.location}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col md:flex-row gap-6 items-center">
          <Button variant="destructive" className="-mb-3 bg-transparent w-full md:w-auto" onClick={handleShowMoreClick}>
            Show all reviews
          </Button>
          <Button
          variant="underline"
            className="text-xs font-light  text-destructive  cursor-pointer"
            onClick={handleShowReviewInfoClick}
          >
            Learn how reviews work
          </Button>
        </div>
        {testimonials.length > 6 && (
          <div className="flex justify-center mt-8">
            <Button variant="destructive" onClick={handleShowMoreClick}>
              Show all reviews
            </Button>
          </div>
        )}
      </div>
      </div>

      {showPopup && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
          <div className="bg-white p-8 rounded-lg max-w-5xl w-full mx-6">
            <Image
              src={CloseIcon}
              alt=""
              onClick={handleClosePopup}
              className="h-7 w-7 cursor-pointer"
            />
            <div className="max-h-[80vh] overflow-y-auto flex flex-col md:flex-row gap-14 pr-6">
              <div className="">
                <Ratings isMultiColumn={false} />
              </div>
              <div>
                <div className="flex justify-between items-baseline mb-9">
                  <div className="">
                    <h2 className="text-lg font-light text-secondary">
                      {testimonials.length} Reviews
                    </h2>
                    <p
                      className="text-xs font-light  text-destructive underline"
                      onClick={handleShowReviewInfoClick}
                    >
                      Learn how reviews work
                    </p>
                  </div>
                  <Select value={selectedItem} onValueChange={handleChange}>
                    <SelectTrigger className="w-40 rounded-full">
                      {selectedItem.charAt(0).toUpperCase() +
                        selectedItem.slice(1)}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="most recent">Most recent</SelectItem>
                      <SelectItem value="highest rated">
                        Highest rated
                      </SelectItem>
                      <SelectItem value="lowest rated">Lowest rated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center border rounded-full pl-4 mb-9">
                  <Image src={Search} alt="" />
                  <Input placeholder="Search reviews" />
                </div>
                <div className="">
                  {testimonials.map((testimonial) => (
                    <div key={testimonial.id} className="mb-4">
                      <div className="flex gap-3 items-center mb-2">
                        <Image
                          src={testimonial.image}
                          alt={`${testimonial.name}'s image`}
                          className="h-12 w-12 rounded-full"
                        />
                        <div>
                          <p className="text-base font-light  text-secondary">
                            {testimonial.name}
                          </p>
                          <p className="text-sm font-light  text-secondary">
                            {testimonial.location}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-y-0 mb-2 gap-2">
                        <p className="text-sm font-light  text-secondary">
                          {testimonial.date}
                        </p>
                        <p className="text-sm font-light  text-destructive">
                          {testimonial.duration}
                        </p>
                      </div>
                      <div>
                        <p className="text-base font-light  text-secondary">
                          {testimonial.text}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showReviewInfoPopup && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-70">
          <div className="bg-black p-8 rounded-lg max-w-sm w-full text-white">
            <Image
              src={CloseIconWhite}
              alt=""
              onClick={handleCloseReviewInfoPopup}
              className="h-5 w-5 cursor-pointer mb-3"
            />
            <div className="">
              <p className="text-sm font-light  mb-3">
                Reviews from past guests help our community learn more about
                each home. By default, reviews are sorted by recency.
              </p>
              <p className="text-sm font-light  mb-3">
                Only the Clients who booked the reservation can leave a review,
                and Beautonomi only moderates reviews flagged for not following our
                policies.
              </p>
              <p className="text-sm font-light  mb-3">
                To be eligible for a percentile ranking or Clients favorite label,
                listings need 5 or more recent reviews. Criteria is subject to
                change.
              </p>
              <Link href="/">
                <button className="underline text-white">
                  Learn more in our Help Center
                </button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Testimonials;
