import React from "react";
import Image from "next/image";
import Check from "./../../../public/images/check.svg";
import Envelope from "./../../../public/images/email.svg";
import Id from "./../../../public/images/id.svg";
import Link from "next/link";

const bookingSteps = [
  {
    title: "Request to book",
    description:
      "Choose your dates, add your guests, then answer a question about why you want to go.",
    image: Envelope,
  },
  {
    title: "Selection process",
    description:
      "First, we’ll randomly choose a set of potential guests. Next, we’ll review their answers for unique perspectives and connections to the icon. Then, we’ll invite selected guests to book.",
    image: Check,
  },
  {
    title: "Requirements",
    description:
      "You’ll need an active Beautonomi account and the app to participate, and be a resident of an eligible country or region. It won’t cost you anything to submit a request.",
    image: Id,
  },
];

const BookingRequest = () => {
  return (
    <div className="container">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 gap-y-0 border-b mb-9 pb-1 md:pb-11">
        {bookingSteps.map((step, index) => (
          <div key={index} className="flex flex-row md:flex-col items-start gap-4 mb-8 md:mb-0">
            <Image
              src={step.image}
              alt={`Step ${index + 1} Icon`}
              className="mb-4"
            />
            <div>
            <h2 className="text-base font-normal  text-secondary">
              {step.title}
            </h2>
            <p className="text-base font-light  text-destructive">
              {step.description}
            </p>
          </div>
          </div>
        ))}
      </div>
      <p className="text-xs font-light   text-destructive mb-8 max-w-3xl">
        If you’re selected and decide to book, you’ll have 24 hours to complete
        the purchase. Travel costs are not included. See the{" "}
        <Link href="/" className="underline">
          full rules
        </Link>
        , including age and geographic eligibility, how data will be used, odds
        of being selected, and other terms.
      </p>
    </div>
  );
};

export default BookingRequest;
