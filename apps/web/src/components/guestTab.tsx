import Image, { type StaticImageData } from "next/image";
// Placeholder images - some originals were missing
const Getting = "/images/getting-started-on-airbnb-optimized.jpg";
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

const guides: Guide[] = [
  {
    src: Getting,
    alt: "Access and manage your account",
    description: "Getting started on Beautonomi",
    mobileSrc: Started,
    link:"/"
  },
  {
    src: Access,
    alt: "Getting paid",
    description: "Access and manage your account",
    mobileSrc: Profile,
    link:"/"

  },
  {
    src: Reservation,
    alt: "Help with hosting",
    description: "Help with a reservation",
    mobileSrc: Calendar,
    link:"/"

  },
  {
    src: Aircover,
    alt: "Getting protected through Beautonomi Coverage for Providers",
    description: "Beautonomi Coverage for customers",
    mobileSrc: Home,
    link:"/"

  },
];

export default function CustomerTab() {
  return (
    <div className="max-w-6xl mx-auto py-5 sm:py-8">
      <div className="block sm:flex justify-between items-center mb-6">
        <h2 className="text-[26px] mb-5 sm:mb-1 font-normal  text-secondary">
          Guides for getting started
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
                <Image src={Arrow} alt="Arrow icon" className="h-5 w-5" />
              </div>
            </Link>
          ))}
        </div>
        <div className="flex justify-between">
          <a
            href="#"
            className="flex items-center font-light  text-lg sm:text-sm text-secondary"
          >
            Browse all topics{" "}
            <ArrowRightIcon className="hidden sm:block ml-1 h-4 w-4" />
          </a>
          <Image src={Arrow} alt="Arrow icon" className="h-5 w-5" />
        </div>
      </div>
      <div className="hidden sm:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-0">
        {guides.map((guide, index) => (
          <div key={index}>
            <Image
              src={guide.src}
              alt={guide.alt}
              className="h-[255px] w-full lg:w-[255px] rounded-xl mb-3"
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
