import Image from "next/image";
import React from "react";
import logo from "../../../../public/images/fav icon 1(1).svg";

const Hero = () => {
  return (
    <div className="">
      <Image src={logo} alt="" className="mb-4 lg:mb-20 m-7" />
      <div className="container">
        <p className="text-[22px] mb-8 font-beautonomi font-normal ">2022 Update</p>
        <h2 className="text-[32px] md:text-[80px] leading-10 md:leading-[80px] font-normal pb-2 lg:pb-16 border-b border-gray-200 ">
          Fighting discrimination and building inclusion
        </h2>
      </div>
    </div>
  );
};

export default Hero;
