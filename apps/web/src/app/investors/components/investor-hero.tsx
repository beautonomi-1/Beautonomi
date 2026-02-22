import Image from 'next/image';
import React from 'react';
import Investor from './../../../../public/images/investors-banner-v2.jpg';

const InvestorHero = () => {
  return (
    <div className="relative h-screen">
      <div className="absolute inset-0">
        <Image
          src={Investor}
          alt="Investors Banner"
          fill
          sizes="100vw"
          className='pb-20 object-cover object-center'
        />
      </div>
      <div className="absolute  bottom-40 lg:bottom-56 max-w-72 left-16 lg:left-96">
        <h1 className="text-white text-[32px] font-black ">
        Over 5 million Hosts share their worlds on Beautonomi.
        </h1>
      </div>
    </div>
  );
};

export default InvestorHero;
