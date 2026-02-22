import { Button } from "@/components/ui/button";
import React from "react";
import Image from "next/image";
import Icon from "./../../../../public/images/logo-black.svg";

const Page = () => {
  return (
    <div className="container">
      <div className="max-w-3xl mb-48">
        <Image src={Icon} alt="" className="mt-10 mb-20" />
        <h2 className="text-[26px] md:text-[32px] lg:text-[64px] font-normal  text-secondary leading-8 sm:leading-[45px] lg:leading-[65px] mb-4 lg:mb-8">
          We don&apos;t have any beauty partner classes in your area right now
        </h2>
        <p className="text-base md:text-[22px] font-normal text-secondary  mb-6">
          We&apos;re adding more classes every day—but there are lots of other ways
          to learn more about Beauty partner on Beautonomi.
        </p>
        <Button variant="default">Learn about Beauty partner</Button>
      </div>
    </div>
  );
};

export default Page;
