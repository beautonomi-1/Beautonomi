import React from "react";
import Image from "next/image";
import Mobile from './../../../../public/images/mobile.svg';
import Link from './../../../../public/images/link.svg';
import Person from './../../../../public/images/person.svg';

const steps = [
  {
    title: "Exclusive tools",
    description:
      "With tracking and helpful guides available on your dashboard, you'll know when and how to support your new Beauty Partner connections.",
    image: Mobile, 
  },
  {
    title: "Custom links",
    description: "Create unique links to share with new Hosts.",
    image: Link, 
  },
  {
    title: "Community of experienced Hosts",
    description:
      "There's a global community of Superhost Ambassadors within reach. Learn what's working for other Superhost Ambassadors or get feedback on your approach.",
    image: Person, 
  },
];

const Support = () => {
  return (
    <div className="container">
      <div className="border-none lg:border-b pb-0 lg:pb-24 mb-7 lg:mb-24">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 max-w-xl md:max-w-md lg:max-w-full mx-auto">
          <div className="-mb-3 lg:mb-8">
            <h2 className="text-[32px] font-bold text-secondary">
              Support to help you earn
            </h2>
          </div>
          {steps.map(({ image, title, description }, index) => (
            <div key={index} className="flex flex-col mb-8 lg:mb-0">
              <Image src={image} alt={title} className="h-12 w-12 mb-4 lg:mb-0"/>
              <h3 className="text-[32px] font-bold text-secondary mb-3 leading-9">
                {title}
              </h3>
              <p className="text-lg font-normal  text-secondary">
                {description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Support;
