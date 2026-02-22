import React from "react";
import Image from "next/image";
import Image1 from "./../../../../public/images/c16023cd-aaf5-4ef9-b162-6bc2246a3ac4.png";
import Image2 from './../../../../public/images/85b457f4-dbe2-40e4-8440-1bd7545f8706.jpg'
const contentArray = [
  {
    title: "Unlock earnings",
    description:
      "We’ll connect you with new Hosts who could use your guidance—whether it’s about best cleaning practices or how to take photos guests love.",
    highlight:
      "When a new Beauty Partner you're matched with gets their listing up and running, you'll get paid after their first eligible stay.",
  },
  {
    title: "Mentor with flexibility",
    description:
      "We’ll connect you with new Hosts and you can support them from wherever you are, or from the comfort of your home.",
    highlight:
      "Beautonomi team members are ready to help you mentor new Hosts through tips, guidance, and workshops.",
  },
];

const ContentBlock = () => {
  return (
    <div className="mb-24">
      <div className="container">
        <div className="max-w-4xl mx-auto -mb-16 md:mb-20">
          <p className="text-lg lg:text-[32px]  max-w-xl md:max-w-96 lg:max-w-full mx-auto font-normal  text-secondary mb-16">
            Superhost Ambassadors offer new Hosts one-to-one guidance as they
            start beauty partner through Beautonomi Setup.{" "}
          </p>
          <div className="flex flex-col lg:flex-row items-center justify-between">
            {contentArray.map((content, index) => (
              <div key={index} className="mb-20 lg:mb-0 max-w-xl md:max-w-96">
                <h2 className="text-[32px] font-normal  text-secondary mb-3">
                  {content.title}
                </h2>
                <p className="text-lg font-normal  text-secondary mb-5">
                  {content.description}{" "}
                </p>
                <span className="font-normal  text-lg text-secondary">
                  {content.highlight}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="relative">
        <p className="absolute inset-0 flex items-center justify-center text-[26px] lg:text-[32px] font-normal  text-secondary text-center px-4 max-w-80 lg:max-w-xl mx-auto leading-8 top-10 lg:top-24">
          Your experience can help people all over the world discover the
          benefits of beauty partner.
        </p>
        <Image src={Image1} alt="" className="w-full h-[352px] hidden lg:block" />
        <Image src={Image2} alt="" className="w-full h-[352px] block lg:hidden" />
      </div>
    </div>
  );
};

export default ContentBlock;
