import Image from "next/image";
import Link from "next/link";
import Getting from "./../../../../public/images/getting-started-optimized.jpg";
import Access from "./../../../../public/images/accessing-your-account-optimized.jpg";
import Reservation from "./../../../../public/images/help-with-a-reservation-optimized.jpg";
import Policies from "./../../../../public/images/help-policies-community.jpg";

/**
 * v0 by Vercel.
 * @see https://v0.dev/t/e9uQfOV8fR8
 * Documentation: https://v0.dev/docs#integrating-generated-code-into-your-nextjs-app
 */

const guides = [
  {
    src: Getting,
    alt: "Getting started on Beautonomi",
    description: "Getting started on Beautonomi",
    href: "/learn/article/getting-started-overview",
  },
  {
    src: Access,
    alt: "Account and profile settings",
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
    src: Policies,
    alt: "Policies and community standards",
    description: "Policies and community standards",
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
          Browse all topics <ArrowRightIcon className="ms-1 h-4 w-4" />
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 min-w-0">
        {guides.map((guide, index) => (
          <Link key={index} href={guide.href} className="group min-w-0">
            <Image
              src={guide.src}
              alt={guide.alt}
              className="w-full h-auto aspect-square max-h-[255px] rounded-lg mb-3 object-cover group-hover:opacity-90 transition-opacity"
              width={255}
              height={255}
              sizes="(max-width: 768px) 100vw, 25vw"
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
