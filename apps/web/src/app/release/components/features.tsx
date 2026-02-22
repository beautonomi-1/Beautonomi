/* eslint-disable @next/next/no-img-element */
"use client";
import React, { useRef, useEffect } from "react";

const Features = () => {
  const videoRef1 = useRef<HTMLVideoElement>(null);
  const videoRef2 = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef1.current) {
      videoRef1.current.play();
    }
    if (videoRef2.current) {
      videoRef2.current.play();
    }
  }, []);

  return (
    <div className="bg-primary pt-32">
      <div className="container">
        <div className="text-center mb-28">
          <h2 className="text-[68px] font-bold text-secondary leading-[60px] mb-7">
            Beauty experiences are better together. <br /> Now booking is, too.
          </h2>
          <p className="text-[26px] font-light text-destructive">
            Discover new features for great beauty experiences.
          </p>
        </div>
        <div className="flex items-center ">
          <div className=" max-w-sm ">
            <h2 className="text-[36px] font-normal leading-10 text-secondary mb-3">
              Shared wishlists give everyone a say
            </h2>
            <p className="text-xl font-light text-destructive mb-10">
              Invite others to vote, add notes, and edit service details—together
              in the same wishlist.
            </p>
          </div>

          <div className="relative w-full h-[742px] overflow-hidden">
            <img
              src="https://a0.muscache.com/im/pictures/airbnb-platform-assets/AirbnbPlatformAssets-M1-2024Launch-DeviceFrames-Images/original/e646696b-2d8a-47c9-abad-f8c35559e21a.png"
              alt="iPhone frame"
              className="absolute inset-0 w-full h-full object-contain z-10"
            />

            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-[345px] h-[720px] rounded-[40px] overflow-hidden bg-black">
                <video
                  ref={videoRef1}
                  className="w-full h-full object-cover rounded-[20px]"
                  autoPlay
                  loop
                  muted
                  playsInline
                >
                  <source
                    src="https://www.w3schools.com/html/mov_bbb.mp4"
                    type="video/mp4"
                  />
                  Your browser does not support the video tag.
                </video>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-between items-center">
          <div className="relative w-full h-[742px] overflow-hidden">
            <img
              src="https://a0.muscache.com/im/pictures/airbnb-platform-assets/AirbnbPlatformAssets-M1-2024Launch-DeviceFrames-Images/original/e646696b-2d8a-47c9-abad-f8c35559e21a.png"
              alt="iPhone frame"
              className="absolute inset-0 w-full h-full object-contain z-10"
            />

            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-[345px] h-[720px] rounded-[40px] overflow-hidden bg-black">
                <video
                  ref={videoRef2}
                  className="w-full h-full object-cover rounded-[20px]"
                  autoPlay
                  loop
                  muted
                  playsInline
                >
                  <source
                    src="https://www.w3schools.com/html/mov_bbb.mp4"
                    type="video/mp4"
                  />
                  Your browser does not support the video tag.
                </video>
              </div>
            </div>
          </div>
          <div className=" max-w-sm mx-auto">
            <h2 className="text-[36px] font-normal leading-10 text-secondary mb-3">
              Trip invitations keep your group in the loop
            </h2>
            <p className="text-xl font-light text-destructive mb-10">
              Send your crew the trip details with beautifully illustrated
              postcards.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Features;