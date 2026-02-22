"use client";

import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";

export default function EarningSlider() {
  const [activeTab, setActiveTab] = useState<"entire-place" | "private-room">(
    "entire-place"
  );
  const [_bedrooms, _setBedrooms] = useState<number>(1);
  const [nights, setNights] = useState(7);
  const pricePerNight = 42;
  const totalEarnings = nights * pricePerNight;

  return (
    <div className="container">
      <div className="flex-col lg:flex-row flex mb-[88px] sm:mb-24 md:mb-[72px] lg:mb-28">
        <div className="flex flex-col w-full pb-6 lg:py-20">
          <div className="text-center mb-4 mx-auto w-full lg:w-auto ">
            <h2 className="text-[40px] md:text-5xl  font-bold text-muted -mb-5 lg:mb-0">
              Beautonomi
            </h2>
            <h2 className="text-[40px] md:text-5xl  font-normal text-secondary mb-2">
              You could earn
            </h2>
            <div className="text-6xl md:text-[68px] text-secondary  font-normal">
              ${totalEarnings}
            </div>
            <div className="mt-2 text-base font-normal  text-secondary mb-10">
              <span className="font-normal  underline ">{nights} beauty</span>{" "}
              treatments for an estimated ${pricePerNight} per person
            </div>
            <Slider
              value={[nights]}
              min={1}
              max={30}
              step={1}
              onValueChange={(value) => setNights(value[0])}
              className="w-full max-w-3xl mx-auto mt-4 mb-6"
            />
            <a
              href="#"
              className="mt-2 text-sm font-normal text-destructive underline"
            >
              Learn how we estimate your earnings
            </a>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <div className="flex items-center  mx-auto w-full lg:max-w-sm px-3 py-2 mt-4 border rounded-full cursor-pointer inputbox">
                <SearchIcon className="w-5 h-5 text-muted" />
                <div className="flex flex-col ml-4">
                  <span className="font-normal text-secondary">Faisalabad</span>
                  <span className="text-base font-light  text-gray-500">
                    Entire place
                  </span>
                </div>
              </div>
            </DialogTrigger>
            <DialogContent className="max-w-lg p-6">
              <DialogHeader>
                <DialogTitle className="mt-10">Tell us about your place</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="address">Address or area</Label>
                  <div className="relative">
                    <LocateIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="address"
                      placeholder="Faisalabad, Punjab, Pakistan"
                      className="pl-8 rounded-full"
                    />
                  </div>
                </div>
                <Tabs
                  value={activeTab}
                  onValueChange={(value) =>
                    setActiveTab(value as "entire-place" | "private-room")
                  }
                  className="border-b"
                >
                  <TabsList className="flex justify-center max-w-sm mx-auto rounded-full bg-[#EBEBEB] mb-5">
                    <TabsTrigger
                      className="w-full rounded-full"
                      value="entire-place"
                    >
                      Freelancing{" "}
                    </TabsTrigger>
                    <TabsTrigger
                      className="w-full rounded-full"
                      value="private-room"
                    >
                      Become Partner
                    </TabsTrigger>
                  </TabsList>
                  {/* <TabsContent value="entire-place">
                    <div className="flex justify-between items-center mb-4">
                      <Label>Bedrooms</Label>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          className="rounded-full"
                          onClick={() =>
                            setBedrooms(bedrooms > 0 ? bedrooms - 1 : 0)
                          }
                        >
                          -
                        </Button>
                        <span>{bedrooms}</span>
                        <Button
                          variant="outline"
                          className="rounded-full"
                          onClick={() => setBedrooms(bedrooms + 1)}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="private-room">
                    <div className="space-y-2">
                      <Label>Bedrooms</Label>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          onClick={() =>
                            setBedrooms(bedrooms > 0 ? bedrooms - 1 : 0)
                          }
                        >
                          -
                        </Button>
                        <span>{bedrooms}</span>
                        <Button
                          variant="outline"
                          onClick={() => setBedrooms(bedrooms + 1)}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                  </TabsContent> */}
                </Tabs>
              </div>
              <DialogFooter>
                <Button className="w-full bg-[#222222] hover:bg-black text-white py-6">
                  Update your estimate
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <div className=" w-full h-96 lg:h-auto mt-0 lg:ml-8 ">
          <iframe
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d13795.846601011666!2d73.06024654999999!3d31.43094615!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x39190428e9ed19cf%3A0x6c010fbb3d905b6d!2sFaisalabad%2C%20Punjab%2C%20Pakistan!5e0!3m2!1sen!2sus!4v1690208942705!5m2!1sen!2sus"
            width="100%"
            height="100%"
            style={{ border: 0 }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="rounded-2xl"
          ></iframe>
        </div>
      </div>
    </div>
  );
}

function SearchIcon(props: any) {
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
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function LocateIcon(props: React.SVGProps<SVGSVGElement>) {
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
      <line x1="2" x2="5" y1="12" y2="12" />
      <line x1="19" x2="22" y1="12" y2="12" />
      <line x1="12" x2="12" y1="2" y2="5" />
      <line x1="12" x2="12" y1="19" y2="22" />
      <circle cx="12" cy="12" r="7" />
    </svg>
  );
}
