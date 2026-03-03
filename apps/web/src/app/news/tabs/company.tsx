"use client";
import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Image1 from "./../../../../public/images/Newsroom_TrustSafety_004.jpg";
import Image2 from "./../../../../public/images/AIR_Q22024_NewsroomPost_08.05.webp";
import { Button } from "@/components/ui/button";

const imageData = [
  {
    src: Image1,
    caption: "Beautonomi supports arts and culture in our communities",
    date: "August 15, 2024",
    link: "/news",
  },
  {
    src: Image2,
    caption: "Beautonomi Q2 2024 company update",
    date: "August 8, 2024",
    link: "/news",
  },
  {
    src: Image1,
    caption: "Joining forces with industry partners to combat payment fraud",
    date: "August 5, 2024",
    link: "/news",
  },
  {
    src: Image2,
    caption: "What makes Beautonomi, Beautonomi",
    date: "August 7, 2024",
    link: "/news",
  },
];

const ITEMS_PER_PAGE = 12;

const Company = () => {
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
              <div className="text-sm md:text-lg font-normal  text-secondary leading-5 md:leading-7 mb-2 hover:underline">
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

export default Company;