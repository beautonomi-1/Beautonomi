'use client'
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft } from "lucide-react";

// Define types
type Option = {
  id: string;
  label: string;
  description?: string;
};

const User = () => {
  const [showChooseIdType, setShowChooseIdType] = useState(false);
  const [selectedOption, setSelectedOption] = useState("upload");

  const options: Option[] = [
    {
      id: "upload",
      label: "Upload an existing photo",
      description: "Recommended",
    },
    {
      id: "webcam",
      label: "Take photo with your webcam",
      description: "",
    },
  ];

  const handleContinue = () => {
    setShowChooseIdType(true);
  };

  if (showChooseIdType) {
    return <ChooseIdType onBack={() => setShowChooseIdType(false)} />;
  }

  return (
    <div className="mx-auto p-4 max-w-4xl">
      <div className="flex justify-between place-items-start">
        <div className="max-w-md">
          <h2 className="text-[22px] font-medium text-secondary mb-2">
            {"Let's"} add your government ID
          </h2>
          <p className="text-base font-light text-secondary mb-6">
            {"We'll"} need you to add an official government ID. This step helps make sure {"you're"} really you.
          </p>
          <div className="">
            {options.map((option) => (
              <div
                key={option.id}
                className="flex items-start border-b py-4 mb-2 flex-row-reverse"
              >
                <input
                  type="radio"
                  id={option.id}
                  name="photoOption"
                  value={option.id}
                  checked={selectedOption === option.id}
                  onChange={() => setSelectedOption(option.id)}
                  className={`mt-1 h-5 w-5 cursor-pointer appearance-none rounded-full 
                  ${selectedOption === option.id ? 'border-[6px] border-black' : 'border-[2px] border-gray-400'}`}
                />
                <label htmlFor={option.id} className="flex-grow">
                  <div className="font-bold font-lg text-black mb-2">
                    {option.label}
                  </div>
                  {option.description && (
                    <p className="text-base text-black mb-2">
                      {option.description}
                    </p>
                  )}
                </label>
              </div>
            ))}
          </div>
          <div className="text-right">
            <Button variant="default" className="mt-4" onClick={handleContinue}>
              Continue
            </Button>
          </div>
        </div>
        <div className="border px-7 py-9 max-w-80 rounded-lg">
          <div>
            <p className="mb-3 text-lg font-medium text-black">Your privacy</p>
          </div>
          <div>
            <p className="text-base text-black font-light">
              We aim to keep the data you share during this process private, safe, and secure. Learn more in our {" "}
            </p>
            <a href="#" className="text-black underline">
                Privacy Policy
            </a>
            <br />
            <br />
            <a href="#" className="text-base text-black underline">
              How identity verification works
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

const ChooseIdType = ({ onBack }: { onBack: () => void }) => {
  const [country, setCountry] = useState<string>("Pakistan");
  const [selectedOption, setSelectedOption] = useState<string>("license");

  const options: Option[] = [
    {
      id: "license",
      label: "Driver's license",
    },
    {
      id: "passport",
      label: "Passport",
    },
    {
      id: "identity",
      label: "Identity card",
    },
  ];

  return (
    <div className=" container p-6 space-y-6">
        <div className='w-full max-w-xl'>
      <h2 className="text-[22px] font-medium text-secondary mb-4">Choose an ID type to add</h2>

      <div className="border rounded-md -space-y-2 mb-4">
        <Label htmlFor="country" className="text-xs pl-3 text-destructive">
          Country/region
        </Label>
        <Select value={country} onValueChange={setCountry}>
          <SelectTrigger id="country" className="border-none">
            <SelectValue placeholder="Select a country" />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="Pakistan">Pakistan</SelectItem>
            <SelectItem value="usa">United States</SelectItem>
            <SelectItem value="canada">Canada</SelectItem>
            <SelectItem value="uk">United Kingdom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <div>
          {options.map((option, index) => (
            <div
              key={option.id}
              className={`flex items-start py-5 mb-2 flex-row-reverse ${
                index !== options.length - 1 ? "border-b" : ""
              }`}
            >
              <input
                type="radio"
                id={option.id}
                name="photoOption"
                value={option.id}
                checked={selectedOption === option.id}
                onChange={() => setSelectedOption(option.id)}
                className={`mt-1 h-5 w-5 cursor-pointer appearance-none rounded-full 
                  ${
                    selectedOption === option.id
                      ? "border-[6px] border-black"
                      : "border-[2px] border-gray-400"
                  }`}
              />
              <label htmlFor={option.id} className="flex-grow">
                <div className="font-light text-blg text-black mb-2">
                  {option.label}
                </div>
                {option.description && (
                  <p className="text-base text-black mb-2">
                    {option.description}
                  </p>
                )}
              </label>
            </div>
          ))}
        </div>
      </div>
<div className='border-b mb-5 pb-6'>
      <div className="bg-primary p-4 rounded-md ">
        <p className='text-destructive text-sm font-light'>
          Your ID will be handled according to our{" "}
          <a href="#" className="text-black underline">
            Privacy Policy
          </a>{" "}
          and {"won't"} be shared with your Beauty Partner or clients.
        </p>
      </div>
      </div>

      <div className="flex justify-between">
        <button className="underline text-black flex text-lg" onClick={onBack}>
          <ChevronLeft />
          Back
        </button>
        <Button>Continue</Button>
      </div>
      </div>
    </div>
  );
};

export default User;
