import React from "react";
import CarouselCard from "./carousel-card";
import slide1 from "../../../../public/images/pexels-alipazani-2878375 - Copy (1).jpg";
import slide2 from "../../../../public/images/pexels-steinportraits-1898555.jpg";
import slide3 from "../../../../public/images/pexels-cottonbro-3998404 (1).jpg";
import slide4 from "../../../../public/images/pexels-john-diez-7389075.jpg";

export default function HomeExperiences() {
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
    <div className="mb-10 mt-7">
      <div className="max-w-[2340px] mx-auto">
        <div className="flex flex-wrap gap-7 justify-start px-10">
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
