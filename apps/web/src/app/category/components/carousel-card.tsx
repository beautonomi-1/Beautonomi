"use client";
import React, { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Star, Heart, Share2 } from "lucide-react";
import { StaticImport } from "next/dist/shared/lib/get-img-props";
import { Label } from "@/components/ui/label";

export default function CarouselCard({ slides, content }: any) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovering, setIsHovering] = useState(false);

  const handleSlideChange = (index: number) => {
    setCurrentIndex(index);
  };

  return (
    <div
      className="max-w-full lg:max-w-[315px] bg-white border-none shadow-none relative"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <Carousel
        className="w-full mb-3 "
        index={currentIndex}
        //@ts-ignore
        onSelect={handleSlideChange}
      >
        <CarouselContent className="-ml-1">
          {slides.map(
            (
              slide: { src: string | StaticImport; alt: string },
              index: React.Key | null | undefined
            ) => (
              <CarouselItem key={index} className="pl-1">
                <div className="relative w-full min-w-[315px] h-[300px] overflow-hidden">
                  <Image
                    src={slide.src}
                    alt={slide.alt}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 315px"
                    className="rounded-xl max-w-full lg:max-w-[315px] object-cover"
                  />
                  {content.iconType === "heart" && (
                    <Button
                      size="icon"
                      className="absolute top-4 right-4 rounded-full bg-[#F3EBE6] hover:bg-white text-black w-8 h-8"
                    >
                      <Heart className="h-4 w-4" />
                    </Button>
                  )}
                  {content.iconType === "share" && (
                    <Button
                      size="icon"
                      className="absolute top-4 right-4 rounded-full bg-[#F3EBE6] hover:bg-white text-black w-8 h-8"
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                  )}
                  {content.guestfav === "true" && (
                    <Label className="absolute top-4 left-4 rounded-full bg-white hover:bg-white text-black text-xs font-normal shadow px-2.5 py-1.5">
                      Top Rated
                    </Label>
                  )}
                </div>
              </CarouselItem>
            )
          )}
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
            slides.map((_, index) => (
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
      <div className="text-sm">
        <div className="flex justify-between items-center">
          <h2 className="font-normal mb-1">{content.title}</h2>
          {content.ratingsVisible === "true" && (
            <div className="flex items-center gap-2">
              <Star color="black" size={16} />
              <p>{content.ratings}</p>
            </div>
          )}
        </div>
        <p className="font-light text-gray-600 mb-0">{content.subtitle}</p>
        <p className="font-light text-gray-600 mb-2">{content.dates}</p>
        <p className="font-normal underline cursor-pointer">
          {content.amountstatus}
        </p>
      </div>
    </div>
  );
}
