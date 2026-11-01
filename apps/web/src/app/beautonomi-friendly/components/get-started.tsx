import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";
import Building from "./../../../../public/images/building-icon.svg";
import Money from "./../../../../public/images/money-icon.svg";
import Message from "./../../../../public/images/message-icon.svg";

const steps = [
  {
    src: Building,
    description: "Search for beauty and wellness services in your area.",
  },
  {
    src: Money,
    description: "Open a provider profile to compare services, prices, and reviews.",
  },
  {
    src: Message,
    description: "Book an appointment online when you are ready.",
  },
];

export default function GetStarted() {
  return (
    <div className="container">
      <div className="mb-24 md:mb-40 lg:mb-48">
        <h1 className="mb-8 md:mb-12 lg:mb-20 text-start md:text-center text-[36px] lg:text-[64px] text-secondary font-normal ">
          Ready to get started?
        </h1>
        <div className="grid gap-5 md:gap-8 md:grid-cols-3 mb-9 md:mb-16 lg:mb-12">
          {steps.map((step, index) => (
            <div key={index} className="gap-4 flex md:block">
              <Image src={step.src} alt="" className="w-12 h-12 mb-4 justify-start md:justify-center ms-0 md:mx-auto" />
              <p className="text-start md:text-center text-lg lg:text-[26px] font-normal  text-secondary max-w-80 ms-0 md:mx-auto">
                {step.description}
              </p>
            </div>
          ))}
        </div>
        <div className="text-start md:text-center">
          <Button size="default" variant="default" asChild>
            <Link href="/search">Find a provider</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
