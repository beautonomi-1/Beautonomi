import React from "react";
import Image from "next/image";
import SaveArrow from "../../../../public/images/save-arrow.svg";
import HeartIcon from "./../../../../public/images/heart.svg";
import Image1 from "./../../../../public/images/01819c16-43a1-4aee-9957-9edce6eb8e16.webp";

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
const ExperienceHero = () => {
  return (
    <div className="container">
      <div className="mb-6">
        <div className="flex items-center justify-between my-5">
          <h2 className="hidden md:block text-[26px] font-normal Airbbn-medium text-secondary">
            Join a living room session with Doja
          </h2>
          <div className="flex gap-2">
            {actionItems.map((item, index) => (
              <div
                key={index}
                className="flex gap-2 items-center hover:bg-primary p-2 rounded-lg"
              >
                <Image src={item.icon} alt={item.label} className="h-5 w-5" />
                <p className="underline text-sm font-light ">
                  {item.label}
                </p>
              </div>
            ))}
          </div>
        </div>
        <Image src={Image1} alt="" className="rounded-xl w-full mb-5 md:mb-0" />
        <h2 className="block md:hidden text-[26px] font-light Airbbn-medium text-secondary mb-5">
          Join a living room session with Doja
        </h2>
      </div>
    </div>
  );
};

export default ExperienceHero;
