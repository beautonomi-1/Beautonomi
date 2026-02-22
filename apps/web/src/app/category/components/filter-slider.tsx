"use client";
import { useRef } from "react";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import Image from "next/image";
import img1 from "../../../../public/icons/1.1.png";
import img2 from "../../../../public/icons/1.2.jpg";
import img3 from "../../../../public/icons/1.3.jpg";
import img4 from "../../../../public/icons/1.4.jpg";
import img5 from "../../../../public/icons/1.5.jpg";
import img6 from "../../../../public/icons/1.66.jpg";
import img7 from "../../../../public/icons/1.7.jpg";
import img8 from "../../../../public/icons/1.8.jpg";
import img9 from "../../../../public/icons/1.9.jpg";
import img10 from "../../../../public/icons/1.10.jpg";
import img11 from "../../../../public/icons/1.11.jpg";
import img12 from "../../../../public/icons/1.12.jpg";
import img13 from "../../../../public/icons/1.13.jpg";
import img14 from "../../../../public/icons/1.14.jpg";
import img15 from "../../../../public/icons/1.15.jpg";
import img16 from "../../../../public/icons/1.16.jpg";
import img17 from "../../../../public/icons/1.17.jpg";
import img18 from "../../../../public/icons/1.18.jpg";
import img19 from "../../../../public/icons/1.19.jpg";
import img20 from "../../../../public/icons/1.20.jpg";
import img21 from "../../../../public/icons/1.21.jpg";
import img22 from "../../../../public/icons/1.22.jpg";
import img23 from "../../../../public/icons/1.23.jpg";
import img24 from "../../../../public/icons/1.24.jpg";
import Slider from "react-slick";

const FilterSlider = () => {
    const sliderRef = useRef<any>(null);
  
    const handleNext = () => {
      if (sliderRef.current) {
        sliderRef.current.slickNext();
      }
    };
  
    const handlePrev = () => {
      if (sliderRef.current) {
        sliderRef.current.slickPrev();
      }
    };
  
    const settings = {
      infinite: true,
      slidesToShow: 12,
      slidesToScroll: 4,
      speed: 500,
      arrows: false,
      responsive: [
        {
            breakpoint: 2340,
            settings: {
              slidesToShow: 20,
            },
          },
        {
            breakpoint: 1580,
            settings: {
              slidesToShow: 12,
            },
          },
          {
            breakpoint: 1280,
            settings: {
              slidesToShow: 12,
            },
          },
        {
          breakpoint: 1024,
          settings: {
            slidesToShow: 8,
          },
        },
        {
          breakpoint: 768,
          settings: {
            slidesToShow: 6,
          },
        },
        {
          breakpoint: 480,
          settings: {
            slidesToShow: 4,
          },
        },
      ],
    };

  const Filter = [
    { img: img1, title: "Cabins" },
    { img: img2, title: "Bread & Breakfast" },
    { img: img3, title: "Tiny Homes" },
    { img: img4, title: "Beachfront" },
    { img: img5, title: "National Park" },
    { img: img6, title: "Farms" },
    { img: img7, title: "Lake" },
    { img: img8, title: "Off-the-grid" },
    { img: img9, title: "sjkad" },
    { img: img10, title: "sjkad" },
    { img: img11, title: "sjkad" },
    { img: img12, title: "sjkad" },
    { img: img13, title: "sjkad" },
    { img: img14, title: "sjkad" },
    { img: img15, title: "sjkad" },
    { img: img16, title: "sjkad" },
    { img: img17, title: "sjkad" },
    { img: img18, title: "sjkad" },
    { img: img19, title: "sjkad" },
    { img: img20, title: "sjkad" },
    { img: img21, title: "sjkad" },
    { img: img22, title: "sjkad" },
    { img: img23, title: "sjkad" },
    { img: img24, title: "sjkad" },
  ];

  return (
    <div className="relative max-w-[2340px] mx-auto">
      <div className="overflow-hidden px-16"> 
        <Slider ref={sliderRef} {...settings}>
          {Filter.map((item, index) => (
            <div key={index} className="px-2 py-2">
              <div className="flex flex-col items-center justify-center cursor-pointer group p-2 h-full">
                <div className="flex flex-col items-center justify-center min-w-40 h-full">
                  <Image
                    src={item.img}
                    alt={item.title}
                    className="w-6 transition-all duration-300 group-hover:grayscale"
                  />
                  <p className="font-light text-xs text-gray-700 mt-1 transition-all duration-300 group-hover:text-black text-center">
                    {item.title}
                  </p>
                </div>
                <span className="border-b-2 border-transparent group-hover:border-gray-300 w-16 mt-1"></span>
              </div>
            </div>
          ))}
        </Slider>
      </div>
      <button
        onClick={handlePrev}
        className="absolute left-10 top-1/2 transform -translate-y-5 bg-white border h-8 w-8 rounded-full flex items-center justify-center z-10 hover:bg-gray-100 transition-colors duration-200 hover:scale-105 hover:shadow"
      >
        <ChevronLeftIcon className="h-5 w-5 text-gray-500" />
      </button>
      <button
        onClick={handleNext}
        className="absolute right-12 top-1/2 transform -translate-y-1/2 bg-white border h-8 w-8 rounded-full flex items-center justify-center z-10 hover:bg-gray-100 transition-colors duration-200 hover:scale-105 hover:shadow"
      >
        <ChevronRightIcon className="h-5 w-5 text-gray-500" />
      </button>
    </div>
  );
};

export default FilterSlider;

function ChevronLeftIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
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
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
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
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
