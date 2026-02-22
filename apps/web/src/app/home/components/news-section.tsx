"use client";
import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Percent, ArrowRight } from "lucide-react";

const NewsSection = () => {
  const newsItems = [
    {
      id: 1,
      title: "Get a 15% service discount by inviting 10 friends!",
      bgColor: "bg-[#FF0077]",
      textColor: "text-white",
      icon: <Percent className="w-8 h-8" />,
      buttonText: "Invite your friends",
    },
    {
      id: 2,
      title: "Get Back Groove with a Renewed Sense of Beauty",
      bgColor: "bg-purple-500",
      textColor: "text-white",
      illustration: "👩",
      buttonText: "Invite your friends",
    },
    {
      id: 3,
      title: "The convenience of having service at your door step",
      bgColor: "bg-purple-300",
      textColor: "text-gray-900",
      illustration: "💄✨",
      buttonText: "Invite your friends",
    },
  ];

  return (
    <div className="mb-8 md:mb-12 mt-4 md:mt-8">
      <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
        <h2 className="text-xl md:text-2xl lg:text-3xl font-normal mb-4 md:mb-6">
          News for you
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {newsItems.map((item) => (
            <div
              key={item.id}
              className={`${item.bgColor} ${item.textColor} rounded-xl p-6 md:p-8 flex flex-col justify-between min-h-[180px] md:min-h-[200px]`}
            >
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg md:text-xl font-semibold flex-1 pr-2">
                  {item.title}
                </h3>
                {item.icon && <div className="flex-shrink-0">{item.icon}</div>}
                {item.illustration && (
                  <div className="text-4xl md:text-5xl flex-shrink-0">
                    {item.illustration}
                  </div>
                )}
              </div>
              <Link href="/account-settings/referrals">
                <Button
                  className={`${
                    item.textColor === "text-white"
                      ? "bg-white text-[#FF0077] hover:bg-gray-100"
                      : "bg-white text-gray-900 hover:bg-gray-100"
                  } rounded-full px-4 py-2 text-sm font-medium w-fit`}
                >
                  {item.buttonText}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NewsSection;
