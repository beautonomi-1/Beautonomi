"use client";
import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Share2, MapPin, Star } from "lucide-react";
import ShareModal from "@/app/home/components/share-modal";

import Image1 from "./../../../../public/images/pexels-steinportraits-1898555.jpg";
import Image2 from "./../../../../public/images/pexels-rdne-7035446.jpg";
import Image4 from "./../../../../public/images/pexels-alipazani-2878375 - Copy (1).jpg";
import Image5 from "./../../../../public/images/pexels-cottonbro-3998404 (1).jpg";
import Image6 from "./../../../../public/images/pexels-rdne-6724431.jpg";

const images = [
  { src: Image1, alt: "Main Image" },
  { src: Image2, alt: "Image 1" },
  { src: Image6, alt: "Image 2" },
  { src: Image4, alt: "Image 3" },
  { src: Image5, alt: "Image 4" },
];

interface PartnerHeroProps {
  businessName?: string;
  rating?: number;
  voteCount?: number;
  location?: string;
  openingHours?: string;
  isOpen?: boolean;
}

const PartnerHero: React.FC<PartnerHeroProps> = ({
  businessName = "Rose Blvd Beauty Bar SEA POINT",
  rating = 4.9,
  voteCount = 4471,
  location = "Sea Point, Cape Town",
  openingHours = "Open until 6:30 PM",
  isOpen = true,
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);

  const handleShareClick = () => {
    setIsShareModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsShareModalOpen(false);
  };

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  useEffect(() => {
    if (sliderRef.current) {
      sliderRef.current.scrollTo({
        left: currentImageIndex * sliderRef.current.offsetWidth,
        behavior: "smooth",
      });
    }
  }, [currentImageIndex]);

  return (
    <div className="max-w-[2340px] mx-auto">
      {/* Breadcrumb Navigation */}
      <nav className="hidden md:flex px-4 md:px-10 py-4 text-sm">
        <ul className="flex items-center space-x-2 text-gray-500">
          <li>
            <Link href="/" className="hover:text-gray-700">
              Home
            </Link>
          </li>
          <li>•</li>
          <li>
            <Link href="/category/nail-salons" className="hover:text-gray-700">
              Nail Salons
            </Link>
          </li>
          <li>•</li>
          <li>
            <Link href="/location/cape-town" className="hover:text-gray-700">
              Cape Town
            </Link>
          </li>
          <li>•</li>
          <li>
            <Link href="/location/sea-point" className="hover:text-gray-700">
              Sea Point
            </Link>
          </li>
          <li>•</li>
          <li className="text-black font-medium">{businessName}</li>
        </ul>
      </nav>

      {/* Mobile Back Button */}
      <div className="flex md:hidden px-4 py-3 items-center">
        <Link href="/" className="flex items-center text-gray-600">
          <ChevronLeft className="h-5 w-5 mr-1" />
          <span className="text-sm">Go back</span>
        </Link>
      </div>

      {/* Image Gallery */}
      <div className="relative">
        {/* Desktop Gallery */}
        <div className="hidden md:grid grid-cols-2 gap-2 px-4 md:px-10">
          <div className="row-span-2">
            <Link href="/partner-profile/gallery">
              <Image
                src={images[0].src}
                alt={images[0].alt}
                className="h-[500px] w-full rounded-l-xl object-cover cursor-pointer hover:opacity-90 transition-opacity"
              />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {images.slice(1, 5).map((image, index) => (
              <Link key={index} href="/partner-profile/gallery">
                <Image
                  src={image.src}
                  alt={image.alt}
                  className={`h-[245px] w-full object-cover cursor-pointer hover:opacity-90 transition-opacity ${
                    index === 1 ? "rounded-tr-xl" : ""
                  } ${index === 3 ? "rounded-br-xl" : ""}`}
                />
              </Link>
            ))}
          </div>
        </div>

        {/* Mobile Gallery */}
        <div className="relative md:hidden">
          <div
            ref={sliderRef}
            className="flex overflow-x-hidden scroll-smooth"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {images.map((image, index) => (
              <div key={index} className="min-w-full">
                <Image
                  src={image.src}
                  alt={image.alt}
                  className="h-[300px] w-full object-cover"
                />
              </div>
            ))}
          </div>
          <button
            onClick={prevImage}
            className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-2 shadow-lg"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={nextImage}
            className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-2 shadow-lg"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-4 right-4 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
            {currentImageIndex + 1}/{images.length}
          </div>
        </div>
      </div>

      {/* Business Header Info */}
      <div className="px-4 md:px-10 py-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h1 className="text-xl md:text-3xl font-semibold mb-2">{businessName}</h1>
            <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-2">
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4 md:h-5 md:w-5 fill-yellow-400 text-yellow-400" />
                <span className="font-semibold text-sm md:text-base">{rating}</span>
                <span className="text-gray-500 text-xs md:text-sm">
                  ({voteCount.toLocaleString()} votes)
                </span>
              </div>
              <span className="text-gray-400 hidden md:inline">•</span>
              <div className="flex items-center gap-1 text-gray-600">
                {isOpen ? (
                  <>
                    <span className="text-green-600 font-medium text-xs md:text-sm">{openingHours}</span>
                  </>
                ) : (
                  <span className="text-gray-500 text-xs md:text-sm">Closed</span>
                )}
              </div>
              <span className="text-gray-400 hidden md:inline">•</span>
              <div className="flex items-center gap-1 text-gray-600">
                <MapPin className="h-3 w-3 md:h-4 md:w-4" />
                <span className="text-xs md:text-sm">{location}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-pink-100 text-pink-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                Featured
              </span>
            </div>
          </div>
          <button
            onClick={handleShareClick}
            className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            <Share2 className="h-4 w-4 md:h-5 md:w-5" />
            <span className="hidden md:inline text-sm">Share</span>
          </button>
        </div>
      </div>

      <ShareModal
        isOpen={isShareModalOpen}
        onClose={handleCloseModal}
        experienceTitle={businessName}
        experienceImage={(typeof images[0]?.src === "string" ? images[0]?.src : (images[0]?.src as { src?: string })?.src) || "/images/logo-beatonomi.svg"}
        shareUrl={typeof window !== "undefined" ? window.location.href : undefined}
      />
    </div>
  );
};

export default PartnerHero;
