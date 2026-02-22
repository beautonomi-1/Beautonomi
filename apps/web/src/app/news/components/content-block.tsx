import React from "react";
import Image from "next/image";
import Image1 from "./../../../../public/images/FoundersRauschSt_201203_001_photos_v2_x4_RET.webp";
import { Button } from "@/components/ui/button";
const ContentBlock = () => {
  return (
    <div className="bg-primary pt-12 md:pt-20">
      <div className="container ">
        <div className=" border-b pb-12 md:pb-20">
          <div className="flex-col-reverse flex md:grid grid-cols-1 sm:grid-cols-2 items-center bg-white rounded-2xl">
            <div>
              <Image src={Image1} alt="" className="rounded-b-2xl sm:rounded-l-2xl h-[300px] object-cover" />
            </div>
            <div className="pl-5 py-10">
              <h2 className="text-[22px] md:text-[40px] font-normal  text-secondary leading-5 md:leading-10 hover:underline mb-3">
                What makes Beautonomi, Beautonomi
              </h2>
              <p className="text-popover text-sm md:text-[22px] font-light  mb-4">
                August 7, 2024
              </p>
              <Button variant="default">Read more</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContentBlock;
