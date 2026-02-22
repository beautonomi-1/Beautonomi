"use client";
import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import Image1 from "./../../../../public/images/10-Kevin-Hart-Experience-Icons-Airbnb-Credit-Bethany-Mollenkof.jpg";
import Image2 from "./../../../../public/images/01-Inside-Out-2-Icons-Airbnb-Credit-Ryan-Lowry.webp";
import Image3 from "./../../../../public/images/10-Orsay-2-Icons-Airbnb-Credit-Wendy-Huynh.webp";
import Image4 from "./../../../../public/images/FEATURED-IMAGE-Incredibles-Icons-Airbnb-Credit-Spencer-Lowell.webp";
import Image5 from "./../../../../public/images/01-Shrek-Airbnb-Exterior-Credit-Alix-McIntosh-1.webp";
import Image6 from "./../../../../public/images/01-Kens-DreamHouse-Airbnb-Exterior-Credit-Hogwash-Studios-2.webp";
import Image7 from "./../../../../public/images/01-Ted-Lasso-Airbnb-Exterior-Credit-Henry-Woide-1-1.webp";
import Image8 from "./../../../../public/images/01-Houseplant-Airbnb-Seth-Rogen-Portrait-Credit-Yuri-Hasegawa-and-Hogwash-Studios.webp";
import Image9 from "./../../../../public/images/Exterior_Hero-NewsroomThumbnail.webp";

export default function SliderCard() {
  const [currentIndex, setCurrentIndex] = useState(0);

  const slides = [
    {
      image: Image1,
      title:
        "Step behind the velvet rope into Kevin Hart's Coramino Live Lounge",
      date: "July 23, 2024",
      link: "#",
    },
    {
      image: Image2,
      title: "Make core memories with Inside Out 2",
      date: "June 12, 2024",
      link: "#",
    },
    {
      image: Image3,
      title: "Open the Olympic Games at Musée d’Orsay",
      date: "June 5, 2024",
      link: "#",
    },
    {
      image: Image4,
      title: "Design your Incredibles Supersuit",
      date: "May 16, 2024",
      link: "#",
    },
    {
      image: Image5,
      title: "Shrek’s Swamp",
      date: "September 26, 2023",
      link: "#",
    },
    {
      image: Image6,
      title: "Barbie’s Malibu DreamHouse, Ken’s Way",
      date: "January 26, 2023",
      link: "#",
    },
    {
      image: Image7,
      title: "Ted Lasso’s Favorite Pub",
      date: "March 7, 2023",
      link: "#",
    },
    {
      image: Image8,
      title: "Houseplant Retreat",
      date: "January 31, 2023",
      link: "#",
    },
    {
      image: Image9,
      title: "The Last Blockbuster",
      date: "August 11, 2020",
      link: "#",
    },
  ];

  const slidesToShow = 3;

  // Duplicate slides to create a seamless loop
  const duplicatedSlides = [
    ...slides.slice(-slidesToShow),
    ...slides,
    ...slides.slice(0, slidesToShow),
  ];

  const slideWidthPercentage = 25 / slidesToShow;

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
    <div className="bg-primary pt-10 md:pt-20 mb-10 md:mb-[74px]">
      <div className="max-w-[1380px] mx-auto px-4 pb-2 md:pb-20 relative">
        <div className="flex flex-col md:flex-row items-center  mb-14">
          <div>
            <h2 className="text-[26px] lg:text-[40px] mb-3 font-normal Aribnb-medium text-secondary ">
              Introducing Icons
            </h2>
            <p className="text-sm md:text-xl font-light  text-secondary max-w-2xl">
              {" "}
              Explore the extraordinary experiences hosted by the greatest names
              in music, film, television, art, sports, and more.{" "}
            </p>
          </div>
          <div className="flex gap-6 px-4 absolute top-32 md:top-0 right-0 md:right-40">
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
              width: `${(90 * duplicatedSlides.length) / slidesToShow}%`,
            }}
          >
            {duplicatedSlides.map((slide, index) => (
              <div
                key={index}
                className="flex-shrink-0 w-[455px] h-[435px]  mb-2 md:mb-20"
              >
                <div className="">
                  <Image
                    src={slide.image}
                    alt="Carousel Image"
                    layout="responsive"
                    className="w-[455px] h-[435px] rounded-t-xl object-cover"
                  />
                </div>
                <div className="bg-white border rounded-b-xl p-4 h-24 md:h-44">
                  <a href={slide.link}>
                    <h3 className="text-lg md:text-[22px] text-secondary font-normal  mb-2 hover:underline">
                      {slide.title}
                    </h3>
                  </a>
                  <p className="text-sm font-normal  text-destructive">
                    {slide.date}
                  </p>
                </div>
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
