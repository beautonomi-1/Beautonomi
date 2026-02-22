import { Button } from "@/components/ui/button";
import Image from "next/image";
import Building from "./../../../../public/images/building-icon.svg";
import Money from "./../../../../public/images/money-icon.svg";
import Message from "./../../../../public/images/message-icon.svg";
const steps = [
  {
    src: Building,
    description: "First, browse Beautonomi-friendly apartments in your area.",
  },
  {
    src: Money,
    description: "Next, find out how much you can earn on Beautonomi.",
  },
  {
    src: Message,
    description: "Then, we’ll help you contact the places you like.",
  },
];

export default function GetStarted() {
  return (
    <div className="container">
      <div className="mb-24 md:mb-40 lg:mb-48">
        <h1 className="mb-8 md:mb-12 lg:mb-20 text-left md:text-center text-[36px] lg:text-[64px] text-secondary font-normal ">
          Ready to get started?
        </h1>
        <div className="grid gap-5 md:gap-8 md:grid-cols-3 mb-9 md:mb-16 lg:mb-12">
          {steps.map((step, index) => (
            <div key={index} className="gap-4 flex md:block">
              <Image src={step.src} alt="" className="w-12 h-12 mb-4 justify-start md:justify-center ml-0 md:mx-auto" />
              <p className="text-left md:text-center text-lg lg:text-[26px] font-normal  text-secondary max-w-80 ml-0 md:mx-auto">
                {step.description}
              </p>
            </div>
          ))}
        </div>
        <div className="text-left md:text-center">
          <Button size="default" variant="default">
            Explore near you
          </Button>
        </div>
      </div>
    </div>
  );
}
