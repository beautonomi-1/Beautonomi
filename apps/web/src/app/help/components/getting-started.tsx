import Image from "next/image";
import Getting from "./../../../../public/images/getting-started-on-airbnb-optimized.jpg";
import Access from "./../../../../public/images/accessing-your-account-optimized.jpg";
import Reservation from "./../../../../public/images/help-with-a-reservation-optimized.jpg";
import Aircover from "./../../../../public/images/AC_Guests_HG_EN_S@3x.png";

/**
 * v0 by Vercel.
 * @see https://v0.dev/t/e9uQfOV8fR8
 * Documentation: https://v0.dev/docs#integrating-generated-code-into-your-nextjs-app
 */

const guides = [
  {
    src: Getting,
    alt: "Access and manage your account",
    description: "Getting started on Beautonomi",
  },
  {
    src: Access,
    alt: "Getting paid",
    description: "Access and manage your account",
  },
  {
    src: Reservation,
    alt: "Help with hosting",
    description: "Help with a reservation",
  },
  {
    src: Aircover,
    alt: "Getting protected through AirCover for Hosts",
    description: "AirCover for guests",
  },
];

export default function GettingStartedGuides() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-[26px] mb-1 font-normal  text-secondary">
          Guides for getting started
        </h2>
        <a
          href="#"
          className="flex items-center font-normal  text-sm text-secondary"
        >
          Browse all topics <ArrowRightIcon className="ml-1 h-4 w-4" />
        </a>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 ">
        {guides.map((guide, index) => (
          <div key={index} className="">
            <Image
              src={guide.src}
              alt={guide.alt}
              className="h-[255px] w-[255px] rounded-lg mb-3"
            />
            <p className=" text-lg  font-normal">
              {guide.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArrowRightIcon(props: any) {
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
