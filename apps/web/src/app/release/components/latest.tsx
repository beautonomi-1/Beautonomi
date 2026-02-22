/* eslint-disable @next/next/no-img-element */
"use client";
import React, { useRef, useEffect } from "react";

const Latest = () => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play();
    }
  }, []);

  return (
    <div className="container">
      <div className="mb-32">
        <div className="text-center max-w-sm mx-auto">
          <h2 className="text-[36px] font-normal leading-10 text-secondary mb-3">
            Get the latest on the greatest
          </h2>
          <p className="text-xl font-light text-destructive mb-10">
            New Icons drop throughout the year. Be notified when they go live.  
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
                ref={videoRef}
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
  );
};

export default Latest;