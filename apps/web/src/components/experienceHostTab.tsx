import Image, { StaticImageData } from "next/image";

import Paid from "./../../public/images/getting-paid-optimized.jpg";
import Experience from "./../../public/images/managing-your-experience-optimized.jpg";
import Changes from "./../../public/images/changes-and-cancellations-optimized.jpg";
import Cohosting from "./../../public/images/how-cohosting-works-optimized.jpg";

import Started from "./../../public/images/started.svg";
import Arrow from "./../../public/images/Arrow.svg";
import Link from "next/link";

interface Guide {
  link: string;
  src: StaticImageData;
  alt: string;
  description: string;
  mobileSrc: StaticImageData;
}

const guides: Guide[] = [
  {
    src: Paid,
    alt: "Getting paid",
    description: "Getting paid",
    mobileSrc: Started,
    link: "/",
  },
  {
    src: Experience,
    alt: "Getting paid",
    description: "Managing your Experience",
    mobileSrc: Started,
    link: "/",
  },
  {
    src: Changes,
    alt: "Help with hosting",
    description: "Changes and cancellations",
    mobileSrc: Started,
    link: "/",
  },
  {
    src: Cohosting,
    alt: "Getting protected through AirCover for Hosts",
    description: "How Co-Hosting works",
    mobileSrc: Started,
    link: "/",
  },
];

export default function ExperienceHost() {
  return (
    <div className="max-w-6xl mx-auto py-5 sm:py-8">
      <div className="block sm:flex justify-between items-center mb-6">
        <h2 className="text-[26px] mb-5 sm:mb-1 font-normal  text-secondary">
          Guides for Experience Hosts
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
            className="flex items-center font-normal  text-lg sm:text-sm text-secondary"
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
