"use client";
import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Image1 from "./../../../../public/images/Copy-of-Sophie_216212958_London_147.webp";
import Image2 from "./../../../../public/images/PJM0223-18Q1_Superhost_Chicago_1000.jpg";
import { Button } from "@/components/ui/button";

const imageData = [
  {
    src: Image1,
    caption: "New booking experience for customers",
    date: "August 8, 2024",
    link: "/news",
  },
  {
    src: Image2,
    caption: "New features for providers: smarter booking and payouts",
    date: "August 12, 2024",
    link: "/news",
  },
  {
    src: Image1,
    caption: "Trust and safety updates for our community",
    date: "August 5, 2024",
    link: "/news",
  },
  {
    src: Image2,
    caption: "How we're making beauty services more accessible",
    date: "August 7, 2024",
    link: "/news",
  },
];

const ITEMS_PER_PAGE = 12;

const Product = () => {
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
              <div className="text-sm md:text-lg font-normal  text-secondary leading-7 mb-2 hover:underline">
                {image.caption}
              </div>
            </Link>
            <p className="text-sm font-light  text-[#717171]">
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

export default Product;