import Image from "next/image";
import NaniImage from "./../../../../public/images/88139d34-f308-43fc-908f-a07b893d794b.webp";
import JeffImage from "./../../../../public/images/46faca6b-df8a-4b76-9d45-d8bac7151141.webp";
import BuddyImage from "./../../../../public/images/2dbad1eb-dc50-4ed4-b796-ebcf2b236139.webp";
import { Button } from "@/components/ui/button";

const hosts = [
  {
    name: "Nani",
    location: "Resident & Beauty Partner Dallas, TX",
    imageSrc: NaniImage,
    altText: "Nani",
  },
  {
    name: "Jeff and Amador",
    location: "Residents & Hosts San Diego, CA",
    imageSrc: JeffImage,
    altText: "Jeff and Amador",
  },
  {
    name: "Buddy",
    location: "Resident & Beauty Partner Denver, CO",
    imageSrc: BuddyImage,
    altText: "Buddy",
  },
];

export default function FriendlyApartments() {
  return (
    <div className="container">
    <div className="mb-9 sm:mb-10 md:mb-16 lg:mb-[79px] min-h-screen ">
    <div className="flex flex-col items-center  justify-center  bg-white ">
      <div className="text-start md:text-center">
        <h1 className="font-normal lg:font-semibold text-[26px] md:text-4xl lg:text-[40px] max-w-2xl leading-8 md:leading-[44px] mb-8 lg:mb-10">
          Need a place where you can host? Try Beautonomi-friendly apartments
        </h1>
      </div>
      <div className="grid gap-5 grid-cols-3 mb-12 md:mb-8 lg:mb-10">
        {hosts.map((host, index) => (
          <div key={index} className="flex flex-col items-center space-y-2">
            <Image
              src={host.imageSrc}
              alt={host.altText}
              width={272}
              height={272}
              className="rounded-3xl"
              style={{ aspectRatio: "270/270", objectFit: "cover" }}
            />
            <div className="text-start md:text-center">
              <p className="font-light text-xs">{host.name}</p>
              <p className="text-xs font-light">{host.location}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="">
        <p className= "text-start md:text-center text-base md:text-[22px] font-light  text-secondary max-w-2xl lg:max-w-4xl mx-auto leading-5 md:leading-8 mb-8 lg:mb-10">
          We’ve partnered with apartment buildings across the US so you can rent
          a place to live and Beauty Partner on Beautonomi part-time. The typical Beauty Partner earned{" "}
          <span className="font-bold">$3650/year</span> and hosted 28 nights.*
        </p>
        <p className="text-center text-xs font-light  leading-4 max-w-2xl lg:max-w-3xl mb-8 lg:mb-10">
          *The typical Beauty Partner earnings amount represents the median amount of
          earnings for Hosts in US Beautonomi-friendly apartment buildings between
          Jan 1 - Dec 31, 2023, according to internal Beautonomi data for revenue
          earned by Hosts.
        </p>
      </div>
      </div>
      <div className="text-start md:text-center">
      <Button variant="destructive">Explore cities</Button>
    </div>
    </div>
    </div>
  );
}
