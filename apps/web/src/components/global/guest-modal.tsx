"use client";
import React, { useState } from "react";
import { Label } from "../ui/label";
import { Button } from "../ui/button";

const GuestModal = () => {
  const [bedrooms, setBedrooms] = useState<number>(0);
  const [beds, setBeds] = useState<number>(0);
  const [bathrooms, setBathrooms] = useState<number>(0);
  const [pets, setPets] = useState<number>(0);
  return (
    <div>
      <div className=" pb-3">
        <div className="border-b pb-6 flex justify-between items-center mb-4 pt-4">
          <div>
            <Label className="font-light text-base">Adults</Label>
            <p className="text-sm font-light text-gray-600">Ages 13 or above</p>
          </div>
          <div className="flex items-center space-x-7">
            <Button
              className="rounded-full border border-gray-600 hover:border-black bg-white p-3 h-8 font-light"
              onClick={() => setBedrooms(bedrooms > 0 ? bedrooms - 1 : 0)}
            >
              -
            </Button>
            <span>{bedrooms}</span>
            <Button
              className="rounded-full border border-gray-600 hover:border-black bg-white p-3 h-8 font-light"
              onClick={() => setBedrooms(bedrooms + 1)}
            >
              +
            </Button>
          </div>
        </div>
        <div className="border-b pb-6 pt-2 flex justify-between items-center mb-4">
          <div>
            <Label className="font-light text-base">Children</Label>
            <p className="text-sm font-light text-gray-600">2 - 12</p>
          </div>
          <div className="flex items-center space-x-7">
            <Button
              className="rounded-full border border-gray-600 hover:border-black bg-white p-3 h-8"
              onClick={() => setBeds(beds > 0 ? beds - 1 : 0)}
            >
              -
            </Button>
            <span>{beds}</span>
            <Button
              className="rounded-full border border-gray-600 hover:border-black bg-white p-3 h-8"
              onClick={() => setBeds(beds + 1)}
            >
              +
            </Button>
          </div>
        </div>
        <div className="border-b pb-6 pt-2 flex justify-between items-center mb-4">
          <div>
            <Label className="font-light text-base">Infants</Label>
            <p className="text-sm font-light text-gray-600">Under 2</p>
          </div>
          <div className="flex items-center space-x-7">
            <Button
              className="rounded-full border border-gray-600 hover:border-black bg-white p-3 h-8 font-light"
              onClick={() => setBathrooms(bathrooms > 0 ? bathrooms - 1 : 0)}
            >
              -
            </Button>
            <span>{bathrooms}</span>
            <Button
              className="rounded-full border border-gray-600 hover:border-black bg-white p-3 h-8 font-light"
              onClick={() => setBathrooms(bathrooms + 1)}
            >
              +
            </Button>
          </div>
        </div>
        <div className="border-b pb-6 pt-2 flex justify-between items-center mb-4">
          <div>
            <Label className="font-light text-base">Pets</Label>
            <p className="text-sm font-light text-gray-600 underline">Bringing a service animal?</p>
          </div>
          <div className="flex items-center space-x-7">
            <Button
              className="rounded-full border border-gray-600 hover:border-black bg-white p-3 h-8 font-light"
              onClick={() => setPets(pets > 0 ? pets - 1 : 0)}
            >
              -
            </Button>
            <span>{pets}</span>
            <Button
              className="rounded-full border border-gray-600 hover:border-black bg-white p-3 h-8 font-light"
              onClick={() => setPets(pets + 1)}
            >
              +
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GuestModal;
