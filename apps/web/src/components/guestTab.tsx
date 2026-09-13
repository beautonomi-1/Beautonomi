"use client";

import Image, { type StaticImageData } from "next/image";
import { useTranslation } from "@beautonomi/i18n";
// Placeholder images - some originals were missing
const Getting = "/images/getting-started-optimized.jpg";
import Access from "./../../public/images/accessing-your-account-optimized.jpg";
import Reservation from "./../../public/images/help-with-a-reservation-optimized.jpg";
import Aircover from "./../../public/images/AC_Guests_HG_EN_S@3x.png";
import Started from "./../../public/images/started.svg";
import Profile from "./../../public/images/profile-icon.svg";
import Calendar from "./../../public/images/calendar.svg";
import Home from "./../../public/images/home.svg";
import Arrow from "./../../public/images/Arrow.svg";
import Link from "next/link";

interface Guide {
  link: string;
  src: StaticImageData | string;
  alt: string;
  description: string;
  mobileSrc: StaticImageData | string;
}

export default function CustomerTab() {
  const { t } = useTranslation();
  const guides: Guide[] = [
    {
      src: Getting,
      alt: t("web.helpGuides.accessAccountAlt"),
      description: t("web.helpGuides.gettingStartedBeautonomi"),
      mobileSrc: Started,
      link:"/"
    },
    {
      src: Access,
      alt: t("web.helpGuides.gettingPaid"),
      description: t("web.helpGuides.accessManageAccount"),
      mobileSrc: Profile,
      link:"/"

    },
    {
      src: Reservation,
      alt: t("web.helpGuides.helpWithBooking"),
      description: t("web.helpGuides.helpWithBooking"),
      mobileSrc: Calendar,
      link:"/"

    },
    {
      src: Aircover,
      alt: t("web.helpGuides.coverageProviders"),
      description: t("web.helpGuides.coverageCustomers"),
      mobileSrc: Home,
      link:"/"

    },
  ];

  return (
    <div className="max-w-6xl mx-auto py-5 sm:py-8">
      <div className="block sm:flex justify-between items-center mb-6">
        <h2 className="text-[26px] mb-5 sm:mb-1 font-normal  text-secondary">
          {t("web.helpGuides.gettingStartedTitle")}
        </h2>
        <div className="block sm:hidden">
          {guides.map((guide, index) => (
            <Link key={index} href={guide.link} passHref>
              <div className="flex justify-between items-center border-b mb-5 pb-5 cursor-pointer">
                <div className="flex gap-3 items-center">
                  <Image
                    src={guide.mobileSrc}
                    alt={guide.alt}
                    className="h-7 w-7"
                  />
                  <h2 className="text-lg font-normal  text-secondary">
                    {guide.description}
                  </h2>
                </div>
                <Image src={Arrow} alt={t("web.helpGuides.arrowAlt")} className="h-5 w-5" />
              </div>
            </Link>
          ))}
        </div>
        <div className="flex justify-between">
          <a
            href="#"
            className="flex items-center font-light  text-lg sm:text-sm text-secondary"
          >
            {t("web.helpGuides.browseAllTopics")}{" "}
            <ArrowRightIcon className="hidden sm:block ms-1 h-4 w-4" />
          </a>
          <Image src={Arrow} alt={t("web.helpGuides.arrowAlt")} className="h-5 w-5" />
        </div>
      </div>
      <div className="hidden sm:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-0">
        {guides.map((guide, index) => (
          <div key={index}>
            <Image
              src={guide.src}
              alt={guide.alt}
              className="h-[255px] w-full lg:w-[255px] rounded-xl mb-3 object-cover"
              width={255}
              height={255}
              sizes="(max-width: 640px) 640px, 1024px"
            />
            <p className="text-lg  font-normal">
              {guide.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArrowRightIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}
