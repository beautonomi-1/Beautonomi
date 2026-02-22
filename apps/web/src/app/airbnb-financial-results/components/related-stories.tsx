import React from "react";
import Image from "next/image";
import Image2 from "./../../../../public/images/Newsroom_TrustSafety_004.jpg";
import Image3 from "./../../../../public/images/Newsroom_TrustSafety_008.jpg";
import Image1 from "./../../../../public/images/Copy-of-Sophie_216212958_London_147.webp";

const imageData = [
  {
    src: Image1,
    caption:
      "Paris 2024 Paralympic Games countdown: Tips to book last-minute on Beautonomi",
    date: "August 8,2024",
  },
  {
    src: Image2,
    caption:
      "Joining forces with top financial crimes association to combat travel scams",
    date: "August 5,2024",
  },
  {
    src: Image3,
    caption: "Summer travel support for our community",
    date: "July 24,2024",
  },
];

const RelatedStories = () => {
  return (
    <div className="container ">
      <div className="pb-28 md:pb-32">
      <h2 className="text-[26px] md:text-[32px] font-normal  text-secondary mb-6">
        Related Stories
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {imageData.map((image, index) => (
          <div key={index} className="">
            <Image
              src={image.src}
              alt=""
              layout="responsive"
              className="rounded-xl mb-4"
            />
            <p className="text-[22px] font-normal  text-secondary leading-7 mb-2">
              {image.caption}
            </p>
            <p className="text-sm font-normal  text-[#717171]">
              {image.date}
            </p>
          </div>
        ))}
      </div>
    </div>
    </div>
  );
};

export default RelatedStories;
