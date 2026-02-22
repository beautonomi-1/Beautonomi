import React from "react";
import Image from "next/image";
import Icon from "./../../../public/images/b8a75b4b-35cc-4b25-b67c-bf6f9f980944.png";
const FeaturesExperience = () => {
  return (
    <div className="container">
      <div className="border-b mb-10 md:mb-12 pb-10 md:pb-14">
        <Image src={Icon} alt="" className="mx-auto max-w-2xl -mb-5" />
        <h2 className="text-7xl md:text-8xl font-semdibold text-secondary text-center mb-2">icons</h2>
        <p className="text-lg md:text-xl font-normal  text-secondary max-w-xs md:max-w-xl mx-auto text-center">
          Extraordinary experiences hosted by the world’s greatest names in
          music, film, TV, art, sports, and more.
        </p>
      </div>
    </div>
  );
};

export default FeaturesExperience;
