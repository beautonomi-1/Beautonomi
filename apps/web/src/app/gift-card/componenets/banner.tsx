import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";
import Card from "./../../../../public/images/474b6135-6999-49ec-99c6-c5e59c2d4f2d.webp";
export default function Banner() {
  return (
    <div className="pb-16 md:pb-24 lg:pb-28">
      <div className=" container">
        <div className="flex flex-col md:flex-row bg-primary pt-7 lg:pt-12 pb-10 items-center justify-between px-12 py-8 rounded-xl ">
          <div className="w-full">
            <h1 className="text-center md:text-start text-[40px] md:text-[52px] lg:text-6xl font-normal leading-[50px]  text-secondary mb-2 md:mb-8 lg:mb-9">
              Gift cards for business
            </h1>
            <div className="hidden md:block">
            <p className="text-base lg:text-lg font-light  text-secondary max-w-80 mb-4">
              Show your appreciation for employees and customers with beauty and wellness 
              gift cards that are easy to give for any occasion.
            </p>
            <p className="text-base lg:text-lg font-light text-secondary max-w-72 mb-8">
              For bulk orders,{" "}
              <a href="mailto:sales@beautonomi.com" className=" font-light  underline">
                contact sales
              </a>
              .
            </p>
            <Link href="/gift-card/purchase">
              <Button variant="default" size="rounded">
                Get started
              </Button>
            </Link>
          </div>
          </div>
          <div className="">
            <Image src={Card} alt="Gift cards" />
          </div>
          <div className="block md:hidden container">
        <div className="">
            <p className="text-base lg:text-lg font-light  text-secondary text-center mx-auto max-w-80 mb-4">
              Show your appreciation for employees and customers with beauty and wellness 
              gift cards that are easy to give for any occasion.
            </p>
            <p className="text-base lg:text-lg font-light text-secondary mx-auto text-center max-w-72 mb-8">
              For bulk orders,{" "}
              <a href="mailto:sales@beautonomi.com" className=" font-medium  underline">
                contact sales
              </a>
              .
            </p>
            </div>
            <Link href="/gift-card/purchase" className="w-full block">
              <Button variant="default" size="rounded" className="w-full">
                Get started
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
