import Image from "next/image";
import Image1 from "./../../../../public/images/7c8bc731-8609-4f50-8e6e-4111f65947b1.jpg";
import Image2 from "./../../../../public/images/69b85dd1-8217-4145-9914-f6cc1495e18d.jpg";
import Image3 from "./../../../../public/images/8e1e8920-1c4d-4ea6-b353-4f7d1300c7cc.jpg";
import Image4 from "./../../../../public/images/ea54e592-529c-494e-ba17-8c0d4df48536.jpg";
import Image5 from "./../../../../public/images/1a56a292-3d2e-4ac2-9e88-fad972b9def6.jpg";
import Image6 from "./../../../../public/images/175cdfa7-db6e-4a88-bde7-f058990420bf.jpg";
import Image7 from "./../../../../public/images/aaa6be79-a1aa-4c61-a772-01c6c4ffe9d8.jpg";
import Image8 from "./../../../../public/images/e382d98b-718b-432f-90fe-4bda94091cbb.jpg";
import { Button } from "@/components/ui/button";

export default function ReportsandPartners() {
  const images = [
    { src: Image1, alt: "Partner 1" },
    { src: Image2, alt: "Partner 2" },
    { src: Image3, alt: "Partner 3" },
    { src: Image4, alt: "Partner 4" },
    { src: Image5, alt: "Partner 5" },
    { src: Image6, alt: "Partner 6" },
    { src: Image7, alt: "Partner 7" },
    { src: Image8, alt: "Partner 8" },
  ];

  return (
    <div className="container">
      <div className="flex flex-col md:flex-row items-center justify-between border-b pb-8 mb-6 md:mb-14 mt-5 md:mt-14">
        <div className="mb-4 md:mb-6">
          <h2 className="text-[22px] md:text-[38px] text-secondary font-normal mb-2 md:mb-6">
            Read the full report
          </h2>
          <p className="text-sm md:text-[22px] text-secondary font-normal max-w-xl lg:max-w-3xl leading-7 mb-1">
            The Six-Year Update on {"Beautonomi's"} Work to Fight Discrimination and Build Inclusion includes key Project Lighthouse findings, our complete data set, and progress we’ve made since 2016.
          </p>
        </div>
        <Button variant="default" className="w-full md:w-auto">
          View Report
        </Button>
      </div>
      <div className="mb-7 md:mb-16">
        <h2 className="text-[22px] md:text-[38px] text-secondary font-normal mb-4 md:mb-6">
          Meet our partners
        </h2>
        <p className="text-sm md:text-[22px] text-secondary font-normal max-w-3xl leading-7">
          Since 2016, we’ve consulted and collaborated with leading civil rights groups, racial experts, and privacy organizations.
        </p>
      </div>
      <div className="flex flex-wrap gap-8 mb-16">
        {images.map((image, index) => (
          <Image key={index} src={image.src} alt={image.alt} className="h-12 w-32 object-cover" />
        ))}
      </div>
    </div>
  );
}
