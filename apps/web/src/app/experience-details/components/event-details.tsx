"use client";
import React, { useState } from "react";
import Image from "next/image";
import Image1 from "./../../../../public/images/7a6f5b15-ae6c-4c70-9f4b-f6edff737387.webp";
import { Button } from "@/components/ui/button";
import Star from "./../../../../public/images/star.svg";
import Music from "./../../../../public/images/music.svg";
import Lock from "./../../../../public/images/lock.svg";
import CloseIcon from "./../../../../public/images/close-icon.svg";
import Icon from "./../../../../public/images/b8a75b4b-35cc-4b25-b67c-bf6f9f980944.png";
import Logo from './../../../../public/images/3b9cd823-c754-44a3-9870-32fdd22752a4.webp'
import QRCode from './../../../../public/images/a70ab301-5325-4350-ad93-61189bf019c9.png'

const eventDetails = [
  {
    id: 1,
    title: "Witness my new era in person",
    subtitle: "It’s a house hang, wear your finest or wear your pajamas.",
    imageSrc: Star,
  },
  {
    id: 2,
    title: "A private set by yours truly",
    subtitle: "Just you and me, and my cats…are they invited?",
    imageSrc: Lock,
  },
  {
    id: 3,
    title: "Some of my favorite songs",
    subtitle: "I’ll be coming from the road ready to play them for you.",
    imageSrc: Music,
  },
];

const EventDetails = () => {
  const [isPopupVisible, setIsPopupVisible] = useState(false);

  const handleButtonClick = () => {
    setIsPopupVisible(true);
  };

  const handleClosePopup = () => {
    setIsPopupVisible(false);
  };

  return (
    <div className="container">
      <div className="flex justify-between items-start">
        <div className="max-w-2xl">
          <div className="flex gap-6 items-center border-b mb-9 pb-6">
            <Image src={Image1} alt="" className="h-12 w-12 rounded-full" />
            <div>
              <p className="text-base font-light  text-secondary">
                Hosted by Doja Cat
              </p>
              <p className="text-xs font-light  text-destructive">
                Artist
              </p>
            </div>
          </div>
          <div className="border-b mb-8 pb-4">
            {eventDetails.map((detail) => (
              <div key={detail.id} className="flex gap-3 items-center mb-5">
                <div>
                  <Image src={detail.imageSrc} alt="" className="h-8 w-8 " />
                </div>
                <div>
                  <p className="text-base font-light  text-secondary">
                    {detail.title}
                  </p>
                  <p className="text-xs font-light  text-destructive">
                    {detail.subtitle}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="border-b mb-12 pb-6 md:pb-12">
            <p className="text-base text-secondary font-light ">
              Fresh from headlining festivals and my European tour, I’m bringing
              my very special show directly to you in an intimate living room
              environment. Music is my passion, I can’t wait to share that piece
              of my world with you in a way you’ll never forget. Kick it with
              me, and my cats. More details coming soon.
            </p>
          </div>
        </div>
        <div className="hidden md:block bg-white pt-6 pb-8 px-8 rounded-lg max-w-[372px] w-full shadow border ">
          <h2 className="text-[22px] font-normal  text-secondary mb-6 text-center">
            Coming October
          </h2>
          <Button
            variant="secondary"
            className="w-full"
            onClick={handleButtonClick}
          >
            Notify me
          </Button>
        </div>
      </div>
      <div className="fixed bottom-0 left-0 right-0 md:hidden bg-white p-4 shadow-lg flex justify-between z-10 items-center">
      <h2 className="text-lg font-normal  text-secondary  text-center">
            Coming October
          </h2>
          <Button
            variant="secondary"
            className="h-12"
            onClick={handleButtonClick}
          >
            Notify me
          </Button>
      </div>

      {isPopupVisible && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-xl w-full">
            <div className="border-b pb-10 mb-8">
            <Image src={CloseIcon} alt="" onClick={handleClosePopup} />
            <Image src={Icon} alt="" />
            <h2 className="text-[40px] font-semibold mb-4 text-center">
              Get the app
            </h2>
            <p className="text-base font-light  text-destructive mb-4 text-center max-w-96 mx-auto">
              Use the Beautonomi app to request to book Icons and get notified about
              new ones.
            </p>
            </div>
            <div className="flex items-center justify-between">
            <div className="flex gap-4 items-center">
            <Image src={Logo} alt="" className="h-14 w-14"/>
            <div>
              <p className="text-sm font-normal  text-secondary">Download the Beautonomi app</p>
              <p className="text-sm font-light  text-destructive">Scan the QR code to download</p>
            </div>
            </div>
            <Image src={QRCode} alt="" className="h-14 w-14"/>
          </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EventDetails;
