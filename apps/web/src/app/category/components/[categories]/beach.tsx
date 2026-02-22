import React from "react";
import CarouselCard from "../carousel-card";
import slide1 from "../../../../public/images/gg.webp";
import slide2 from "../../../../public/images/gg2.webp";
import slide3 from "../../../../public/images/gg3.webp";
import slide4 from "../../../../public/images/gg4.webp";

export default function Beach() {
  const cardsData = [
    {
      slides: [
        { src: slide1, alt: "Slide 1" },
        { src: slide2, alt: "Slide 2" },
        { src: slide3, alt: "Slide 3" },
        { src: slide4, alt: "Slide 4" },
      ],
      content: {
        title: "Mashabola, India",
        subtitle: "Mountain Views",
        dates: "Mountain Views",
        amountstatus: "£786 Total",
        ratings: "4.89",
        ratingsVisible: "false",
        guestfav: "false",
        iconType: "share",
      },
    },
    {
      slides: [
        { src: slide2, alt: "Slide 1" },
        { src: slide3, alt: "Slide 2" },
        { src: slide4, alt: "Slide 3" },
        { src: slide1, alt: "Slide 4" },
      ],
      content: {
        title: "Adventure in Toyland",
        subtitle: "Mountain Views",
        dates: "Hosted by Toymaker",
        amountstatus: "Limited slots available",
        ratingsVisible: "false",
        ratings: "4.54",
        guestfav: "false",
        iconType: "share",
      },
    },
    {
      slides: [
        { src: slide1, alt: "Slide 1" },
        { src: slide2, alt: "Slide 2" },
        { src: slide3, alt: "Slide 3" },
        { src: slide4, alt: "Slide 4" },
      ],
      content: {
        title: "Mashabola, India",
        subtitle: "Mountain Views",
        dates: "Mountain Views",
        amountstatus: "£786 Total",
        ratings: "4.89",
        ratingsVisible: "false",
        guestfav: "false",
        iconType: "share",
      },
    },
    {
      slides: [
        { src: slide2, alt: "Slide 1" },
        { src: slide3, alt: "Slide 2" },
        { src: slide4, alt: "Slide 3" },
        { src: slide1, alt: "Slide 4" },
      ],
      content: {
        title: "Adventure in Toyland",
        subtitle: "Mountain Views",
        dates: "Hosted by Toymaker",
        amountstatus: "Limited slots available",
        ratingsVisible: "false",
        ratings: "4.54",
        guestfav: "false",
        iconType: "share",
      },
    },
    {
      slides: [
        { src: slide1, alt: "Slide 1" },
        { src: slide2, alt: "Slide 2" },
        { src: slide3, alt: "Slide 3" },
        { src: slide4, alt: "Slide 4" },
      ],
      content: {
        title: "Mashabola, India",
        subtitle: "Mountain Views",
        dates: "Mountain Views",
        amountstatus: "£786 Total",
        ratings: "4.89",
        ratingsVisible: "false",
        guestfav: "false",
        iconType: "share",
      },
    },
    {
      slides: [
        { src: slide2, alt: "Slide 1" },
        { src: slide3, alt: "Slide 2" },
        { src: slide4, alt: "Slide 3" },
        { src: slide1, alt: "Slide 4" },
      ],
      content: {
        title: "Adventure in Toyland",
        subtitle: "Mountain Views",
        dates: "Hosted by Toymaker",
        amountstatus: "Limited slots available",
        ratingsVisible: "false",
        ratings: "4.54",
        guestfav: "false",
        iconType: "share",
      },
    },
  ];

  return (
    <div className="mb-10">
      <div className="max-w-[2340px] mx-auto pl-12">
        <div className="flex justify-start flex-wrap 2xl:gap-4 xl:gap-7">
          {cardsData.map((card, index) => (
            <CarouselCard
              key={index}
              slides={card.slides}
              content={card.content}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
