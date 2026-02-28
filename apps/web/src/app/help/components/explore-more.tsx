import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";
import Policies from "./../../../../public/images/Airbnb-Policy-Web.png";
import Saftey from "./../../../../public/images/Airbnb-Safety-Web.png";

const content = [
  {
    title: "Our community policies",
    description: "How we build a foundation of trust.",
    imageSrc: Policies,
    imageAlt: "Our community policies",
    imageWidth: 400,
    imageHeight: 233,
  },
  {
    title: "Host resources and inspiration",
    description: "Find tips, best practices, and news.",
    imageSrc: Saftey,
    imageAlt: "Host resources and inspiration",
    imageWidth: 400,
    imageHeight: 233,
  },
];

export default function ExploreMore() {
  return (
    <div className="bg-black text-white py-12">
      <div className="max-w-6xl mx-auto px-4">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-[32px] font-normal  mb-6">
            Explore more
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
            <div className="col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {content.map((item, index) => (
                <div
                  key={index}
                  className="items-center flex flex-row md:flex-col relative overflow-hidden rounded-lg"
                >
                  <Image
                    src={item.imageSrc}
                    alt={item.imageAlt}
                    className="w-24 sm:w-full h-24 sm:h-full"
                    width={item.imageWidth}
                    height={item.imageHeight}
                    style={{
                      aspectRatio: `${item.imageWidth}/${item.imageHeight}`,
                      objectFit: "cover",
                    }}
                  />
                  <div className="w-full bg-secondary pt-5 sm:pt-4 px-4 pb-7 sm:pb-6 rounded-r-lg sm:rounded-none">
                    <h3 className="text-lg font-semibold">{item.title}</h3>
                    <p className="text-sm">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          <div className="text-white py-8 rounded-lg ml-0 md:ml-4">
              <h3 className="text-[26px] font-normal  mb-4">
                Need to get in touch?
              </h3>
              <p className="mb-5 text-lg font-light ">
                We’ll start with some questions and get you to the right place.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <Button
                  variant="destructive"
                  className="w-72 text-base"
                  size="md"
                  asChild
                >
                  <Link href="/help/submit-ticket">Contact support</Link>
                </Button>
                <Button variant="outline" className="w-72 text-base" size="md" asChild>
                  <Link href="/help/my-tickets">My tickets</Link>
                </Button>
              </div>
              <p className="text-base font-light ">
                You can also{" "}
                <Link
                  href="#"
                  className="underline font-light "
                  prefetch={false}
                >
                  give us feedback.
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
