import Image from "next/image";
import Image1 from "./../../../../public/images/live-and-work-2_74bcec.webp";
import House from "./../../../../public/images/house_07efa3.webp";
import { PlusIcon } from "lucide-react";
import Image2 from "./../../../../public/images/departments_f410e4.webp";
import { StaticImageData } from "next/image";
import { Button } from "@/components/ui/button";

const items: Array<{
  type: string;
  backgroundColor?: string;
  textColor?: string;
  text?: string;
  icon?: boolean;
  imageSrc?: StaticImageData;
  imageAlt?: string;
  imageWidth?: number;
  imageHeight?: number;
  listItems?: string[];
  id?: string;
}> = [
  {
    type: "text",
    backgroundColor: "bg-white",
    textColor: "text-black",
    text: "Live and Work Anywhere",
    icon: true,
  },
  {
    type: "text",
    backgroundColor: "bg-secondary",
    textColor: "text-white",
    text: "160 Open Positions",
    icon: true,
  },
  {
    type: "image",
    id: "image1",
    imageSrc: Image1,
    imageAlt: "Office",
    imageWidth: 300,
    imageHeight: 400,
  },
  {
    type: "image",
    id: "image2", 
    backgroundColor: "bg-white",
    imageSrc: House,
    imageAlt: "House",
    text: "Do the most amazing work of your career",
  },
  {
    type: "text",
    backgroundColor: "bg-white",
    textColor: "text-black",
    text: "21 Departments",
    icon: true,
  },
  {
    type: "list",
    backgroundColor: "bg-white",
    textColor: "text-black",
    listItems: [
      "Engineering",
      "Finance",
      "Community Support",
      "Data Science",
      "Account Management",
      "Finance & Accounting",
      "Information Technology",
      "Marketing",
      "Research",
      "Design",
      "Operations",
      "Product",
      "Program Management",
      "Public Policy/Communications",
      "Business Development",
      "Localization",
      "Analytics",
      "Employee Experience",
      "Engineering & Technology",
      "Legal",
      "Trust",
    ],
  },
];

export default function Nextroles() {
  return (
    <div className="bg-primary py-24 mb-24 lg:mb-20">
      <div className="container">
        <h2 className=" font-normal text-5xl text-secondary text-center mb-16">
          Open the door to your next role
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-6 lg:grid-cols-12 gap-5 mb-16">
          <div className="grid grid-cols-1 md:grid-cols-2 col-span-6 gap-5">
            {/* First Section: 4 cards */}
            {items.slice(0, 4).map((item, index) => (
              <div
                key={index}
                className={`${item.backgroundColor} p-4 rounded-lg flex flex-col justify-between relative`}
              >
                {item.type === "text" && (
                  <>
                    <div
                      className={` font-normal h-72 ${
                        item.backgroundColor === "bg-white"
                          ? "text-secondary text-[26px]"
                          : "text-white text-[32px]"
                      }`}
                    >
                      {item.text}
                    </div>
                    {item.icon && (
                      <div className="flex justify-end">
                        <PlusIcon className={`h-6 w-6 ${item.textColor}`} />
                      </div>
                    )}
                  </>
                )}
                {item.type === "image" && item.imageSrc && (
                  <div
                    className={`relative ${
                      item.id === "image1" ? "h-[250px] w-full md:w-[297px] right-5" : "h-[250px] w-full md:w-[297px]"
                    }`}
                  >
                    <Image
                      id={item.id} 
                      src={item.imageSrc}
                      alt={item.imageAlt || ""}
                      width={item.imageWidth || 150}
                      height={item.imageHeight || 150}
                      objectFit="cover"
                      className={`rounded-lg ${
                        item.id === "image1" ? "absolute top-0 right-0" : "absolute bottom-0 right-4"
                      }`}
                    />
                    {item.text && (
                      <div className="absolute top-0 left-4 text-black text-2xl font-normal">
                        {item.text}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Second Section: Card spanning the full width */}
          <div className="col-span-6 md:col-span-3">
            <Image src={Image2} alt="Departments" className="h-full w-full" />
          </div>

          {/* Third Section: 2 additional cards */}
          <div className="col-span-3 space-y-5">
            {items.slice(4, 6).map((item, index) => (
              <div
                key={index}
                className={`${item.backgroundColor} p-4 rounded-lg flex flex-col justify-between`}
              >
                {item.type === "text" && (
                  <>
                    <div
                      className={` font-normal h-72 w-full ${
                        item.backgroundColor === "bg-white"
                          ? "text-secondary text-[26px]"
                          : "text-white text-[32px]"
                      }`}
                    >
                      {item.text}
                    </div>
                    {item.icon && (
                      <div className="flex justify-end">
                        <PlusIcon className={`h-6 w-6 ${item.textColor}`} />
                      </div>
                    )}
                  </>
                )}
                {item.type === "image" && item.imageSrc && (
                  <div className="relative w-full h-full">
                    <Image
                      src={item.imageSrc as StaticImageData}
                      alt={item.imageAlt || ""}
                      layout="fill"
                      objectFit="cover"
                      className="rounded-lg"
                    />
                    {item.text && (
                      <div className="absolute bottom-4 left-4 text-white text-2xl font-normal">
                        {item.text}
                      </div>
                    )}
                  </div>
                )}

                {item.type === "list" && (
                  <div className="bg-white p-4 rounded-lg h-64 overflow-y-auto">
                    <div className="text-sm font-normal  text-secondary">
                      {item.listItems?.map((listItem, idx) => (
                        <div className="border-b pb-2 mb-3" key={idx}>
                          {listItem}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <Button variant="default" className="mx-auto flex">Explore open roles</Button>
      </div>
    </div>
  );
}
