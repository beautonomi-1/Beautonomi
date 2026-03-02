"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import House from "./../../../../public/images/Riverfront-Getaway-with-a-View-.webp";
import Working from './../../../../public/images/PJM0223-18Q1_Superhost_Chicago_1000.jpg';
import Games from "./../../../../public/images/Copy-of-Sophie_216212958_London_147.webp";
import DollHouse from './../../../../public/images/polly-pocket-featured.jpg';
import Image1 from './../../../../public/images/kevin-hart-featured.jpg';
import Image3 from './../../../../public/images/Bettys-bed.jpg';
import Image4 from './../../../../public/images/BeloRauschNewsroomFeatured_200316.png';
import Image5 from './../../../../public/images/Newsroom_TrustSafety_004.jpg';
import Image6 from './../../../../public/images/Newsroom_TrustSafety_008.jpg';

export default function SliderCard() {
  const [currentIndex, setCurrentIndex] = useState(0);

  const slides = [
    {
      image: House,
      title: "Beautonomi supports arts and culture in our communities",
      date: "August 15, 2024",
      link: "/seattle-arts",
    },
    {
      image: Working,
      title: "Partnering with local businesses to grow beauty and wellness",
      date: "August 13, 2024",
      link: "/partners",
    },
    {
      image: Games,
      title: "New features for providers: smarter booking and payouts",
      date: "August 8, 2024",
      link: "/provider-features",
    },
    {
      image: DollHouse,
      title: "How we're making beauty services more accessible",
      date: "August 7, 2024",
      link: "/accessibility",
    },
    {
      image: Image1,
      title: "Beautonomi Coverage: protection for providers and peace of mind for customers",
      date: "July 23, 2024",
      link: "/coverage",
    },
    {
      image: Image3,
      title: "Trust and safety updates for our community",
      date: "July 24, 2024",
      link: "/trust-safety",
    },
    {
      image: Image4,
      title: "Beautonomi supports arts and culture in Seattle",
      date: "July 23, 2024",
      link: "/seattle-arts",
    },
    {
      image: Image5,
      title: "Joining forces with industry partners to combat payment fraud",
      date: "August 5, 2024",
      link: "/fraud-prevention",
    },
    {
      image: Image6,
      title: "Summer support for providers and customers",
      date: "July 24, 2024",
      link: "/summer-support",
    },
  ];

  const slidesToShow = 3;

  // Duplicate slides to create a seamless loop
  const duplicatedSlides = [
    ...slides.slice(-slidesToShow),
    ...slides,
    ...slides.slice(0, slidesToShow),
  ];

  const slideWidthPercentage = 40 / slidesToShow;

  const handlePrev = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex > 0 ? prevIndex - 1 : slides.length
    );
  };

  const handleNext = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex < duplicatedSlides.length - slidesToShow ? prevIndex + 1 : 0
    );
  };

  return (
    <div className="container">
      <div className="pb-20">
        <div className="flex text-center items-center justify-center mb-14">
          <h2 className="text-5xl font-normal Aribnb-medium text-secondary text-center ">
            Ongoing at Beautonomi
          </h2>
          <div className="flex gap-6 px-4 absolute right-0 lg:right-40">
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
              onClick={handleNext}
              className="border h-7 w-7 rounded-full border-[#e4e4e4] bg-white"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <div className="overflow-hidden">
          <div
            className="flex gap-4 transition-transform duration-500 ease-in-out"
            style={{
              transform: `translateX(-${currentIndex * slideWidthPercentage}%)`,
              width: `${70 * duplicatedSlides.length / slidesToShow}%`,
            }}
          >
            {duplicatedSlides.map((slide, index) => (
              <div
                key={index}
                className="flex-shrink-0 w-[600px] h-[432px] rounded-xl mb-20"
              >
                <Link href={slide.link}>
                  <div>
                    <Image
                      src={slide.image}
                      alt="Carousel Image"
                      layout="responsive"
                      className="w-full h-full rounded-2xl object-cover"
                    />
                    <div className="py-4">
                      <h3 className="text-[26px] text-secondary font-normal  hover:underline">
                        {slide.title}
                      </h3>
                      <p className="text-sm font-normal  text-destructive">
                        {slide.date}
                      </p>
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
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
