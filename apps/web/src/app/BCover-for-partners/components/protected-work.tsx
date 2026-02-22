"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Carousel } from "@/components/ui/carousel";
import WestMidtown from "./../../../../public/images/e50cc1d9-838e-4b02-8502-26e2f1dead01.webp";
import Apartments from "./../../../../public/images/fafcb3f7-210c-4938-abf8-32040beaddf4.webp";
import Olive from "./../../../../public/images/22a95043-1c61-4311-b24d-c2e6b47bb47c.webp";
import Sentral from "./../../../../public/images/39086809-fd16-4c95-8df2-07c8011c1f36.webp";

export default function TheCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const slides = [
    { image: WestMidtown, text: "Cars and other automobiles are protected " },
    { image: Olive, text: "Paintings and other artwork are protected " },
    { image: Sentral, text: "Antiques and other valuables are protected" },
    { image: Apartments, text: "Boats and other vehicles are protected" },
  ];

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isPlaying) {
      intervalId = setInterval(() => {
        setCurrentIndex((prevIndex) =>
          prevIndex < slides.length - 1 ? prevIndex + 1 : 0
        );
      }, 8000); // Change slide every 8 seconds
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isPlaying, slides.length]);

  const handlePrev = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex > 0 ? prevIndex - 1 : slides.length - 1
    );
  };

  const handleNext = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex < slides.length - 1 ? prevIndex + 1 : 0
    );
  };

  const handlePausePlay = () => {
    setIsPlaying((prev) => !prev);
  };

  return (
    <div className="container">
      <div className="mb-10 sm:mb-36">
        <div className=" p-4 text-[28px] sm:text-[32px] lg:text-[42px] font-normal  text-left sm:text-center">
          {slides[currentIndex].text}
        </div>
        <Carousel className="w-full h-full rounded-[32px] mb-5 overflow-hidden">
          <div className=" w-full h-full">
            <Image
              src={slides[currentIndex].image}
              alt="Carousel Image"
              layout="responsive"
              className="w-full h-full"
            />
          </div>
        </Carousel>
        <div className="flex gap-6 mt-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePrev}
            className="border h-7 w-7 rounded-full border-[#e4e4e4] bg-white"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePausePlay}
            className="border h-7 w-7 rounded-full border-[#e4e4e4] bg-white"
          >
            {isPlaying ? (
              <PauseIcon className="h-5 w-5" />
            ) : (
              <PlayIcon className="h-5 w-5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNext}
            className="border h-7 w-7 rounded-full border-[#e4e4e4] bg-white"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

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

function PauseIcon(props: any) {
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
      <rect x="14" y="4" width="4" height="16" rx="1" />
      <rect x="6" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function PlayIcon(props: any) {
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
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}
