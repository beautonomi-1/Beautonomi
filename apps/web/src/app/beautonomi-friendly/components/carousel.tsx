"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Carousel } from "@/components/ui/carousel";
import WestMidtown from "./../../../../public/images/bee67cf3-ec5f-4585-a3ec-d12d84187206.jpg";
import Apartments from "./../../../../public/images/c9d2943f-5615-455d-b80d-67b8e615f307.jpg";
import Olive from "./../../../../public/images/5a69d072-2e18-4494-a688-caa005224aad.jpg";
import Sentral from "./../../../../public/images/a78b22a2-e081-4fa4-a7f2-e756d9699801.jpg";
import OldTown from "./../../../../public/images/7b03a67c-eab4-429c-8764-e691f9ef3ad9.jpg";
import Park from "./../../../../public/images/edd9fec5-dbea-45dd-8a79-37e3f1c2a9e2.jpg";

export default function TheCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const slides = [
    {
      image: WestMidtown,
      title:
        "We’ve partnered with Beautonomi-friendly apartment buildings across the US to make it easier to Beautonomi your place.",
      subtitle: {
        title: "West Midtown at Star Metals",
        location: "Atlanta, Georgia",
      },
    },
    {
      image: Olive,
      title:
        "We’ve partnered with Beautonomi-friendly apartment buildings across the US to make it easier to Beautonomi your place.",
      subtitle: {
        title: "525 Olive Apartments",
        location: "San Diego, California",
      },
    },
    {
      image: Sentral,
      title:
        "We’ve partnered with Beautonomi-friendly apartment buildings across the US to make it easier to Beautonomi your place.",
      subtitle: {
        title: "Sentral Apartments",
        location: "Denver, Colorado",
      },
    },
    {
      image: Apartments,
      title:
        "We’ve partnered with Beautonomi-friendly apartment buildings across the US to make it easier to Beautonomi your place.",
      subtitle: {
        title: "Park 12 Apartments",
        location: "San Diego, California",
      },
    },
    {
      image: OldTown,
      title:
        "We’ve partnered with Beautonomi-friendly apartment buildings across the US to make it easier to Beautonomi your place.",
      subtitle: {
        title: "Old Town Apartments",
        location: "Scottsdale, Arizona",
      },
    },
    {
      image: Park,
      title:
        "We’ve partnered with Beautonomi-friendly apartment buildings across the US to make it easier to Beautonomi your place.",
      subtitle: {
        title: "Park 12 Apartments",
        location: "San Diego, California",
      },
    },
  ];

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    if (isPlaying) {
      intervalId = setInterval(() => {
        setCurrentIndex((prevIndex) =>
          prevIndex < slides.length - 1 ? prevIndex + 1 : 0
        );
      }, 2000); // Change slide every second
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
      <div className="flex justify-center items-center mb-20 md:mb-[140px]">
        <Carousel className="w-full h-full rounded-[32px] shadow-lg overflow-hidden">
          <div className="flex flex-col-reverse md:flex-row">
            <div className="w-full md:w-1/2 h-full">
              <Image
                src={slides[currentIndex].image}
                alt="Carousel Image"
                layout="responsive"
                className="h-full"
              />
            </div>
            <div className="w-full md:w-1/2 bg-primary px-10 pt-8 lg:pt-10 pb-4 flex flex-col justify-between">
              <div>
                <h2 className="text-[22px] lg:text-[40px] font-normal  leading-0 lg:leading-[50px] mb-6">
                  {slides[currentIndex].title}
                </h2>
              </div>
              <div>
                <p className="text-base lg:text-2xl  font-normal">
                  {slides[currentIndex].subtitle.title}
                </p>
                <p className="font-normal text-base lg:text-2xl  mb-4">
                  {slides[currentIndex].subtitle.location}
                </p>
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handlePrev}
                    className="border h-7 w-7 rounded-full border-black bg-white"
                  >
                    <ChevronLeftIcon className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handlePausePlay}
                    className="border h-7 w-7 rounded-full border-black bg-white"
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
                    className="border h-7 w-7 rounded-full border-black bg-white"
                  >
                    <ChevronRightIcon className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Carousel>
      </div>
    </div>
  );
}

function ChevronLeftIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w.org/2000/svg"
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
      xmlns="http://www.w.org/2000/svg"
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
