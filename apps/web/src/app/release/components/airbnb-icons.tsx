"use client";
import React, { useState } from "react";
import Image from "next/image";
import Image1 from "./../../../../public/images/fde4d23a-13ad-4fb2-bea2-b5e7983ba525.webp";
import Image2 from "./../../../../public/images/918181af-9a65-4cf5-b86a-e8edb2369406.webp";
import Image3 from "./../../../../public/images/35c1100e-4009-4e0a-b1d0-d91145cb9dd7.webp";
import Image4 from "./../../../../public/images/768a7e19-af06-4735-97bf-1542341ff6e6.webp";
import Image5 from "./../../../../public/images/8771a31f-3e3b-44f2-b86b-fb716267c7d3.webp";
import { Button } from "@/components/ui/button";

const BeautonomiIcons = () => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const images = [
    { src: Image1, text: "Stays in Prince's Purple Rain house" },
    { src: Image2, text: "Crash at the X-Mansion" },
    { src: Image3, text: "Spend the night in the Ferrari museum" },
    { src: Image4, text: "Drift of in the Up house" },
    { src: Image5, text: "Make core memories with Inside Out 2" },
  ];
  const slidesToShow = 3;

  const duplicatedSlides = [
    ...images.slice(-slidesToShow),
    ...images,
    ...images.slice(0, slidesToShow),
  ];

  const slideWidthPercentage = 15 / slidesToShow;

  const handlePrev = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex > 0 ? prevIndex - 1 : images.length
    );
  };

  const handleNext = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex < duplicatedSlides.length - slidesToShow ? prevIndex + 1 : 0
    );
  };

  return (
    <div className="container ">
      <div className="mb-28">
        <h2 className="text-[68px] font-bold Beautonomi-bold text-center max-w-3xl mx-auto leading-[60px] mb-[70px]">
          The world’s greatest icons are on Beautonomi
        </h2>
        <div className="relative mb-12">
          <div className="flex gap-6 overflow-hidden">
            <div
              className="flex gap-6 transition-transform duration-500 ease-in-out"
              style={{
                transform: `translateX(-${
                  currentIndex * slideWidthPercentage
                }%)`,
                width: `${(100 * duplicatedSlides.length) / slidesToShow}%`,
              }}
            >
              {duplicatedSlides.map((image, index) => (
                <div key={index} className="relative flex-shrink-0 w-[307px]">
                  <Image
                    src={image.src}
                    alt={`Image ${index + 1}`}
                    className="h-[407px] w-[307px] rounded-3xl object-cover"
                  />
                  <div className="absolute bottom-0">
                    <p className="text-white text-xl font-bold p-4 max-w-64">
                      {image.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handlePrev}
            className="absolute top-1/2 left-0 transform -translate-y-1/2 bg-white border h-8 w-8 rounded-full flex items-center justify-center"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <button
            onClick={handleNext}
            className="absolute top-1/2 right-0 transform -translate-y-1/2 bg-white border h-8 w-8 rounded-full flex items-center justify-center"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="text-center">
          <Button size="rounded">Browse Iocns</Button>
        </div>
      </div>
    </div>
  );
};

function ChevronLeftIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export default BeautonomiIcons;
