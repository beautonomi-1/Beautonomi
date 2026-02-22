import Image from "next/image";
import React from "react";
import Mobile from './../../../../public/images/ed2829c4-4ecd-4c4e-b775-00bb3d95900a.jpg'
const CommunityCommitment = () => {
  return (
    <div className="container border-b">
    <div
      className={`flex flex-col md:flex-row gap-6 md:gap-10 items-center mt-4 md:mt-16 justify-between max-w-6xl mx-auto mb-6 md:mb-16`}
    >
      <div className="max-w-full md:max-w-md lg:max-w-lg">
        <h2 className="text-[22px] md:text-[38px] text-secondary  font-medium mb-3 md:mb-6">The Beautonomi Community Commitment </h2>
        <p className="text-sm md:text-[22px] font-light Aribnb-light text-secondary leading-7">
          Since 2016, we’ve asked everyone who uses Beautonomi to commit to treating
          others with respect and without judgment or bias by agreeing to the
          Beautonomi Community Commitment. Anyone who doesn’t agree is removed from
          our platform—as of 2022, that’s 2.5 million people.{" "}
        </p>
      </div>
      <div className="">
        <Image
          src={Mobile}
          alt=""
          className="rounded-md h-[691px] w-[473px] object-cover"
        />
      </div>
    </div>
    </div>
  );
};

export default CommunityCommitment;
