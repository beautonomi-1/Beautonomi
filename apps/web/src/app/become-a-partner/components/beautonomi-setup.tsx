import Image from "next/image";
import setupimg from "../../../../public/images/setupimg.webp";

const sections = [
  {
    title: "One-to-one guidance from a  Super Partner",
    description:
      "We'll match you with a Super Partner in your area, who'll guide you from your first question to your first client—by phone, video call, or chat.",
  },
  {
    title: "An experienced client for your first appointment",
    description:
      "For your first appointment, you can choose to welcome an experienced client with a proven track record and positive reviews.",
  },
  {
    title: "Specialized support from Beautonomi",
    description:
      "New clients get one-tap access to specially trained Beautonomi support agents who can assist with everything from account issues to billing support.",
  },
];
export default function BeautonomiSetup() {
  return (
    <div className="mb-16 sm:mb-12 md:mb-[90px] lg:mb-28">
      <div className="container">
        <h2 className="text-[26px] md:text-[32px] lg:text-5xl font-normal lg:font-semibold  lg:Beautonomi-semibold text-secondary mb-9 text-left lg:text-center">
        Set up easily with Beautonomi Setup
        </h2>
        <Image src={setupimg} alt="" className="mb-9" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-y-11 md:gap-y-5 lg:gap-14">
          {sections.map((section, index) => (
            <div key={index}>
              <h3 className="text-base md:text-lg font-normal  text-secondary mb-2 md:mb-0">
                {section.title}
              </h3>
              <p className="text-sm md:text-base font-light  text-destructive">
                {section.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
