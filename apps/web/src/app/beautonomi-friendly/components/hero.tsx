import { Button } from "@/components/ui/button";

export default function AirFriendlyHero() {
  return (
    <div className=" mb-24">
    <div className="container ">
      <h1 className="text-secondary text-center text-5xl md:text-[56px] lg:text-[88px]  font-normal leading-[50px] lg:leading-[90px] mb-8">
        Introducing <br />
        Beautonomi-friendly <br />
        apartments
      </h1>
      <p className="text-lg lg:text-[28px] font-normal  text-secondary mb-14 text-center">
        Rent a place to live. Beautonomi it part-time.
      </p>
      <Button variant="default" className="mx-auto flex">Explore near you</Button>
    </div>
    </div>
  );
}
