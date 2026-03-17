import Image from "next/image";
import Link from "next/link";
import Getting from "./../../../../public/images/getting-started-optimized.jpg";
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
    href: "/learn/article/getting-started-overview",
  },
  {
    src: Access,
    alt: "Getting paid",
    description: "Access and manage your account",
    href: "/learn/account-profile",
  },
  {
    src: Reservation,
    alt: "Help with a booking",
    description: "Help with a booking",
    href: "/learn/managing-bookings",
  },
  {
    src: Aircover,
    alt: "Getting protected through Beautonomi Coverage for Providers",
    description: "Beautonomi Coverage for customers",
    href: "/learn/article/policies-overview",
  },
];

export default function GettingStartedGuides() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-[26px] mb-1 font-normal  text-secondary">
          Guides for getting started
        </h2>
        <Link
          href="/learn"
          className="flex items-center font-normal  text-sm text-secondary"
        >
          Browse all topics <ArrowRightIcon className="ml-1 h-4 w-4" />
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 ">
        {guides.map((guide, index) => (
          <Link key={index} href={guide.href} className="group">
            <Image
              src={guide.src}
              alt={guide.alt}
              className="h-[255px] w-[255px] rounded-lg mb-3 object-cover group-hover:opacity-90 transition-opacity"
              width={255}
              height={255}
            />
            <p className=" text-lg  font-normal group-hover:underline">
              {guide.description}
            </p>
          </Link>
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
