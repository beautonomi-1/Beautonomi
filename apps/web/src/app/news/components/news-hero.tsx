import React from "react";
import Image from "next/image";
import Image1 from "./../../../../public/images/21-Polly-Pocket-Icons-Airbnb-Credit-Juan-Navarro-Above-Summit-.jpg";
import { Button } from "@/components/ui/button";
const NewsHero = () => {
  return (
    <div className="container ">
    <div className=" border-b mb-9 md:mb-10 pb-14 md:pb-20">
      <div className="flex flex-col-reverse md:flex-row justify-between gap-6 md:gap-20 items-center">
        <div className="w-full md:w-1/2">
            <p className="text-popover text-sm font-normal  mb-0 md:mb-3">August 7, 2024</p>
          <h2 className="text-[22px] md:text-[26px] lg:text-[40px] font-light text-secondary leading-10 hover:underline mb-3 md:mb-7 lg:mb-9">
            Polly Pocket’s ‘90s-era compact is now life-sized
          </h2>
          <Button variant="secondary">Read more</Button>
        </div>
        <div className="w-full md:w-1/2">
          <Image src={Image1} alt="" className="rounded-2xl"/>
        </div>
      </div>
    </div>
    </div>
  );
};

export default NewsHero;
