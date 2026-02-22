import React from "react";
import Image from "next/image";
import Image1 from './../../../../public/images/Riverfront-Getaway-with-a-View-.webp'
import Image2 from './../../../../public/images/Copy-of-Sophie_216212958_London_147.webp'
import Image3 from './../../../../public/images/Newsroom_TrustSafety_004.jpg'
import Image4 from './../../../../public/images/AIR_Q22024_NewsroomPost_08.05.webp'

const imageData = [
  {
    src: Image1,
    caption:
      "Local travel on the rise: See the top trending destinations locals love",
    date: "August 15,2024",
  },
  {
    src: Image2,
    caption:
      "Paris 2024 Paralympic Games countdown: Tips to book last-minute on Beautonomi",
    date: "August 8,2024",
  },
  {
    src: Image3,
    caption: "Beautonomi Q2 2024 financial results",
    date: "August 6,2024",
  },
  {
    src: Image4,
    caption: "Joining forces with top financial crimes association to combat travel scams",
    date: "August 5,2024",
  },
];

const LatestNews = () => {
  return (
    <div className="container">
    <div className="pb-8 md:pb-20">
      <h2 className="text-[22px] lg:text-[32px] font-normal  text-secondary mb-6">
      Latest news
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {imageData.map((image, index) => (
          <div key={index} className="grid md:block grid-cols-2 gap-5">
            <Image
              src={image.src}
              alt=""
              layout="responsive"
              className="rounded-xl mb-4 md:h-[200px]"
            />
            <div>
            <p className="text-[18px] md:text-[22px] font-normal  text-secondary leading-7 mb-2 hover:underline">
              {image.caption}
            </p>
            <p className="text-sm font-light text-[#717171]">
              {image.date}
            </p>
          </div>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
};

export default LatestNews;
