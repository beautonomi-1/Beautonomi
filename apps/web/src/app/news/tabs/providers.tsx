"use client";
import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Image1 from "./../../../../public/images/Newsroom_TrustSafety_008.jpg";
import Image2 from "./../../../../public/images/Newsroom_TrustSafety_004.jpg";
import { Button } from "@/components/ui/button";

const imageData = [
  {
    src: Image1,
    caption: "New features for providers: smarter booking and payouts",
    date: "August 8, 2024",
    link: "/news",
  },
  {
    src: Image2,
    caption: "Beautonomi Coverage: protection for providers",
    date: "August 5, 2024",
    link: "/news",
  },
  {
    src: Image1,
    caption: "Partnering with local businesses to grow beauty and wellness",
    date: "August 15, 2024",
    link: "/news",
  },
  {
    src: Image2,
    caption: "Summer support for providers and customers",
    date: "July 24, 2024",
    link: "/news",
  },
];

const ITEMS_PER_PAGE = 12;

const Providers = () => {
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  const handleLoadMore = () => {
    setVisibleCount((prevCount) => prevCount + ITEMS_PER_PAGE);
  };

  return (
    <div className="container">
      <div className="pb-4 md:pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-5 md:mb-10">
          {imageData.slice(0, visibleCount).map((image, index) => (
            <div key={index} className="grid md:block grid-cols-2 gap-5">
              <Image
                src={image.src}
                alt=""
                layout="responsive"
                className="rounded-xl mb-4"
              />
              <div>
                <Link href={image.link}>
                  <div className="text-sm md:text-lg font-normal text-secondary leading-5 md:leading-7 mb-2 hover:underline">
                    {image.caption}
                  </div>
                </Link>
                <p className="text-sm font-light text-[#717171]">
                  {image.date}
                </p>
              </div>
            </div>
          ))}
        </div>
        {visibleCount < imageData.length && (
          <Button variant="destructive" onClick={handleLoadMore}>
            View more
          </Button>
        )}
      </div>
    </div>
  );
};

export default Providers;
