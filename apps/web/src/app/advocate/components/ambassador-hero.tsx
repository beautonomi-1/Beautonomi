import React from "react";
import HeroImage from "./../../../../public/images/718906e0-7511-4d9b-930f-12c802c1e8df.png";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import HeroImage1 from "./../../../../public/images/a8075fcc-6210-4faf-9d87-2a3305033040.png";
const AmbassadorHero = () => {
  return (
    <div className="bg-[#fdf6ec] mb-16 md:mb-24 pt-20 pb-[500px] sm:pb-[380px] h-60 md:h-screen relative">
      <div className="container mx-auto flex flex-row md:flex-col lg:flex-row ">
        <div className="absolute md:block lg:absolute max-w-md lg:max-w-2xl z-10 mt-0 lg:mt-48 mx-auto w-1/2 ">
          <h1 className="text-[32px] lg:text-[56px] Beautonomi-bold font-bold text-secondary leading-10 lg:leading-[75px] mb-2">
            Guide new Hosts, get rewarded
          </h1>
          <p className="text-lg lg:text-[26px] font-normal  text-secondary leading-7 mb-6 ">
            Become a Superhost Ambassador today and help build the Host
            community of tomorrow
          </p>
          <Button
            variant="destructive"
            className="hidden lg:block bg-transparent"
          >
            Get more details
          </Button>
        </div>
        <div className="absolute md:block lg:absolute right-0 mx-auto ">
          <Image
            src={HeroImage}
            alt="Hero Image"
            className="hidden md:block mx-auto h-auto lg:h-screen w-[450px] lg:w-full justify-center"
          />
          <Image
            src={HeroImage1}
            alt="Hero Image"
            className=" mt-36 sm:mt-10 md:mt-0 block md:hidden w-[400px] h-auto"
          />
        </div>
      </div>
    </div>
  );
};

export default AmbassadorHero;
