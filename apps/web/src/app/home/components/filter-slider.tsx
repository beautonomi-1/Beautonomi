"use client";
import { useRef, useEffect } from "react";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import Image, { StaticImageData } from "next/image";
import Slider from "react-slick";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { EssentialsButtons } from "@/app/category/components/amenties";
import { Button } from "@/components/ui/button";

// Import all images here
import Foundation from "../../../../public/images/icons8-foundation-makeup-80.svg";
import HairDryer from "../../../../public/images/icons8-hair-dryer-80.svg";
import Makeup from "../../../../public/images/icons8-makeup-64 (1).svg";
import Waxing from "../../../../public/images/icons8-waxing-64.svg";
import cleaning from "../../../../public/images/icons8-woman-facewash-cleasing-face-beauty-cleanser-makeup-remover-64.svg";
import FacialKit from "../../../../public/images/icons8-fast-moving-consumer-goods-50.svg";
import Threading from "../../../../public/images/icons8-eyebrow-64.svg";
import EyeShadow from "../../../../public/images/icons8-eye-shadows-50.svg";
import Facial from "../../../../public/images/icons8-cleansing-80.svg";
import HairCurler from "../../../../public/images/hair-curler_15537214.svg";
import HairCutting from "../../../../public/images/hair-cutting_7211660.svg";
import FacialMask from "../../../../public/images/facial-mask_4506711.svg";
import Hairstyling from "../../../../public/images/hairstylist_6672954.svg";
import BeardGroming from "../../../../public/images/cut_11431151.svg";
import Hairdye from "../../../../public/images/coloring_5498630.svg";

import FoundationPink from "../../../../public/images/icons8-foundation-makeup-80-pink.svg";
import HairDryerPink from "../../../../public/images/icons8-hair-dryer-80 - Copy.svg";
import MakeupPink from "../../../../public/images/icons8-makeup-64 (1) - Copy.svg";
import WaxingPink from "../../../../public/images/icons8-waxing-64 - Copy.svg";
import cleaningPink from "../../../../public/images/icons8-woman-facewash-cleasing-face-beauty-cleanser-makeup-remover-64 - Copy.svg";
import FacialKitPink from "../../../../public/images/icons8-fast-moving-consumer-goods-50 - Copy.svg";
import ThreadingPink from "../../../../public/images/icons8-eyebrow-64 - Copy.svg";
import EyeShadowPink from "../../../../public/images/icons8-eye-shadows-50 - Copy.svg";
import FacialPink from "../../../../public/images/icons8-cleansing-80 - Copy.svg";
import HairCurlerPink from "../../../../public/images/hair-curler_15537214 - Copy.svg";
import HairCuttingPink from "../../../../public/images/hair-cutting_7211660 - Copy.svg";
import FacialMaskPink from "../../../../public/images/facial-mask_4506711 - Copy.svg";
import HairstylingPink from "../../../../public/images/hairstylist_6672954 - Copy.svg";
import BeardGromingPink from "../../../../public/images/cut_11431151 - Copy.svg";
import HairdyePink from "../../../../public/images/coloring_5498630 - Copy.svg";

interface FilterItemProps {
  item: {
    img: StaticImageData;
    hoverImg: StaticImageData;
    title: string;
    link: string;
  };
  index: number;
  isActive: boolean;
}

const FilterSlider = () => {
  const sliderRef = useRef<any>(null);
  const pathname = usePathname();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState(["wifi", "kitchen"]);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsSmallScreen(window.innerWidth < 640);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);

    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

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

  const toggleOption = (option: string) => {
    setSelectedOptions((prev: string[]) =>
      prev.includes(option)
        ? prev.filter((item: string) => item !== option)
        : [...prev, option]
    );
  };

  const settings = {
    infinite: true,
    slidesToShow: 8,
    slidesToScroll: 4,
    speed: 500,
    arrows: false,
    responsive: [
      {
        breakpoint: 2340,
        settings: {
          slidesToShow: 9,
        },
      },
      {
        breakpoint: 1580,
        settings: {
          slidesToShow: 8,
        },
      },
      {
        breakpoint: 1280,
        settings: {
          slidesToShow: 8,
        },
      },
      {
        breakpoint: 1024,
        settings: {
          slidesToShow: 7,
        },
      },
      {
        breakpoint: 768,
        settings: {
          slidesToShow: 6,
        },
      },
    ],
  };

  const Filter = [
    {
      img: Foundation,
      hoverImg: FoundationPink,
      title: "Foundation",
      link: "/category/foundation",
    },
    {
      img: HairDryer,
      hoverImg: HairDryerPink,
      title: "Hair Dryer",
      link: "/category/hair-dryer",
    },
    {
      img: Makeup,
      hoverImg: MakeupPink,
      title: "Makeup",
      link: "/category/makeup",
    },
    {
      img: Waxing,
      hoverImg: WaxingPink,
      title: "Waxing",
      link: "/category/waxing",
    },
    {
      img: cleaning,
      hoverImg: cleaningPink,
      title: "Cleaning",
      link: "/category/cleaning",
    },
    {
      img: FacialKit,
      hoverImg: FacialKitPink,
      title: "FacialKit",
      link: "/category/eye-extension",
    },
    {
      img: Threading,
      hoverImg: ThreadingPink,
      title: "Threading",
      link: "/category/threading",
    },
    {
      img: HairCutting,
      hoverImg: HairCuttingPink,
      title: "Hair Cutting",
      link: "/category/hair-cutting",
    },
    {
      img: Facial,
      hoverImg: FacialPink,
      title: "Facial",
      link: "/category/facial",
    },
    {
      img: FacialMask,
      hoverImg: FacialMaskPink,
      title: "Facial Treatment",
      link: "/category/facial-treatment",
    },
    {
      img: Hairstyling,
      hoverImg: HairstylingPink,
      title: "Hair Styling",
      link: "/category/hair-styling",
    },
    {
      img: BeardGroming,
      hoverImg: BeardGromingPink,
      title: "Beard Grooming",
      link: "/category/beard-grooming",
    },
    {
      img: Hairdye,
      hoverImg: HairdyePink,
      title: "Hair Dye",
      link: "/category/hair-dye",
    },
    {
      img: HairCurler,
      hoverImg: HairCurlerPink,
      title: "Hair Curler",
      link: "/category/hair-curler",
    },
    {
      img: EyeShadow,
      hoverImg: EyeShadowPink,
      title: "Eye Shadow",
      link: "/category/eye-shadow",
    },
  ];

  const FilterItem = ({ item, index, isActive }: FilterItemProps) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
      <div
        key={index}
        className={`px-2 ${isSmallScreen ? "inline-block" : ""}`}
      >
        <Link
          href={item.link}
          className={`${
            isActive
              ? "border-b-muted text-muted"
              : "border-b-transparent hover:border-gray-300"
          } flex flex-col items-center group border-b-2 justify-center cursor-pointer group px-2 pt-0 h-full`}
          aria-label={item.title}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="flex flex-col items-center justify-center cursor-pointer group px-2 py-0 sm:py-2">
            <div className="flex flex-col items-center justify-center min-w-24 sm:min-w-40 h-full px-3 ">
              <Image
                src={isActive || isHovered ? item.hoverImg : item.img}
                alt={item.title}
                width={24}
                height={24}
                className="w-6 transition-all duration-300 group-hover:scale-110"
              />
              <p
                className={`font-light text-xs mt-1 transition-all duration-300 text-center
                ${
                  isActive
                    ? "text-muted font-medium"
                    : isHovered
                    ? "text-muted font-medium"
                    : "text-gray-500 group-hover:text-black group-hover:font-medium"
                }`}
              >
                {item.title}
              </p>
            </div>
          </div>
        </Link>
      </div>
    );
  };

  return (
    <div className="px-0 pb-2 overflow-x-hidden">
      <div className="flex justify-between flex-col xl:flex-row max-w-[2340px] mx-auto gap-2">
        <div
          className={`relative w-full max-w-4xl md:max-w-4xl lg:max-w-7xl 2xl:max-w-[1180px] xl:max-w-[1000px] ${
            isSmallScreen ? "overflow-x-auto" : ""
          }`}
        >
          <div
            className={`${isSmallScreen ? "flex" : "overflow-hidden mr-16 ml-8"}`}
          >
            {isSmallScreen ? (
              Filter.map((item, index) => (
                <FilterItem
                  key={index}
                  item={item}
                  index={index}
                  isActive={item.link === pathname}
                />
              ))
            ) : (
              <Slider ref={sliderRef} {...settings}>
                {Filter.map((item, index) => (
                  <FilterItem
                    key={index}
                    item={item}
                    index={index}
                    isActive={item.link === pathname}
                  />
                ))}
              </Slider>
            )}
          </div>
          {!isSmallScreen && (
            <>
              <button
                onClick={handlePrev}
                className="absolute left-5 lg:left-9 top-1/2 transform -translate-y-5 bg-white border h-8 w-8 rounded-full flex items-center justify-center z-10 hover:bg-gray-100 transition-colors duration-200 hover:scale-105 hover:shadow group"
              >
                <ChevronLeftIcon className="h-5 w-5 text-gray-500 group-hover:text-gray-700" />
              </button>
              <button
                onClick={handleNext}
                className="absolute right-6 lg:right-[62px] top-1/2 transform -translate-y-1/2 bg-white border h-8 w-8 rounded-full flex items-center justify-center z-10 hover:bg-gray-100 transition-colors duration-200 hover:scale-105 hover:shadow group"
              >
                <ChevronRightIcon className="h-5 w-5 text-gray-500 group-hover:text-gray-700" />
              </button>
            </>
          )}
        </div>
        <div className="hidden xl:flex w-full xl:w-1/4 flex-row items-center justify-end gap-2 md:gap-4 pr-6 lg:pr-[54px] z-20">
          <div>
            <Button
              variant="outline"
              className="text-xs md:text-sm h-9 md:h-12 rounded-full border-gray-300 hover:border-gray-400 transition-all duration-200 group"
              onClick={() => setIsModalOpen(true)}
            >
              <Image
                src="/images/filters.svg"
                alt=""
                width={16}
                height={16}
                className="h-4 w-4 mr-2 group-hover:scale-110"
              />
              <span className="group-hover:text-gray-700">Filters</span>
            </Button>

            <EssentialsButtons
              showMore={true}
              selectedOptions={selectedOptions}
              toggleOption={toggleOption}
              isOpen={isModalOpen}
              onOpenChange={setIsModalOpen}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilterSlider;

function ChevronLeftIcon(
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
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

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
