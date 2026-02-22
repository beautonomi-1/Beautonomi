import { Button } from "@/components/ui/button";
import React from "react";
import home from "../../../../public/images/homeplus.svg";
import Image from "next/image";
import Image1 from "./../../../../public/images/ec9ef413-8ca6-4b87-b788-5ee0ff5ec154.webp";

const Cta = () => {
  return (
    <div className="bg-primary pb-20">
      <div className="container">
        <div className="bg-white items-center flex flex-col-reverse sm:flex-row justify-between gap-10 rounded-xl px-4 pt-10">
          <div className="w-full sm:w-1/2 h-[450px] lg:h-[300px] relative">
            <Image
              src={Image1}
              alt="Descriptive alt text"
              layout="fill"
              objectFit="cover"
              className="rounded-l-xl"
            />
          </div>
          <div className="mx-auto sm:mx-0 text-center sm:text-left max-w-md pr-6 py-6 md:pb-10 w-full sm:w-1/2">
            <h2 className="text-[26px] md:text-[40px] font-semibold text-secondary leading-10 mb-4">
              The super easy way to Beautonomi your place
            </h2>
            <p className="text-base font-normal  text-destructive mb-7">
              Beautonomi Setup makes it easier to put your place on Beautonomi, with
              hands-on help from a Superhost from your first question to your
              first guest.
            </p>
            <div className="text-center sm:text-left">
              <Button variant="secondary" className="gap-3">
                <Image src={home} alt="" />
                Beautonomi Setup
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cta;
