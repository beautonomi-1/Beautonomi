import * as React from "react";

export default function FeatureCards() {
  const features = [
    {
      title: "Beautiful designs",
      description:
        "Gift cards are customizable with your choice of design, message, and gift amount",
    },
    {
      title: "Easy to send",
      description:
        "Arrives within minutes via text or email and we'll confirm that it's been received",
    },
    {
      title: "Never expires",
      description:
        "Gift credit is available to use whenever they're ready to book beauty and wellness services",
    },
  ];

  return (
    <div className="pb-16 md:pb-20 lg:pb-28">
      <div className="container">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 justify-between ">
          {features.map((feature, index) => (
            <div key={index} className="text-center mb-5">
              <h2 className="text-lg md:text-[26px] lg:text-[32px]  text-secondary font-normal mb-3 md:mb-4">
                {feature.title}
              </h2>
              <p className="text-sm md:text-base font-light  max-w-80 md:max-w-full mx-auto">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function _HotelIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 22v-6.57" />
      <path d="M12 11h.01" />
      <path d="M12 7h.01" />
      <path d="M14 15.43V22" />
      <path d="M15 16a5 5 0 0 0-6 0" />
      <path d="M16 11h.01" />
      <path d="M16 7h.01" />
      <path d="M8 11h.01" />
      <path d="M8 7h.01" />
      <rect x="4" y="2" width="16" height="20" rx="2" />
    </svg>
  );
}
