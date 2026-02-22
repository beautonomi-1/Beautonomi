"use client";
import React, { useState } from "react";
import Image from "next/image";
import Work from "./../../../../public/images/work.svg";
import Language from "./../../../../public/images/language.svg";
import Location from "./../../../../public/images/location.svg";
import UserImage from "./../../../../public/images/8aa5cbca-b607-4a45-bd0c-2d63a663aa30.webp";
import Link from "next/link";
import Place from "./../../../../public/images/d31ff0cf-e8b4-4f03-8ca4-3d91d93263bb.jpg";
import Place1 from "./../../../../public/images/f4d98858-028b-46a8-b6c4-40ac00851095.jpeg";
import Place2 from "./../../../../public/images/ca70d828-daf2-4a2c-9e43-217fd05853a5.jpg";
import Star from "./../../../../public/images/filled-star.svg";
import Check from "./../../../../public/images/checkk.svg";
import Image1 from "./../../../../public/images/svg-gobbler(3).svg";
import Badge from "./../../../../public/images/badge.svg";
import ReportFlag from "./../../../../public/images/flag.svg";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Reviews from "./reviews";

export default function User() {
  const [listingIndex, setListingIndex] = useState(0);

  const userDetails = [
    { icon: Work, description: "My work: Mohammed Mutlak Camp" },
    { icon: Language, description: "Speaks English" },
    { icon: Location, description: "Lives in Wadi Rum Village, Jordan" },
  ];

  const checkDetails = [
    { icon: Check, description: "Identify" },
    { icon: Check, description: "Email address" },
    { icon: Check, description: "Phone number" },
  ];

  const infoData = [
    { value: "93", label: "Reviews" },
    { value: "4.88", label: "Rating" },
    { value: "7", label: "Years beauty partner" },
  ];

  const testimonials = [
    {
      quote:
        "…Camp in desert. :) In price you have breakfast, dinner is for an extra charge, 10 JOD. But I also recommend the dinner, because it was very good. I also recommend a view of the desert by car. If you don&apos;t have a lot of time, two hours is ...",
      name: "Ladislav (Laco)",
      date: "April 2024",
      icon: UserImage,
    },
    {
      quote:
        "fees and was clear from the start unlike others. I would recommend him and his team…A User ProfileAFebruary 2024“…AMAZING EXPERIENCE. Great Food. Stunning scenery. A little cold at night but I visited in January so fair enough. thank you to Yousef!!…",
      name: "Duncan",
      date: "April 2024",
      icon: UserImage,
    },
    {
      quote:
        "“…Spending night in Wadi Rum dessert was incredible experience! We came here for one night and we extended for one more because we didn't get enough of this camp. Starting with delicious breakfast made with fresh ",
      name: "Duncan",
      date: "April 2024",
      icon: UserImage,
    },
  ];

  const listings = [
    {
      image: Place,
      type: "Tent",
      rating: "4.87",
      name: "Mohammed Mutlak Camp",
    },
    {
      image: Place1,
      type: "Tent",
      rating: "4.87",
      name: "Mohammed Mutlak Camp",
    },
    {
      image: Place2,
      type: "Tent",
      rating: "4.87",
      name: "Mohammed Mutlak Camp",
    },
  ];

  const slidesToShow = 1;
  const _duplicatedDesigns = [
    ...testimonials.slice(-slidesToShow),
    ...testimonials,
    ...testimonials.slice(1, slidesToShow),
  ];

  const handleListingPrev = () => {
    setListingIndex((prevIndex) =>
      prevIndex > 0 ? prevIndex - 1 : listings.length - slidesToShow
    );
  };

  const handleListingNext = () => {
    setListingIndex((prevIndex) =>
      prevIndex < listings.length - slidesToShow ? prevIndex + 1 : 0
    );
  };
  return (
    <div className="mb-14">
      <div className="container">
        <div className="flex-col lg:flex-row flex gap-20 max-w-sm lg:max-w-full mx-auto">
          <div className="">
            <div className=" flex-row flex gap-20 py-3 pl-10 shadow items-center rounded-xl justify-center mb-5">
              <div className="relative w-full">
                <div className="bg-muted h-8 w-8 justify-center items-center flex rounded-full absolute right-0 top-16">
                  <Image src={Badge} alt="" className="h-4 w-4" />
                </div>
                <Image
                  src={Place}
                  alt="Provider"
                  className="w-24 h-24 mb-2 rounded-full mx-auto"
                />
                <p className="text-3xl Beautonomi-bold text-secondary font-bold text-center">
                  Provider
                </p>
                <div className="flex gap-1 justify-center">
                  <Image src={Image1} alt="" />
                  <p className="text-sm text-secondary font-normal  text-center">
                    Superpartner
                  </p>
                </div>
              </div>
              <div className="w-full">
                {infoData.map((item, index) => (
                  <div
                    key={index}
                    className={` mb-2 pb-2 ${
                      index === infoData.length - 1 ? "" : "border-b"
                    }`}
                  >
                    <p className="text-[22px] font-bold Beautonomi-bold text-secondary">
                      {item.value}
                    </p>
                    <p className="text-[10px] font-normal  text-secondary">
                      {item.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="hidden lg:flex flex-col gap-6 p-6 shadow rounded-xl mb-5">
              <h2 className="text-[22px] font-normal  text-secondary max-w-72">
                Provider&apos;s confirmed information
              </h2>
              {checkDetails.map((detail, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 rounded-lg -mb-3"
                >
                  <Image src={detail.icon} alt="Check" className="w-6 h-6" />
                  <p className="text-base font-normal  text-secondary">
                    {detail.description}
                  </p>
                </div>
              ))}
            </div>
            <Link href="/reviews">
              <div className="flex gap-2 items-center">
                <Image src={ReportFlag} alt="" className="h-4 w-4" />
                <h3 className="text-base font-normal  underline cursor-pointer">
                  Report this profile
                </h3>
              </div>
            </Link>
          </div>

          <div className="max-w-3xl">
            <div className="border-b pb-10 mb-10">
              <h2 className="text-[32px] font-bold text-secondary mb-8">
                About Provider
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
                {userDetails.map((detail, index) => (
                  <div key={index} className="flex gap-3 items-center">
                    <Image src={detail.icon} alt="" className="w-6 h-6" />
                    <p className="text-base font-normal  text-secondary">
                      {detail.description}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-base font-normal  text-secondary">
                I am a member of the Zalabiya tribe of southern Jordan. I live
                in Rum village and run a Bedouin-style camp in the desert that
                provides accommodation to travelers coming to visit Wadi Rum. I
                take pride in running an honest business and supporting my
                family to do the same.
              </p>
            </div>

            <div>
              <div className="border-b pb-12 mb-10">
                <div>
                  <Reviews/>
                </div>
                <div className="flex md:hidden flex-col gap-6 p-6 shadow rounded-xl mb-5">
                  <h2 className="text-[22px] font-normal  text-secondary w-full">
                    Provider&apos;s confirmed information
                  </h2>
                  {checkDetails.map((detail, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 rounded-lg -mb-3"
                    >
                      <Image
                        src={detail.icon}
                        alt="Check"
                        className="w-6 h-6"
                      />
                      <p className="text-base font-normal  text-secondary">
                        {detail.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-6 mb-8">
              <div className="flex justify-between items-center">
                <h2 className="text-[22px] font-normal  text-secondary">
                  Provider Listings
                </h2>
                <div className=" flex gap-3 px-4">
                  <button
                    onClick={handleListingPrev}
                    className="bg-white border h-8 w-8 rounded-full flex items-center justify-center"
                  >
                    <ChevronLeftIcon className="h-5 w-5 text-gray-500" />
                  </button>
                  <button
                    onClick={handleListingNext}
                    className="bg-white border h-8 w-8 rounded-full flex items-center justify-center"
                  >
                    <ChevronRightIcon className="h-5 w-5 text-gray-500" />
                  </button>
                </div>
              </div>
              <div className="relative">
                <div className="grid grid-cols-2 lg:grid-cols-3  gap-4 overflow-hidden">
                  {listings
                    .slice(listingIndex, listingIndex + slidesToShow *3)
                    .map((listing, index) => (
                      <div
                        key={index}
                        className="rounded-lg w-full"
                      >
                        <Image
                          src={listing.image}
                          alt={listing.name}
                          className="rounded-lg w-full h-40 object-cover mb-4"
                        />
                        <h3 className="text-lg font-bold Beautonomi-bold text-secondary mb-2">
                          {listing.name}
                        </h3>
                        <p className="text-base font-normal  text-secondary">
                          {listing.type}
                        </p>
                        <div className="flex items-center mt-2">
                          <Image
                            src={Star}
                            alt="Star"
                            className="h-5 w-5 mr-2"
                          />
                          <p className="text-base font-normal  text-secondary">
                            {listing.rating}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
              
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
