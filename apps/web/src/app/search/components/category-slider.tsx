"use client";
import { useState, useRef } from "react";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import Image from "next/image";
import Waxing from "../../../../public/images/waxing.png";
import Waxing1 from "../../../../public/images/wax.png";
import Pedicure from "../../../../public/images/pedicure.png";
import NailPolish from "../../../../public/images/nail-art.png";
import Massage from "../../../../public/images/massage.png";
import EyeExtension from "../../../../public/images/mascara.png";
import Manicure from "../../../../public/images/manicure (1).png";
import Makeup from "../../../../public/images/makeup (1).png";
import Threading from "../../../../public/images/hair-removal.png";
import HairCutting from "../../../../public/images/hair-cut.png";
import FacialTreatment from "../../../../public/images/facial-treatment.png";
import Facial from "../../../../public/images/facial.png";
import Hairstyling from "../../../../public/images/curling-hair.png";
import BeardGroming from "../../../../public/images/barbershop.png";
import Hairdye from "../../../../public/images/hair-dye (1).png";
import Hairdye1 from "../../../../public/images/hair-dye.png";
import Slider from "react-slick";
import { Button } from "@/components/ui/button";
import { EssentialsButtons } from "@/app/category/components/amenties";

const CategorySlider = () => {
  const sliderRef = useRef<Slider>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState(["wifi", "kitchen"]);

  const handleNext = () => {
    if (sliderRef.current) {
      sliderRef.current.slickNext();
    }
  };

  const toggleOption = (option: string) => {
    setSelectedOptions((prev) =>
      prev.includes(option)
        ? prev.filter((item) => item !== option)
        : [...prev, option]
    );
  };

  const settings = {
    infinite: true,
    slidesToShow: 12,
    slidesToScroll: 1,
    speed: 100,
    arrows: false,
    responsive: [
      { breakpoint: 2340, settings: { slidesToShow: 14 } },
      { breakpoint: 1580, settings: { slidesToShow: 12 } },
      { breakpoint: 1280, settings: { slidesToShow: 8 } },
      { breakpoint: 1024, settings: { slidesToShow: 8 } },
      { breakpoint: 768, settings: { slidesToShow: 6 } },
      { breakpoint: 480, settings: { slidesToShow: 4 } },
    ],
  };

  const Filter = [
    { img: Waxing1, title: "Waxing" },
    { img: NailPolish, title: "Nail Art" },
    { img: Massage, title: "Massage" },
    { img: EyeExtension, title: "Eye Extension" },
    { img: Manicure, title: "Manicure Tools" },
    { img: Makeup, title: "Makeup" },
    { img: Waxing, title: "Waxing" },
    { img: Threading, title: "Threading" },
    { img: HairCutting, title: "Hair Cutting" },
    { img: Facial, title: "Facial" },
    { img: FacialTreatment, title: "Facial Treatment" },
    { img: Hairstyling, title: "Hair Styling" },
    { img: Pedicure, title: "Pedicure" },
    { img: BeardGroming, title: "Beard Grooming" },
    { img: Hairdye, title: "Hair dye" },
    { img: Hairdye1, title: "Hair dye" },
  ];

  return (
    <div className="sticky z-10 top-16 bg-white border-b px-4 ">
      <div className="flex flex-col md:flex-row items-center justify-between">
        <div className="relative max-w-4xl">
        <button
            onClick={handleNext}
            className="absolute -right-0 top-12 transform -translate-y-1/2 bg-white border h-8 w-8 rounded-full flex items-center justify-center z-10 hover:bg-gray-100 transition-all duration-200 hover:scale-105 hover:shadow-md"
          >
            <ChevronRightIcon className="h-5 w-5 text-gray-500" />
          </button>
          <Slider ref={sliderRef} {...settings} className="mt-6">
            {Filter.map((item, index) => (
              <div key={index} className="px-4">
                {" "}
                <div className="flex flex-col items-center justify-center cursor-pointer group p-2 mx-4 h-full">
                  <div className="flex flex-col items-center justify-center min-w-40 h-full">
                    <Image
                      src={item.img}
                      alt={item.title}
                      className="transition-all duration-300 group-hover:scale-110 h-8 w-8" // Adjust size as needed
                    />
                    <p className="font-light text-xs text-gray-700 mt-1 transition-all duration-300 group-hover:text-black text-center">
                      {item.title}
                    </p>
                  </div>
                  <span className="border-b-2 border-transparent group-hover:border-gray-300 w-16 mt-1 transition-all duration-300"></span>
                </div>
              </div>
            ))}
          </Slider>
          <button
            onClick={handleNext}
            className="absolute -right-0 top-12 transform -translate-y-1/2 bg-white border h-8 w-8 rounded-full flex items-center justify-center z-10 hover:bg-gray-100 transition-all duration-200 hover:scale-105 hover:shadow-md"
          >
            <ChevronRightIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <div className="w-full md:w-1/4 flex flex-col md:flex-row items-center justify-end gap-4">
          <div>
            <>
              <Button
                variant="outline"
                className="w-full md:w-auto h-12 rounded-full border-gray-300 hover:border-gray-400 transition-all duration-200"
                onClick={() => setIsModalOpen(true)}
              >
                <Image
                  src="/images/filters.svg"
                  alt=""
                  width={16}
                  height={16}
                  className="h-4 w-4 mr-2"
                />
                Filters
              </Button>

              <EssentialsButtons
                showMore={true}
                selectedOptions={selectedOptions}
                toggleOption={toggleOption}
                isOpen={isModalOpen}
                onOpenChange={setIsModalOpen}
              />
            </>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CategorySlider;

function ChevronRightIcon(
  props: React.SVGProps<SVGSVGElement>
) {
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
