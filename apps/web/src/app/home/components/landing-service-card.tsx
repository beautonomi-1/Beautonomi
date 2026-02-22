"use client";
import React from "react";
import Image from "next/image";
import { FaStar } from "react-icons/fa";
import { Heart } from "lucide-react";
import Link from "next/link";
import { StaticImageData } from "next/image";

interface ServiceCardProps {
  image: StaticImageData | string;
  providerName: string;
  providerImage?: StaticImageData | string;
  rating: number;
  reviewCount: string;
  description: string;
  price: string;
  distance: string;
  topRated?: boolean;
}

const LandingServiceCard: React.FC<ServiceCardProps> = ({
  image,
  providerName,
  providerImage,
  rating,
  reviewCount,
  description,
  price: _price,
  distance,
  topRated,
}) => {
  return (
    <Link href="/partner-profile" className="block">
      <div className="w-full cursor-pointer group">
        {/* Image Container */}
        <div className="relative w-full h-40 md:h-64 rounded-lg md:rounded-xl overflow-hidden mb-2 md:mb-3">
          <Image
            src={image}
            alt={providerName}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
          
          {/* Top Rated Badge */}
          {topRated && (
            <div className="absolute top-2 left-2 md:top-3 md:left-3">
              <span className="bg-[#FF0077] text-white text-[10px] md:text-xs font-medium px-2 md:px-3 py-1 rounded-full">
                Top Rated
              </span>
            </div>
          )}

          {/* Heart Icon - Top Right */}
          <button
            className="absolute top-2 right-2 md:top-3 md:right-3 bg-white rounded-full p-1.5 md:p-2 hover:bg-gray-100 transition-colors z-10"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <Heart className="h-4 w-4 md:h-5 md:w-5 text-gray-600" />
          </button>

          {/* Provider Profile Picture - Bottom Left */}
          <div className="absolute bottom-2 left-2 md:bottom-3 md:left-3">
            <div className="relative w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-white overflow-hidden bg-gray-200">
              {providerImage ? (
                <Image
                  src={providerImage}
                  alt={providerName}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-300">
                  <span className="text-white font-semibold text-xs">
                    {providerName.charAt(0)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div>
          <h3 className="font-semibold text-sm md:text-base mb-1">{providerName}</h3>
          
          {/* Rating */}
          <div className="flex items-center gap-1 mb-1">
            <FaStar className="text-yellow-400" size={14} />
            <span className="text-xs md:text-sm font-medium">{rating}</span>
            <span className="text-xs md:text-sm text-gray-500">({reviewCount})</span>
          </div>

          {/* Description */}
          <p className="text-xs md:text-sm text-gray-600 font-light mb-2 line-clamp-2">
            {description}
          </p>

          {/* Distance */}
          {distance && (
            <div className="flex items-center">
              <span className="text-xs md:text-sm text-gray-500">
                {distance}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};

export default LandingServiceCard;
