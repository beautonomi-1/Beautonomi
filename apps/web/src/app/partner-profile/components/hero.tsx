"use client";
import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import LoginModal from "@/components/global/login-modal";
import ShareModal from "@/app/home/components/share-modal";

import Image1 from "./../../../../public/images/pexels-steinportraits-1898555.jpg";
import Image2 from "./../../../../public/images/pexels-rdne-7035446.jpg";
import Image4 from "./../../../../public/images/pexels-alipazani-2878375 - Copy (1).jpg";
import Image5 from "./../../../../public/images/pexels-cottonbro-3998404 (1).jpg";
import Image6 from "./../../../../public/images/pexels-rdne-6724431.jpg";
import SaveArrow from "../../../../public/images/save-arrow.svg";
import HeartIcon from "./../../../../public/images/heart.svg";
import Image3 from "./../../../../public/images/svg-gobbler(4).svg";

const guestDetails = [
  { label: "Hair Care", separator: "•" },
  { label: "Face Care", separator: "•" },
  { label: "Menicure", separator: "•" },
  { label: "Pedicure" },
];

const actionItems = [
  {
    icon: SaveArrow,
    label: "Share",
  },
  {
    icon: HeartIcon,
    label: "Save",
  },
];

const images = [
  { src: Image1, alt: "Main Image", link: "/partner-profile/gallery" },
  { src: Image2, alt: "Image 1", link: "/partner-profile/gallery" },
  { src: Image6, alt: "Image 2", link: "/partner-profile/gallery" },
  { src: Image4, alt: "Image 3", link: "/partner-profile/gallery" },
  { src: Image5, alt: "Image 4", link: "/partner-profile/gallery" },
];

const Hero: React.FC<{ businessName?: string }> = ({ businessName = "Provider" }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);

  const handleShareClick = () => {
    setIsShareModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsShareModalOpen(false);
  };

  const handleHeartClick = () => {
    setIsLoginModalOpen(true);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (touchStart - touchEnd > 75) {
      // Swipe left
      const newIndex = currentSlide === images.length - 1 ? 0 : currentSlide + 1;
      setCurrentSlide(newIndex);
      scrollToSlide(newIndex);
    }

    if (touchStart - touchEnd < -75) {
      // Swipe right
      const newIndex = currentSlide === 0 ? images.length - 1 : currentSlide - 1;
      setCurrentSlide(newIndex);
      scrollToSlide(newIndex);
    }
  };

  const scrollToSlide = (index: number) => {
    if (sliderRef.current) {
      const slideWidth = sliderRef.current.offsetWidth;
      sliderRef.current.scrollTo({
        left: index * slideWidth,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    const slider = sliderRef.current;
    if (!slider) return;

    const handleScroll = () => {
      const scrollLeft = slider.scrollLeft;
      const width = slider.offsetWidth;
      const index = Math.round(scrollLeft / width);
      setCurrentSlide(index);
    };

    slider.addEventListener("scroll", handleScroll);
    return () => slider.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="max-w-[2340px] mx-auto">
      <div className="mb-4 md:my-7">
      <nav className="hidden md:flex px-10">
          <ul className="flex items-center space-x-2 text-sm">
            <li><Link href="/" className="text-gray-500 hover:text-gray-700">Home</Link></li>
            <li className="text-gray-500">•</li>
            <li><Link href="/category/facial" className="text-gray-500 hover:text-gray-700">Facial</Link></li>
            <li className="text-gray-500">•</li>
            <li className="text-black font-medium">{businessName || "Provider"}</li>
          </ul>
        </nav>
        <div className="flex flex-row items-start md:items-center justify-between my-4 px-10">
          
          <div className="flex items-center">
            <Link
              href="/"
              className="flex md:hidden items-center mr-4 text-secondary mt-2 font-light text-sm"
            >
              <ChevronLeft className="h-5 w-5 mr-1" />
              <span>Home</span>
            </Link>
            <h2 className="hidden md:flex text-[26px] font-normal Airbbn-medium text-secondary">
            {businessName || "Provider"}
            </h2>
          </div>
          <div className="flex gap-2">
            {actionItems.map((item, index) => (
              <div
                key={index}
                className="flex gap-2 items-center hover:bg-primary p-2 rounded-lg cursor-pointer"
                onClick={
                  item.label === "Share" ? handleShareClick : handleHeartClick
                }
              >
                <Image src={item.icon} alt={item.label} className="h-5 w-5" />
                <p className="underline text-sm font-light">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="hidden md:flex gap-3 mb-3 px-10">
          <div className="w-1/2">
            <Link href={images[0].link}>
              <Image
                src={images[0].src}
                alt={images[0].alt}
                className="h-[408px] w-full rounded-l-xl object-cover hover:brightness-50 transition-all duration-300"
              />
            </Link>
          </div>
          <div className="w-1/2 grid grid-cols-2 gap-2 relative">
            {images.slice(1).map((image, index) => (
              <Link key={index} href={image.link}>
                <Image
                  src={image.src}
                  alt={image.alt}
                  className={`h-[200px] w-full object-cover hover:brightness-50 transition-all duration-300 ${
                    index === 1 || index === 3 ? "rounded-r-xl" : ""
                  }`}
                />
              </Link>
            ))}
            <Link href="/rooms/rooms-tour">
              <div className="absolute bottom-5 right-5 flex bg-white p-2 rounded-lg gap-3">
                <Image src={Image3} alt="" className="" />
                <button className="text-secondary text-sm font-light">
                  Show all photos
                </button>
              </div>
            </Link>
          </div>
        </div>

        <div className="relative md:hidden">
          <div 
            className="overflow-x-hidden" 
            ref={sliderRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="flex w-full">
              {images.map((image, index) => (
                <Link key={index} href={image.link} className="w-full flex-shrink-0">
                  <Image
                    src={image.src}
                    alt={image.alt}
                    className="h-[408px] w-full object-cover hover:brightness-50 transition-all duration-300"
                  />
                </Link>
              ))}
            </div>
          </div>

          <div className="absolute bottom-4 right-4 bg-black bg-opacity-50 text-white px-3 py-1 rounded-full text-sm">
            {currentSlide + 1}/{images.length}
          </div>
        </div>

        <div className="my-3 px-10">
          <h2 className="flex md:hidden text-[26px] font-normal Airbbn-medium text-secondary leading-8">
          {businessName || "Provider"}
          </h2>
          
          <nav className="flex md:hidden mb-2">
          <ul className="flex items-center space-x-2 text-sm">
            <li><Link href="/" className="text-gray-500 hover:text-gray-700">Home</Link></li>
            <li className="text-gray-500">•</li>
            <li><Link href="/category/facial" className="text-gray-500 hover:text-gray-700">Facial</Link></li>
            <li className="text-gray-500">•</li>
            <li className="text-black font-medium">{businessName || "Provider"}</li>
          </ul>
        </nav>

          <h2 className="text-base md:text-[26px] font-light Airbbn-medium text-secondary mt-1">
            Kittn Salon & Spa - Karnal
          </h2>
          <div className="flex items-center text-base font-light text-secondary mb-4 md:mb-6">
            {guestDetails.map((detail, index) => (
              <React.Fragment key={index}>
                <span className="text-sm">{detail.label}</span>
                {detail.separator && (
                  <span className="mx-2 text-xl">{detail.separator}</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={handleCloseModal}
        experienceTitle={businessName || "Provider"}
        experienceImage={(typeof images[0]?.src === "string" ? images[0]?.src : (images[0]?.src as { src?: string })?.src) || "/images/logo-beatonomi.svg"}
        shareUrl={typeof window !== "undefined" ? window.location.href : undefined}
      />

      <LoginModal open={isLoginModalOpen} setOpen={setIsLoginModalOpen} />
    </div>
  );
};

export default Hero;