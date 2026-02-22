import React from "react";
import Image from "next/image";
import Logo from "./../../../../public/images/air-cover-for-host.svg";

const headings = [
  "Top-to-bottom protection.",
  "Always included, always free.",
  "Only on Beautonomi."
];

const HostHero = () => {
  return (
    <div className="bg-primary py-20">
      <div className="container">
        <div className="justify-center flex">
          <Image src={Logo} alt="Beautonomi Logo" className="-mb-3"/>
        </div>
        <div className="text-center">
          {headings.map((heading, index) => (
            <h2 key={index} className="text-[22px] sm:text-[28px] md:text-3xl lg:text-4xl font-normal Beautonomi-nomal text-secondary">
              {heading}
            </h2>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HostHero;
