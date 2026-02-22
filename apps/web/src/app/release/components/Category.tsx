/* eslint-disable @next/next/no-img-element */
"use client";
import React, { useRef, useState } from "react";

const Category = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="container">
      <div className="mb-32">
        <div className="text-center max-w-sm mx-auto">
          <h2 className="text-[36px] font-normal  text-secondary mb-3 leading-10">
            Icons are in a category of their own
          </h2>
          <p className="text-xl font-light  text-destructive mb-10">
            Find the greatest names from music, film, TV, art, sports, and more,
            all in one place.
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
                controls
              >
                <source
                  src="https://www.w3schools.com/html/mov_bbb.mp4"
                  type="video/mp4"
                />
                Your browser does not support the video tag.
              </video>
            </div>
          </div>

          <div className="absolute bottom-6 transform left-96 z-20">
            <PlayPauseIcon
              isPlaying={isPlaying}
              onClick={togglePlayPause}
              className="text-white text-3xl cursor-pointer bg-gray-800 p-2 rounded-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Category;

const PlayPauseIcon: React.FC<{
  isPlaying: boolean;
  className?: string;
  onClick: () => void;
}> = ({ isPlaying, ...props }) => {
  return isPlaying ? (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  ) : (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
};
