"use client";
import React, { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { FaStar } from "react-icons/fa";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Heart, Share2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import ShareModal from "./share-modal";
import LoginModal from "../../../components/global/login-modal";
import Link from "next/link";

export default function CarouselCard({
  slides,
  content,
  imageHeight = "270px",
}: any) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const handleSlideChange = (index: any) => {
    setCurrentIndex(index);
  };

  const handleShareClick = () => {
    setIsShareModalOpen(true);
  };

  const handleHeartClick = () => {
    setIsLoginModalOpen(true);
  };

  // Safe access to content properties
  const guestfav = content?.guestfav === "true";
  const housecall = content?.housecall === "true";
  const atsalon = content?.atsalon === "true";
  const ratingsVisible = content?.ratingsVisible === "true";
  const isActive = content?.isActive === "true";

  const labelTopClass = guestfav ? "top-12" : "top-4";

  return (
    <div
      className="max-w-full w-full bg-white border-none shadow-none relative"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <Carousel
        className="w-full mb-3"
        //@ts-ignore
        index={currentIndex}
        onSelect={handleSlideChange}
      >
        <CarouselContent className="-ml-1">
          {slides?.map((slide: any, index: number) => (
            <CarouselItem key={index} className="pl-1">
              <div
                className={`relative w-full overflow-hidden`}
                style={{ height: imageHeight }}
              >
                <Link href={"/partner-profile"}>
                  <Image
                    src={slide.src}
                    alt={slide.alt}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    className="rounded-xl max-w-full w-full object-cover"
                  />
                </Link>
                <div className="absolute top-4 right-4 flex gap-2">
                  <Button
                    size="icon"
                    className="rounded-full bg-[#F3EBE6] hover:bg-white text-black w-8 h-8"
                    onClick={handleHeartClick}
                  >
                    <Heart className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    className="rounded-full bg-[#F3EBE6] hover:bg-white text-black w-8 h-8"
                    onClick={handleShareClick}
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                </div>
                {guestfav && (
                  <Label className="absolute top-4 left-4 rounded-full bg-white hover:bg-white text-black text-xs font-normal shadow px-2.5 py-1.5">
                    Top Rated
                  </Label>
                )}
                {housecall && (
                  <Label
                    className={`absolute ${labelTopClass} left-4 rounded-full bg-white hover:bg-white text-black text-xs font-normal shadow px-2.5 py-1.5`}
                  >
                    House Call
                  </Label>
                )}
                {atsalon && (
                  <Label
                    className={`absolute ${labelTopClass} left-4 rounded-full bg-white hover:bg-white text-black text-xs font-normal shadow px-2.5 py-1.5`}
                  >
                    At Salon
                  </Label>
                )}
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <div
          className={`transition-opacity duration-300 ${
            isHovering ? "opacity-100" : "opacity-0"
          }`}
        >
          <CarouselPrevious className="absolute left-2 top-1/2 -translate-y-1/2" />
          <CarouselNext className="absolute right-2 top-1/2 -translate-y-1/2" />
        </div>
        <div className="flex justify-center absolute bottom-3 left-0 right-0">
          {
            //@ts-ignore
            slides?.map((_, index) => (
              <div
                key={index}
                className={`h-2 w-2 rounded-full mx-1 cursor-pointer transition-colors duration-300 ${
                  index === currentIndex ? "bg-white" : "bg-gray-300"
                }`}
                onClick={() => handleSlideChange(index)}
              />
            ))
          }
        </div>
      </Carousel>
      <Link href={"/partner-profile"}>
        <div className="text-sm">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-1.5">
              <div
                className={`w-2 h-2 rounded-full mb-2.5 ${
                  isActive ? "bg-green-500" : "bg-yellow-500"
                }`}
              ></div>
              <h2 className="font-normal mb-1">{content?.title}</h2>
            </div>
            {ratingsVisible && (
              <div className="flex items-center gap-2">
                <FaStar color="#e8c503" size={16} />
                <p>{content?.ratings}</p>
              </div>
            )}
          </div>
          <p className="font-light text-gray-600 mb-0 text-xs">
            {content?.subtitle}
          </p>
          <p className="font-light text-black mb-2">{content?.dates}</p>
        </div>
      </Link>
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        experienceTitle={content?.title}
        experienceImage={slides[0]?.src}
        shareUrl={content?.link ? `${typeof window !== "undefined" ? window.location.origin : ""}${content.link}` : undefined}
      />

      <LoginModal open={isLoginModalOpen} setOpen={setIsLoginModalOpen} />
    </div>
  );
}
