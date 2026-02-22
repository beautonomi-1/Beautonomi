import React from "react";
import Image from "next/image";
import Image1 from "./../../../../public/images/7a6f5b15-ae6c-4c70-9f4b-f6edff737387.webp";
import Work from "./../../../../public/images/office-bag.svg";
import Book from "./../../../../public/images/book.svg";
import Graduation from "./../../../../public/images/graduation.svg";
import Pet from "./../../../../public/images/pet.svg";
import Clock from "./../../../../public/images/clock.svg";
import Badge from "./../../../../public/images/badge.svg";
import Link from "next/link";
const hostDetails = [
  {
    id: 1,
    icon: Graduation,
    text: "Where I went to school: Cortines School of Visual & Perf Arts",
  },
  {
    id: 2,
    icon: Work,
    text: "My work: Artist",
  },
  {
    id: 3,
    icon: Clock,
    text: "I spend too much time: Painting, acting (for my friends)",
  },
  {
    id: 4,
    icon: Book,
    text: "My biography title: “9 lives”",
  },
  {
    id: 5,
    icon: Pet,
    text: "Pets: 4 cats, Ray Alex Wart & Irving St. John",
  },
];

const HostProfile = () => {
  return (
    <div className="container relative">
      <div className="border-b mb-1 md:mb-16 pb-16 md:pb-8">
        <div className="max-w-96">
          <h2 className="text-[22px] font-normal  text-secondary mb-6">
            Meet your Host
          </h2>
          <Link href="/">
            <div className="bg-muted h-8 w-8 rounded-full absolute justify-center items-center flex top-40 left-56">
              <Image src={Badge} alt="" className="h-5 w-5" />
            </div>
            <div className="bg-white pt-10 pb-8 px-8 rounded-2xl w-full shadow-2xl mb-8">
              <div className="justify-center  text-center">
                <Image
                  src={Image1}
                  alt="Doja Cat"
                  className="h-24 w-24 mb-3 rounded-full justify-center flex mx-auto"
                />
                <p className="text-3xl font-light  text-secondary">
                  Doja Cat
                </p>
                <p className="text-base font-light  text-secondary">
                  Started beauty partners in 2024
                </p>
              </div>
            </div>
          </Link>
          {hostDetails.map((detail) => (
            <div key={detail.id} className="flex gap-4 items-center mt-4">
              <Image src={detail.icon} alt="" className="h-6 w-6" />
              <p className="text-base font-light text-secondary ">
                {detail.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HostProfile;
