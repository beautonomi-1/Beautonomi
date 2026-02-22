import React from "react";
import Image, { type StaticImageData } from "next/image";

type ImgSrc = StaticImageData | string;
import Image1 from "./../../../../public/images/33b80859-e87e-4c86-841c-645c786ba4c1.png";
import Image2 from "./../../../../public/images/059619e1-1751-42dd-84e4-50881483571a(1).png";
import CleaningSpray from "./../../../../public/images/cleaning-spray.svg";
import Check from "./../../../../public/images/check.svg";
import Key from "./../../../../public/images/key.svg";
import Chat from "./../../../../public/images/chat.svg";
import Location from "./../../../../public/images/location(1).svg";
import Tag from "./../../../../public/images/outlined-tag.svg";

interface RatingCategory {
  label: string;
  value: string;
  image: ImgSrc;
}

interface RatingsProps {
  isMultiColumn: boolean;
}

const ratingCategories: RatingCategory[] = [
  { label: "Cleanliness", value: "5.0", image: CleaningSpray },
  { label: "Accuracy", value: "5.0", image: Check },
  { label: "Check-in", value: "5.0", image: Key },
  { label: "Communication", value: "5.0", image: Chat },
  { label: "Location", value: "5.0", image: Location },
  { label: "Value", value: "5.0", image: Tag },
];

const Ratings: React.FC<RatingsProps> = ({ isMultiColumn }) => {
  return (
    <div className="bg-[#fbf7ed] md:bg-white pt-8 md:pt-0 max-h-[90%]">
      <div className="max-w-[2340px] mx-auto px-10">
        <div className="flex items-center justify-center mb-7 md:mb-2">
          <div className="w-16 md:w-20 h-16 md:h-20">
            <Image src={Image2} alt="Image 2" className="object-cover" />
          </div>
          <h2 className="text-7xl md:text-[100px] font-normal text-secondary">
            5.0
          </h2>
          <div className="w-16 md:w-20 h-16 md:h-20">
            <Image src={Image1} alt="Image 1" className="object-cover" />
          </div>
        </div>
        <div className="text-center max-w-sm mx-auto pb-14">
          <p className="text-[22px] font-normal text-secondary mb-2 md:mb-0">
            Partner favorite
          </p>
          <p className="text-sm md:text-lg font-light text-destructive">
            This salon is in the <span className="text-black">top 1%</span> of
            eligible listings based on ratings, reviews, and reliability
          </p>
        </div>
        <div className={`overflow-x-auto ${isMultiColumn ? "hidden md:block" : "hidden md:flex flex-col gap-6 border-b-0"}`} 
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          <div className={`${isMultiColumn ? "grid grid-cols-7 gap-6 min-w-max" : ""} border-b pb-10 mb-10`}>
            {isMultiColumn ? (
              <div className="border-r pr-6">
                <p className="mb-1 text-xs lg:text-sm font-light text-secondary">
                  Overall ratings
                </p>
                <div className="flex flex-col justify-between items-start">
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <div key={rating} className="flex items-center gap-2">
                      <p className="text-xs font-light text-secondary">
                        {rating}
                      </p>
                      <div
                        className={`border-t-4 rounded-full w-24 text-xs ${
                          rating === 5 ? "border-black" : "border-accent"
                        } mr-2`}
                      ></div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {ratingCategories.map((category, index) => (
              <div
                key={index}
                className={`${
                  isMultiColumn ? " border-r pr-6" : "flex justify-between items-center "
                } ${index === ratingCategories.length - 1 && !isMultiColumn ? "" : ""}`}
              >
                {isMultiColumn ? (
                  <>
                    <p className="text-sm font-light text-secondary">
                      {category.label}
                    </p>
                    <p className="text-xs lg:text-lg font-light text-secondary mb-6">
                      {category.value}
                    </p>
                    <Image src={category.image} alt={category.label} className="h-6 w-6"/>
                  </>
                ) : (
                  <div className="flex justify-between border-b w-full pb-4 mb-2">
                    <div className="flex items-center gap-2">
                      <Image src={category.image} alt={category.label} className="h-6 w-6" />
                      <p className="text-sm font-light text-secondary">
                        {category.label}
                      </p>
                    </div>
                    <p className="text-lg font-light text-secondary">
                      {category.value}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Ratings;