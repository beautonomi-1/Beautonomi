import { Button } from "@/components/ui/button";
import Image from "next/image";
import Room1 from "./../../../../public/images/Riverfront-Getaway-with-a-View-.webp";
import Room2 from "./../../../../public/images/Copy-of-Sophie_216212958_London_147.webp";
export default function Newsroom() {
  // Define an array of news items
  const newsItems = [
    {
      date: "AUGUST 15, 2024",
      title:
        "Local travel on the rise: See the top trending destinations locals love",
      imageSrc: Room1,
      alt: "Local travel on the rise",
    },
    {
      date: "AUGUST 8, 2024",
      title:
        "Paris 2024 Paralympic Games countdown: Tips to book last-minute on Beautonomi",
      imageSrc: Room2,
      alt: "Paris 2024 Paralympic Games countdown",
    },
  ];

  return (
    <div className="max-w-3xl mx-auto border-b pb-32 mb-10 px-4">
      <h1 className="text-[32px] font-extrabold mb-7">Newsroom</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-11">
        {newsItems.map((item, index) => (
          <div key={index} className="space-y-4">
            <Image
              src={item.imageSrc}
              alt={item.alt}
              className="w-full h-auto rounded-lg"
              width="500"
              height="300"
              style={{ aspectRatio: "500/300", objectFit: "cover" }}
            />
            <p className="text-sm text-muted-foreground">{item.date}</p>
            <h2 className="text-lg lg:text-xl font-light lg:font-semibold">{item.title}</h2>
          </div>
        ))}
      </div>
      <div className="">
        <Button variant="destructive">Visit the Newsroom</Button>
      </div>
    </div>
  );
}
