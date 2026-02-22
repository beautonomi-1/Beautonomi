import { Button } from "@/components/ui/button";
import Image from "next/image";
import WorkingMan from "./../../../../../public/images/Column-Right-Image.webp";

export default function NonPermanentContractor() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 px-10 mb-24">
      <div className="pt-12 pb-7 pl-10 rounded-t-xl lg:rounded-l-xl bg-secondary text-accent flex flex-col justify-between">
        <div className="max-w-[490px]">
          <h1 className="text-4xl font-normal  mb-4">
            Looking for non-permanent contractor roles?
          </h1>
          <p className="text-base font-normal  mb-7">
            Non-permanent contractor opportunities provide the perfect blend of
            flexibility and predictability. If a permanent role is not ideal for
            you, click below to discover our rewarding contract assignments via
            Magnit, a managed services provider for Beautonomi.
          </p>
          <Button variant="destructive">Apply now</Button>
        </div>
        <div className="max-w-xl">
          <p className="text-base font-normal  mt-6">
            By clicking on the button above, you will be leaving the Beautonomi
            careers website, and entering a site that is independently run by
            Magnit.
          </p>
          <p className="text-base font-normal  mt-2">
            Magnit employs contractors directly and will handle the hiring
            process.
          </p>
        </div>
      </div>

      <div className="relative">
        <Image
          src={WorkingMan}
          alt="Man working on a laptop"
          className="w-full h-full object-cover"
        />
      </div>
    </div>
  );
}
