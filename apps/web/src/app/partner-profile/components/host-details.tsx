"use client";
import React, { useState } from "react";
import Image from "next/image";
import UserImage from "./../../../../public/images/8aa5cbca-b607-4a45-bd0c-2d63a663aa30.webp";
import Door from "./../../../../public/images/door.svg";
import CalendarImage from "./../../../../public/images/calendar.svg";
import Trophy from "./../../../../public/images/4d090f93-f9a5-4f06-95e4-ca737c0d0ab5.png";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import Arrow from "./../../../../public/images/Arrow.svg";
import CloseIcon from "./../../../../public/images/close-icon.svg";
import Pool from "./../../../../public/images/pool.svg";
import WorkSpace from "./../../../../public/images/work-space(1).svg";
import Carbonmonoxide from "./../../../../public/images/no-carbonmonoxide.svg";
import View from "./../../../../public/images/view.svg";
import Kitchen from "./../../../../public/images/location(1).svg";
import Elevator from "./../../../../public/images/elevator.svg";
import SkylineView from "./../../../../public/images/skyline-view(1).svg";
import Wifi from "./../../../../public/images/wifi(1).svg";
import Car from "./../../../../public/images/car.svg";
import LED from "./../../../../public/images/LED.svg";
import HairDryer from "./../../../../public/images/hair-dryer.svg";
import cleaningProduct from "./../../../../public/images/cleaning-products.svg";
import Shampo from "./../../../../public/images/shampo.svg";
import BodySoap from "./../../../../public/images/body-soap.svg";
import HotWater from "./../../../../public/images/hot-water.svg";
import Washer from "./../../../../public/images/washer.svg";
import Essentials from "./../../../../public/images/essentials.svg";
import hanger from "./../../../../public/images/hanger.svg";
import BedLinens from "./../../../../public/images/bed-linens.svg";
import Pillow from "./../../../../public/images/pillow.svg";
import Lamp from "./../../../../public/images/lamp.svg";
import Iron from "./../../../../public/images/iron.svg";
import Locker from "./../../../../public/images/locker.svg";
import Wardrobe from "./../../../../public/images/wardrobe.svg";
import Gym from "./../../../../public/images/gym.svg";
import SnowFlakes from "./../../../../public/images/snow-flake.svg";
import SmokeAlarm from "./../../../../public/images/smoke-alarm.svg";
import FireExtinguisher from "./../../../../public/images/fire-extinguisher.svg";
import Refrigerator from "./../../../../public/images/refrigerator.svg";
import Microwave from "./../../../../public/images/microwave.svg";
import Dishes from "./../../../../public/images/dishes.svg";
import Stove from "./../../../../public/images/stove.svg";
import Oven from "./../../../../public/images/oven.svg";
import Kettle from "./../../../../public/images/kettle.svg";
import CoffeeMaker from "./../../../../public/images/coffee-maker.svg";
import WineGlass from "./../../../../public/images/wine-glass.svg";
import BakingSheet from "./../../../../public/images/baking-sheet.svg";
import DiningTable from "./../../../../public/images/dining-table.svg";
import Stairs from "./../../../../public/images/no-stairs.svg";
import Key from "./../../../../public/images/key.svg";
import SmartLock from "./../../../../public/images/smart-lock.svg";
import NoCamera from "./../../../../public/images/no-camera.svg";
import NoHeating from "./../../../../public/images/no-heating.svg";
import Search from "./../../../../public/images/search-alt-1-svgrepo-com.svg";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import Diamond from "./../../../../public/images/diamond.svg";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import Ratings from "./ratings";

const _guestDetails = [
  { label: "Hair Care", separator: "•" },
  { label: "Face Care", separator: "•" },
  { label: "Menicure", separator: "•" },
  { label: "Pedicure" },
];

const sections = [
  {
    imageSrc: Trophy,
    title: "Top 1% of salons",
    description:
      "This salons is one of the highest ranked based on ratings, reviews, and reliability.",
  },
  {
    imageSrc: Door,
    title: "Self check-in",
    description: "Check yourself in with the smartlock.",
  },
  {
    imageSrc: CalendarImage,
    title: "Free cancellation before Sep 4",
    description: "Get a full refund if you change your mind.",
  },
];

const infoParagraphs = [
  "Enjoy your stay in heart of the city. This studio apartment is located just 10 minutes walk from Dubai mall and Burj Khalifa.",
  "It's quiet, located on the high floor, and has a beautiful view.",
  "In front of the building you will find a supermarket which is open 24/7.",
];

const places = [
  {
    imageSrc: FacialKit,
    title: "Facial Kit",
},
{
    imageSrc: Threading,
    title: "Threading",
},
{
    imageSrc: EyeShadow,
    title: "EyeShadow",
},
{
    imageSrc: Facial,
    title: "Facial",
},
{
    imageSrc: HairCurler,
    title: "Hair Curler",
},
{
    imageSrc: HairCutting,
    title: "Hair Cutting",
},
{
    imageSrc: Hairstyling,
    title: "Hair styling",
},
{
    imageSrc: BeardGroming,
    title: "Beard Groming",
},
{
    imageSrc: FacialMask,
    title: "FacialMask",
},
{
    imageSrc: Hairdye,
    title: "Hair dye",
},

];
const place = [
  {
    popupContent: [
      {
        title: "Scenic views",
        items: [
          { text: "City skyline view", image: SkylineView },
          { text: "Canal view", image: View },
        ],
      },
      {
        title: "Bathroom",
        items: [
          { text: "Hair dryer", image: HairDryer },
          { text: "Cleaning products", image: cleaningProduct },
          { text: "Shampoo", image: Shampo },
          { text: "Conditioner", image: Shampo },
          { text: "Body soap", image: BodySoap },
          { text: "Hot water", image: HotWater },
          { text: "Shower gel", image: HotWater },
        ],
      },
      {
        title: "Bedroom and laundry",
        items: [
          { text: "Washer", image: Washer },
          { text: "Free dryer – In unit", image: Washer },
          { text: "Essentials", image: Essentials },
          { text: "Hangers", image: hanger },
          { text: "Bed linens", image: BedLinens },
          { text: "Extra pillows and blankets", image: Pillow },
          { text: "Room-darkening shades", image: Lamp },
          { text: "Iron", image: Iron },
          { text: "Drying rack for clothing", image: hanger },
          { text: "Safe", image: Locker },
          { text: "Clothing storage: wardrobe", image: Wardrobe },
        ],
      },
      {
        title: "Entertainment",
        items: [
          { text: "65 inch HDTV", image: LED },
          { text: "Exercise equipment", image: Gym },
        ],
      },
      {
        title: "Heating and cooling",
        items: [{ text: "Air conditioning", image: SnowFlakes }],
      },
      {
        title: "Home safety",
        items: [
          { text: "Smoke alarm", image: SmokeAlarm },
          { text: "Fire extinguisher", image: FireExtinguisher },
        ],
      },
      {
        title: "Internet and office",
        items: [
          { text: "Wifi", image: Wifi },
          { text: "Dedicated workspace", image: WorkSpace },
        ],
      },
      {
        title: "Kitchen and dining",
        items: [
          { text: "Kitchen", image: Kitchen },
          { text: "Refrigerator", image: Refrigerator },
          { text: "Microwave", image: Microwave },
          { text: "Cooking basics", image: Kitchen },
          { text: "Dishes and silverware", image: Dishes },
          { text: "Freezer", image: Refrigerator },
          { text: "Induction stove", image: Stove },
          { text: "Oven", image: Oven },
          { text: "Hot water kettle", image: Kettle },
          { text: "Coffee maker: Nespresso", image: CoffeeMaker },
          { text: "Wine glasses", image: WineGlass },
          { text: "Baking sheet", image: BakingSheet },
          { text: "Dining table", image: DiningTable },
          { text: "Coffee", image: CoffeeMaker },
        ],
      },
      {
        title: "Outdoor",
        items: [
          { text: "Outdoor furniture", image: DiningTable },
          { text: "Outdoor dining area", image: DiningTable },
        ],
      },
      {
        title: "Parking and facilities",
        items: [
          {
            text: "Free residential garage on premises – 1 space",
            image: Car,
          },
          { text: "Pool", image: Pool },
          { text: "Elevator", image: Elevator },
          { text: "Gym in building", image: Gym },
          { text: "Single level home", image: Stairs },
        ],
      },
      {
        title: "Services",
        items: [
          { text: "Long term stays allowed", image: Calendar },
          { text: "Self check-in", image: Key },
          { text: "Smart lock", image: SmartLock },
        ],
      },
      {
        title: "Not included",
        items: [
          { text: "Exterior security cameras on property", image: NoCamera },
          { text: "Carbon monoxide alarm", image: Carbonmonoxide },
          { text: "Heating", image: NoHeating },
        ],
      },
    ],
  },
];

const reviewInfo = [
  {
    type: "text",
    content:
      "Enjoy your stay in heart of the city. This studio apartment is located just 10 minutes walk from Dubai mall and Burj Khalifa.",
  },
  {
    type: "text",
    content: "Its quiet, located on the high floor, and has beautiful view.",
  },
  {
    type: "text",
    content:
      "In front of the building you will find supermarket which is open 24/7.",
  },
  {
    type: "section",
    title: "The space",
    content:
      "In front of the building you will find supermarket, pharmacy, alcohol store, coffee shop and couple small restaurants.",
  },
  {
    type: "text",
    content: "Dubai mall is around 10 min walk away.",
  },
  {
    type: "text",
    content: "Metro station is around 20 min walk away or 7 min by taxi.",
  },
  {
    type: "text",
    content: "Airport is 20 min by taxi.",
  },
  {
    type: "text",
    content:
      "Gym & pool are located on the top floor (HC button in the elevator).",
  },
  {
    type: "section",
    title: "Client access",
    content: "You will receive passcode one day prior to your check in day.",
  },
  {
    type: "link",
    content: "Learn more in our Help Center",
    href: "/",
  },
];

const testimonials = [
  {
    id: 1,
    name: "Echrak",
    location: "Montreal, Canada",
    date: "April 2024",
    duration: "Stayed one night",
    text: "After a short stay in Abu Dhabi, given all the qualities of the apartment and its Beauty Partner we did not hesitate to return to the apartment to finish our trip with peace of mind.",
    image: UserImage,
  },
  {
    id: 2,
    name: "Echrak",
    location: "Montreal, Canada",
    date: "April 2024",
    duration: "Stayed one night",
    text: "After a short stay in Abu Dhabi, given all the qualities of the apartment and its Beauty Partner we did not hesitate to return to the apartment to finish our trip with peace of mind.",
    image: UserImage,
  },
  {
    id: 3,
    name: "Echrak",
    location: "Montreal, Canada",
    date: "April 2024",
    duration: "Stayed one night",
    text: "After a short stay in Abu Dhabi, given all the qualities of the apartment and its Beauty Partner we did not hesitate to return to the apartment to finish our trip with peace of mind.",
    image: UserImage,
  },
  {
    id: 4,
    name: "Echrak",
    location: "Montreal, Canada",
    date: "April 2024",
    duration: "Stayed one night",
    text: "After a short stay in Abu Dhabi, given all the qualities of the apartment and its Beauty Partner we did not hesitate to return to the apartment to finish our trip with peace of mind.",
    image: UserImage,
  },
];
const _priceDetails = [
  { label: "$68.88 x 14 nights", amount: "$953" },
  { label: "Beautonomi Service fee", amount: "$148" },
];

const ProviderDetails = () => {
  const [activePopup, setActivePopup] = useState(null);
  const [showReviewInfoPopup, setShowReviewInfoPopup] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [TestimonialPopup, setTestimonialPopup] = useState(false);
  const [showServiceFeePopup, setShowServiceFeeePopup] = useState(false);
  const [selectedItem, setSelectedItem] = useState("most recent");
  const [_isModalOpen, setIsModalOpen] = useState(false);

  const _handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const _handleShowMoreClick = () => {
    setTestimonialPopup(true);
  };

  const handleCloseTestimonialPopup = () => {
    setTestimonialPopup(false);
  };

  const handleChange = (value: React.SetStateAction<string>) => {
    setSelectedItem(value);
  };

  const handleShowPopup = () => {
    //@ts-ignore 
    setActivePopup("All Amenities");
  };

  const handleClosePopup = () => {
    setActivePopup(null);
  };

  const handleShowReviewInfoClick = () => {
    setShowReviewInfoPopup(true);
  };

  const handleCloseReviewInfoPopup = () => {
    setShowReviewInfoPopup(false);
  };
    const [_checkInDate, setCheckInDate] = useState(null);
    const [_checkOutDate, setCheckOutDate] = useState(null);
  
    const _handleCheckInDateChange = (date: React.SetStateAction<null>) => {
      setCheckInDate(date);
    };
  
    const _handleCheckOutDateChange = (date: React.SetStateAction<null>) => {
      setCheckOutDate(date);
    };
  const getPopupContent = () => {
    if (activePopup === "All Amenities") {
      return place[0].popupContent;
    }
    return [];
  };
  

    
  return (
    <div className="max-w-[2340px] mx-auto px-10 mt-14">
      <div className="flex justify-between items-start border-b lg:border-none pb-0 md:pb-10 lg:pb-0 mb-10 lg:mb-0">
        <div
          className="border-none lg:border-b mb-8 pb-3 md:pb-12 max-w-2xl  "
        >
          {/* <h2 className="text-base sm:text-[22px] font-normal Beautonomi-semibold text-secondary">
          Provider
          </h2>
          <div className="flex items-center text-base font-light  text-secondary mb-6">
            {_guestDetails.map((detail, index) => (
              <React.Fragment key={index}>
                <span className="text-sm">{detail.label}</span>
                {detail.separator && (
                  <span className="mx-2 text-xl">{detail.separator}</span>
                )}
              </React.Fragment>
            ))}
          </div> */}
          {/* <div className="border p-4 flex justify-between items-center rounded-xl mb-10 cursor-pointer">
          <div onClick={handleShowMoreClick} className="hidden lg:hidden">
              <p className="text-[22px] font-light  text-secondary">
                5.0
              </p>
              <Image src={RatingStars} alt="Rating stars" className="w-20" />
            </div>
            <div
              className="flex items-center justify-center mb-2"
              onClick={handleShowMoreClick}
            >
              <div className="w-10 h-10">
                <Image src={Image2} alt="Image 2" className="object-cover" />
              </div>
              <p className="text-lg font-light  text-secondary">
                Partner favourite
              </p>
              <div className="w-10 h-10">
                <Image src={Image1} alt="Image 1" className="object-cover" />
              </div>
            </div>
            <p
              className="hidden lg:block text-base font-light  text-secondary max-w-60"
              onClick={handleShowMoreClick}
            >
              One of the most loved beauty partners on Beautonomi, according to customers
            </p>
            <div onClick={handleShowMoreClick} className=" block">
              <p className="text-[22px] font-light  text-secondary">
                5.0
              </p>
              <Image src={RatingStars} alt="Rating stars" className="w-20" />
            </div>
            <div onClick={handleShowMoreClick}>
              <p className="text-[22px] font-light  text-secondary">
                25
              </p>
              <p className="text-xs font-light  text-secondary underline">
                reviews
              </p>
            </div>
          </div> */}
          <div className="flex md:hidden gap-3 items-center border p-4 rounded-xl mb-6">
            <Image src={Diamond} alt="" />
            <div>
              <h4 className="text-base font-light  text-secondary">
                This is a rare find
              </h4>
              <p className="text-sm font-light  text-destructive">
                This provider is usually fully booked.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-5 border-b mb-6 pb-7">
            <Image src={UserImage} alt="" className="h-12 w-12 rounded-full" />
            <div>
              <p className="text-base font-light  text-secondary -mb-2">
                Presented by Provider
              </p>
              <span className="text-sm">Super Partner</span>
              <span className="mx-2 text-xl">•</span>
              <span className="text-sm">9 months beauty partner</span>
            </div>
          </div>
          <div className="border-b mb-8 pb-4">
            {sections.map((section, index) => (
              <div key={index} className="flex items-center gap-8 mb-6">
                <Image
                  src={section.imageSrc}
                  alt=""
                  className="h-7 w-7 rounded-full"
                />
                <div>
                  <p className="text-base font-normal  text-secondary">
                    {section.title}
                  </p>
                  <p className="text-sm font-light  text-destructive">
                    {section.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="border-b mb-12 pb-12">
            <div className="mb-6">
              <p className="text-base font-light  text-secondary bg-primary py-3 px-4 rounded-lg mb-8">
                Some info has been automatically translated.{" "}
                <Link href="/">
                  <span className="font-light  text-black underline">
                    Show original
                  </span>
                </Link>
              </p>
              {infoParagraphs.map((paragraph, index) => (
                <p
                  key={index}
                  className="text-base font-light  text-secondary"
                >
                  {paragraph}
                </p>
              ))}
            </div>
            <p className="font-light  text-base text-black mb-4">
              The space...
            </p>
            <Button
              variant="underline"
              size="width"
              onClick={handleShowReviewInfoClick}
            >
              Show more
              <Image src={Arrow} alt="" className="h-4 w-4 ml-1" />
            </Button>
          </div>
          <div>
            <h2 className="text-[22px] font-light  text-secondary mb-6">
              What this salon offers
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 ">
              {places.map((place, index) => (
                <div key={index} className="flex gap-2 items-center mb-3">
                  <Image
                    src={place.imageSrc}
                    alt={place.title}
                    className="h-7 w-7"
                  />
                  <p className="text-base font-light  text-secondary">
                    {place.title}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-10  border-b mb-10 pb-12">
            <Button onClick={handleShowPopup} variant="destructive">
              Show all amenities
            </Button>
          </div>
          <div className="block md:hidden">
            {/* <Location/> */}
          </div>
          {/* <DateSelector
        checkInDate={checkInDate}
        checkOutDate={checkOutDate}
        onCheckInDateChange={handleCheckInDateChange} 
        onCheckOutDateChange={handleCheckOutDateChange}
      /> */}
      {/* <DatePickerWithRange/> */}
        </div>
        {/* <div className="sticky">
        <Reservation
        checkInDate={checkInDate}
        checkOutDate={checkOutDate}
        onCheckInDateChange={handleCheckInDateChange}
        onCheckOutDateChange={handleCheckOutDateChange}
      />
          <div className="hidden md:block">
          <div className="hidden md:flex gap-3 items-center border p-4 rounded-xl mb-6">
            <Image src={Diamond} alt="" />
            <div>
              <h4 className="text-base font-light  text-secondary">
                This is a rare find
              </h4>
              <p className="text-sm font-light  text-destructive">
                This provider is usually fully booked.
              </p>
            </div>
          </div>
          <div>
            <div
              onClick={handleOpenModal}
              className="cursor-pointer flex gap-2 items-center justify-center"
            >
              <Image src={Flag} alt="Report" className="h-5 w-5" />
              <p className="text-sm font-light Airbbn-normal">
                Report this listing
              </p>
            </div>

            {isModalOpen && <LoginModal />}
          </div>
        </div>
        </div> */}
      </div>
      {activePopup && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-[9999]">
          <div className="bg-white p-6 rounded-lg max-w-3xl w-full mx-4">
            <button
              onClick={handleClosePopup}
              className="w-10 h-10 flex items-center justify-center"
            >
              <Image src={CloseIcon} alt="Close" className="h-4 w-4" />
            </button>
            <div className="max-h-[40vh] overflow-y-auto pr-4">
              <h3 className="text-[22px] font-light  text-secondary mb-6">
                What this salon offers
              </h3>

              {getPopupContent().map((section, index) => (
                <div key={index} className="mb-6">
                  <h4 className="text-lg font-light  text-secondary mb-7">
                    {section.title}
                  </h4>
                  <ul>
                    {section.items.map((item, itemIndex) => (
                      <li
                        key={itemIndex}
                        className="flex items-center border-b mb-6 pb-6"
                      >
                        <Image
                          src={item.image}
                          alt=""
                          className="h-6 w-6 mr-2"
                        />
                        <p className="text-base font-light  text-secondary">
                          {item.text}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {showReviewInfoPopup && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-70 z-[9999]">
          <div className="bg-white p-8 rounded-lg max-w-3xl w-full text-secondary">
            <Image
              src={CloseIcon}
              alt=""
              onClick={handleCloseReviewInfoPopup}
              className="h-5 w-5 cursor-pointer mb-3"
            />
            <div>
              <h2 className="text-[26px] font-bold Beautonomi-bold text-secondary mb-8">
                About this space
              </h2>
              {reviewInfo.map((item, index) => {
                if (item.type === "text") {
                  return (
                    <p
                      key={index}
                      className="text-base font-light "
                    >
                      {item.content}
                    </p>
                  );
                } else if (item.type === "section") {
                  return (
                    <div key={index}>
                      <h3 className="text-base font-light  text-secondary mt-7">
                        {item.title}
                      </h3>
                      <p className="text-base font-light  mb-3">
                        {item.content}
                      </p>
                    </div>
                  );
                } else if (item.type === "link") {
                  return (
                    <Link key={index} href="/">
                      <button className="underline text-white">
                        {item.content}
                      </button>
                    </Link>
                  );
                }
                return null;
              })}
            </div>
          </div>
        </div>
      )}
      {showPopup && (
        <div className="fixed inset-0 flex items-center justify-center">
          <div className="bg-white p-4 rounded-lg shadow border items-center gap-3 flex">
            <Image
              src={CloseIcon}
              alt=""
              className="h-5 w-5 cursor-pointer"
              onClick={() => setShowPopup(false)}
            />
            <p className="text-sm font-light  text-secondary">
              Average nightly rate is rounded.{" "}
            </p>
          </div>
        </div>
      )}
      {showServiceFeePopup && (
        <div className="fixed inset-0 flex items-center justify-center max-w-96 mx-auto">
          <div className="bg-white p-4 rounded-lg shadow border items-center gap-3 flex">
            <Image
              src={CloseIcon}
              alt=""
              className="h-5 w-5 cursor-pointer"
              onClick={() => setShowServiceFeeePopup(false)}
            />
            <p className="text-sm font-light  text-secondary">
              This helps us run our platform and offer services like 24/7
              support on your trip.
            </p>
          </div>
        </div>
      )}
      {TestimonialPopup && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
          <div className="bg-white p-8 rounded-lg max-w-5xl w-full">
            <Image
              src={CloseIcon}
              alt=""
              onClick={handleCloseTestimonialPopup}
              className="h-7 w-7 cursor-pointer"
            />
            <div className="max-h-[80vh] overflow-y-auto flex gap-14 pr-6">
              <div className="">
                <Ratings isMultiColumn={false} />
              </div>
              <div>
                <div className="flex justify-between items-baseline mb-9">
                  <div className="">
                    <h2 className="text-lg font-light text-secondary">
                      {testimonials.length} Reviews
                    </h2>
                    <p
                      className="text-xs font-light  text-destructive underline"
                      onClick={handleShowReviewInfoClick}
                    >
                      Learn how reviews work
                    </p>
                  </div>
                  <Select value={selectedItem} onValueChange={handleChange}>
                    <SelectTrigger className="w-40 rounded-full">
                      {selectedItem.charAt(0).toUpperCase() +
                        selectedItem.slice(1)}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="most recent">Most recent</SelectItem>
                      <SelectItem value="highest rated">
                        Highest rated
                      </SelectItem>
                      <SelectItem value="lowest rated">Lowest rated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center border rounded-full pl-4 mb-9">
                  <Image src={Search} alt="" />
                  <Input placeholder="Search reviews" />
                </div>
                <div className="">
                  {testimonials.map((testimonial) => (
                    <div key={testimonial.id} className="mb-4">
                      <div className="flex gap-3 items-center mb-2">
                        <Image
                          src={testimonial.image}
                          alt={`${testimonial.name}'s image`}
                          className="h-12 w-12 rounded-full"
                        />
                        <div>
                          <p className="text-base font-light  text-secondary">
                            {testimonial.name}
                          </p>
                          <p className="text-sm font-light  text-secondary">
                            {testimonial.location}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-y-0 mb-2 gap-2">
                        <p className="text-sm font-light  text-secondary">
                          {testimonial.date}
                        </p>
                        <p className="text-sm font-light  text-destructive">
                          {testimonial.duration}
                        </p>
                      </div>
                      <div>
                        <p className="text-base font-light  text-secondary">
                          {testimonial.text}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <div>
        {/* <SearchDateModal/> */}
      </div>
    </div>
  );
};

export default ProviderDetails;
