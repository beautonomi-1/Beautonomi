/* eslint-disable @next/next/no-img-element */
"use client";
import React, { useRef, useEffect } from "react";

const UserInteraction = () => {
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
    <div className="bg-primary pb-24">
      <div className="container">
        <div className=" ">
          <div className="grid grid-cols-2 gap-5 ">
            <div className="bg-white pt-14 rounded-3xl">
              <div className="text-center max-w-md mx-auto">
                <h2 className="text-[28px] font-normal leading-10 text-secondary mb-3">
                  Redesigned Messages {"that'll"} make you happy
                </h2>
                <p className="text-xl font-light text-destructive mb-10">
                  Guests and Hosts can connect—and react with emojis—in one
                  group chat. AI-suggested quick replies help Hosts respond
                  faster, too.{" "}
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
            <div className="bg-white pt-14 rounded-3xl">
              <div className="text-center max-w-md mx-auto">
                <h2 className="text-[28px] font-normal leading-10 text-secondary mb-3">
                  Redesigned Messages {"that'll"} make you happy
                </h2>
                <p className="text-xl font-light text-destructive mb-10">
                  Guests and Hosts can connect—and react with emojis—in one
                  group chat. AI-suggested quick replies help Hosts respond
                  faster, too.{" "}
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserInteraction;