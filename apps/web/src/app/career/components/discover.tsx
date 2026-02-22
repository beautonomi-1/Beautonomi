"use client";
import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Carousel } from "@/components/ui/carousel";
import Image1 from "./../../../../public/images/homepage-hero1b.webp";
import Image2 from "./../../../../public/images/homepage-hero2b.webp";
import Image3 from "./../../../../public/images/homepage-hero3b.webp";
import Image4 from "./../../../../public/images/homepage-hero4c.webp";

export default function TheCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);

  const slides = [
    { image: Image1 },
    { image: Image2 },
    { image: Image3 },
    { image: Image4 },
  ];

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

  return (
    <div className="my-24">
      <div className="container ">
        <h2 className="text-medium font-normal text-[72px] text-secondary text-center mb-14 lg:mb-8 max-w-96 sm:max-w-xl lg:max-w-full mx-auto leading-[80px]">
          Discover your place at Beautonomi
        </h2>
        <Button variant="default" className=" mx-auto flex mb-16 lg:mb-32">
          Explore open roles
        </Button>
        <div className="flex gap-4 justify-end mb-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePrev}
            className="border h-7 w-7 rounded-full border-[#707070] bg-white"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNext}
            className="border h-7 w-7 rounded-full border-[#707070] bg-white"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </Button>
        </div>
        <Carousel className="w-full h-full rounded-xl mb-5 overflow-hidden">
          <Image
            src={slides[currentIndex].image}
            alt="Carousel Image"
            layout="responsive"
            className="w-full h-full"
          />
        </Carousel>
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

