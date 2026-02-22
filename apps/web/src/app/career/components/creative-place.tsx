import { Button } from "@/components/ui/button";
import Image from "next/image";
import LiveAndWork from "./../../../../public/images/live-and-work-anywhere-1200x800-1.webp";
import Welcome from "./../../../../public/images/we-welcome-you.webp";
import Impact from "./../../../../public/images/make-an-impact.webp";

const contentArray = [
  {
    image: LiveAndWork,
    alt: "Live and Work Anywhere",
    title: "Live and Work Anywhere",
    description:
      "We know there is no one-size-fits-all approach to work. That’s why we give our employees the flexibility to live and work anywhere in the world where regulations allow—while still providing them with opportunities to connect in person.",
    buttonText: "Live and Work Anywhere",
  },
  {
    image: Welcome,
    alt: "We welcome you",
    title: "We welcome you",
    description:
      "Creating connection and belonging in the world begins with a workplace where you’re both welcomed and empowered to be your authentic self, so you can deliver your best work. We’re committed to ensuring Beautonomi is a place where people of all backgrounds, identities, and experiences can thrive.",
    buttonText: "Life at Beautonomi",
  },
  {
    image: Impact,
    alt: "Make an impact",
    title: "Make an impact",
    description:
      "Join our global creative community, where passion and collaboration drive innovation to make products that impact the world. Work alongside industry-leading talent and be part of our vibrant network, encompassing people from all walks of life.",
    buttonText: "Jobs at Beautonomi",
  },
];

export default function CreativePlace() {
  return (
    <div className="bg-secondary text-white pt-24 pb-32 md:pb-40 lg:pb-36">
      <div className=" container ">
        <div className="max-w-xl lg:max-w-full mx-auto text-center mb-12">
          <h1 className="text-5xl font-normal ">
            Work at one of the most creative places on Earth
          </h1>
          <p className="text-lg font-normal  text-[#dddddd] mt-4">
            From our first three guests in 2007, Beautonomi has welcomed 1.5 billion
            arrivals, all thanks to our 5 million Hosts.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-14 lg:gap-y-20 gap-6">
          {contentArray.map((item, index) => (
            <div key={index} className=" flex flex-col">
              <Image
                src={item.image}
                alt={item.alt}
                className="rounded-lg mb-4 w-full md:w-[486px] h-[353px]"
              />
              <h2 className="text-2xl font-semibold mb-3">{item.title}</h2>
              <p className="mb-3 text-base font-normal text-[#dddddd] flex-grow max-w-full md:max-w-96">
                {item.description}
              </p>
              <Button
                variant="destructive"
                className="self-start mt-auto inline-flex items-center px-4 py-2 text-base font-semibold"
              >
                {item.buttonText}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
