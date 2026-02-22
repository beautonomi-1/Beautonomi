"use client";
import Image, { StaticImageData } from "next/image";
import React, { useState } from "react";
import Arrow from "./../../../../public/images/Arrow.svg";
import CloseIcon from "./../../../../public/images/close-icon.svg";
import Clock from "./../../../../public/images/clock.svg";
import Door from "./../../../../public/images/door.svg";
import NoPets from "./../../../../public/images/no-pets.svg";
import NoParties from "./../../../../public/images/no-parties.svg";
import Camera from "./../../../../public/images/camera.svg";
import NoSmoking from "./../../../../public/images/no-smoking.svg";
import TurnOff from "./../../../../public/images/turn-off.svg";
import ReturnKey from "./../../../../public/images/return-key.svg";
import Person from "./../../../../public/images/people-icon.svg";
import NoCarbonmonoxide from "./../../../../public/images/no-carbonmonoxide.svg";

interface RefundPolicy {
  before: string;
  time: string;
  policyType: string;
  description: string;
}

interface PopupContentItem {
  text: string;
  image: StaticImageData; 
}

interface PopupContent {
  title: string;
  description?: string;
  items: PopupContentItem[];
}

interface Section {
  title: string;
  rules: string[];
  popupContent: PopupContent[];
}

const refundPolicies: RefundPolicy[] = [
  {
    before: "Sep 4",
    time: "3:00 PM",
    policyType: "Full refund",
    description: "Get back 100% of what you paid.",
  },
  {
    before: "Sep 4",
    time: "3:00 PM",
    policyType: "Partial refund",
    description: "Cancel before check-in on Sep 5 for a partial refund.",
  },
];

const sections: Section[] = [
  {
    title: "Salon Policies",
    rules: [
      "Schedule after 10:00 AM",
      "Before 10:00 PM",
      " 2 clients per session",
    ],
    popupContent: [
      {
        title: "Checking in and out",
        description:
          "You'll be staying in someone's home, so please treat it with care and respect.",
        items: [
          { text: "Check-in after 3:00 PM", image: Clock },
          { text: "Checkout before 11:00 AM", image: Clock },
          { text: "Self check-in with smart lock", image: Door },
        ],
      },
      {
        title: "During your stay",
        items: [
          { text: "2 guests maximum", image: NoSmoking },
          { text: "No smoking", image: Person },
          { text: "No Pets", image: NoPets },
          { text: "No parties or events", image: NoParties },
          { text: "Commercial photography allowed", image: Camera },
        ],
      },
      {
        title: "Before you leave",
        items: [
          { text: "Turn things off", image: TurnOff },
          { text: "Return keys", image: ReturnKey },
        ],
      },
    ],
  },
  {
    title: "Salon Safety & Facility",
    rules: ["No Fire Extinguisher", "First Aid Kit Available"],
    popupContent: [
      {
        title: "Safety and Amenities",
        description:
          "Ensure a safe and comfortable visit by reviewing these key safety features and available amenities at the salon.",
        items: [
          { text: "No fire extinguisher present", image: NoCarbonmonoxide },
          { text: "First aid kit available", image: NoCarbonmonoxide },
        ],
      },
    ],
  },
  {
    title: "Cancellation policy",
    rules: [
      "Free cancellation before Sep 4. Cancel before check-in on Sep 5 for a partial refund.",
      "Review this Host's full policy for details.",
    ],
    popupContent: [
      {
        title: "",
        description:
          "Make sure you're comfortable with this Partner's policy. In rare cases, you may be eligible for a refund outside of this policy under Beautonomi's Major Disruptive Events Policy.",
        items: [],
      },
    ],
  },
];

const AccommodationInfo: React.FC = () => {
  const [activePopup, setActivePopup] = useState<string | null>(null);

  const handleShowPopup = (title: string) => {
    setActivePopup(title);
  };

  const handleClosePopup = () => {
    setActivePopup(null);
  };

  const getPopupContent = (): PopupContent[] => {
    const section = sections.find((s) => s.title === activePopup);
    return section ? section.popupContent : [];
  };

  return (
    <div className="max-w-[2340px] mx-auto px-10">
      <div className="mb-12">
        <h2 className="hidden md:block text-[22px] font-normal  text-secondary mb-6">
          Things to know
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {sections.map((section, index) => (
            <div key={index} className="border-b md:border-none pb-6 md:pb-0">
              <p className="text-[22px] md:text-base font-normal  text-secondary mb-3">
                {section.title}
              </p>
              {section.rules.map((rule, ruleIndex) => (
                <p
                  key={ruleIndex}
                  className="text-sm md:text-base font-light  text-destructive md:text-secondary mb-3"
                >
                  {rule}
                </p>
              ))}
              <div
                onClick={() => handleShowPopup(section.title)}
                className="flex gap-2 items-center mt-4 cursor-pointer"
              >
                <p className="underline text-base font-light  text-secondary">
                  Show more
                </p>
                <Image src={Arrow} alt="Arrow" className="h-3 w-3" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {activePopup && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-3xl w-full relative max-h-[80vh] overflow-y-auto">
            <button onClick={handleClosePopup} className="mb-11">
              <Image src={CloseIcon} alt="Close" className="h-6 w-6" />
            </button>

            <div>
              <h2 className="text-[26px] font-normal  text-secondary mb-3">
                {activePopup}
              </h2>

              {getPopupContent().map((content, index) => (
                <div key={index}>
                  <p className="text-base font-normal  text-secondary mb-10">
                    {content.description}
                  </p>
                  <h3 className="text-lg font-normal  text-secondary mb-9">
                    {content.title}
                  </h3>
                  <div className="mb-11">
                    {content.items.map((item, itemIndex) => (
                      <div
                        key={itemIndex}
                        className={`flex gap-4 items-center ${
                          itemIndex < content.items.length - 1
                            ? "border-b pb-6 mb-6"
                            : ""
                        }`}
                      >
                        <Image
                          src={item.image}
                          alt="Icon"
                          className="h-7 w-7"
                        />
                        <p className="text-base font-normal  text-secondary">
                          {item.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Cancellation policy */}
              {activePopup === "Cancellation policy" && (
                <div>
                  {refundPolicies.map((policy, index) => (
                    <div key={index} className="flex gap-32 border-b mb-5 pb-5">
                      <div>
                        <p className="text-base font-normal  text-secondary">
                          Before
                        </p>
                        <p className="text-sm font-normal  text-secondary">
                          {policy.before}
                        </p>
                        <p className="text-sm font-normal  text-secondary">
                          {policy.time}
                        </p>
                      </div>
                      <div>
                        <p className="text-base font-normal  text-secondary">
                          {policy.policyType}
                        </p>
                        <p className="text-base font-normal  text-secondary">
                          {policy.description}
                        </p>
                      </div>
                    </div>
                  ))}
                  <p className="text-base font-normal  text-secondary mb-3">
                    Cleaning fees are refunded if you cancel before check-in.
                  </p>
                  <p className="text-base font-normal  text-secondary underline">
                    <a href="#">Learn more about cancellation policies</a>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccommodationInfo;
