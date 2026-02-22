"use client";
import Image from "next/image";
import React, { useRef, useState, useEffect } from "react";
import Image1 from "./../../../../public/images/3364b95e-2e91-4fac-9cd2-4fe7874f1495.svg";
import Image2 from "./../../../../public/images/49d984fd-6912-4caa-b702-ae9852c53121.svg";
import Logo from './../../../../public/images/logo-black.svg'

const Imagination: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true); 

  useEffect(() => {
    const playVideo = async () => {
      try {
        await videoRef.current?.play();
        setIsPlaying(true);
      } catch (error) {
        console.error("Autoplay prevented:", error);
        setIsPlaying(false); // Autoplay failed, video isn't playing
      }
    };

    playVideo();
  }, []);

  const handlePlayPause = () => {
    if (isPlaying) {
      videoRef.current?.pause();
    } else {
      videoRef.current?.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleMuteUnmute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  return (
    <div className="mb-44">
      <div className="p-5">
        <Image src={Logo} alt=""/>
        </div>
    <div className="container">
    <div className="">
        <div>
          <Image src={Image1} alt="" className="mx-auto h-8 mb-12" />
        </div>

        <div className="relative mt-6 mb-14">
          <video
            ref={videoRef}
            width="9999"
            controls={false}
            className="mx-auto w-full rounded-3xl"
            muted={isMuted} // Start muted to allow autoplay
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            autoPlay
          >
            <source
              src="https://www.w3schools.com/html/mov_bbb.mp4"
              type="video/mp4"
            />
            Your browser does not support the video tag.
          </video>

          <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
            <Image src={Image2} alt="" className="h-44 w-[400px]" />
          </div>

          <div className="absolute bottom-0 left-0 p-4 flex space-x-4">
            <PlayPauseIcon
              isPlaying={isPlaying}
              onClick={handlePlayPause}
              className="h-7 w-7 cursor-pointer"
            />
            <MuteUnmuteIcon
              isMuted={isMuted}
              onClick={handleMuteUnmute}
              className="h-7 w-7 cursor-pointer"
            />
          </div>
        </div>
      </div>
      <div className="text-center mb-14">
        <p className="text-[22px] font-normal  text-destructive">
          Discover a new category of extraordinary experiences.
        </p>
        <p className="text-[22px] font-light  text-destructive">
          Plus better ways to travel together.
        </p>
      </div>
    </div>
    </div>
  );
};

export default Imagination;

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

const MuteUnmuteIcon: React.FC<{
  isMuted: boolean;
  className?: string;
  onClick: () => void;
}> = ({ isMuted, ...props }) => {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      {isMuted ? (
        <>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 9L4 14H2V10h2l5-5v14l-5-5h-2v4h2l5 5V9z"
          />
          <line
            x1="18"
            y1="6"
            x2="6"
            y2="18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11 5L6 9H3v6h3l5 4V5z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.07 4.93A10 10 0 0022 12a10 10 0 01-2.93 7.07M15.54 8.46a5 5 0 010 7.07"
          />
        </>
      )}
    </svg>
  );
};
