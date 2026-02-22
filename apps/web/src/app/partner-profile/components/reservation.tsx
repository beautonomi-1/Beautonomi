import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import React from "react";

type ReservationProps = {
  checkInDate?: Date | null;
  checkOutDate?: Date | null;
  onCheckInDateChange?: (date: Date | undefined) => void;
  onCheckOutDateChange?: (date: Date | undefined) => void;
};

const Reservation = ({
  checkInDate,
  checkOutDate,
  onCheckInDateChange,
  onCheckOutDateChange,
}: ReservationProps) => {
  const ratePerNight = 68;
  const serviceFee = 67; // Example service fee

  const calculateTotal = () => {
    if (checkInDate && checkOutDate) {
      const timeDiff = checkOutDate.getTime() - checkInDate.getTime();
      const numberOfNights = Math.ceil(timeDiff / (1000 * 3600 * 24));
      const roomCost = numberOfNights * ratePerNight;
      const total = roomCost + serviceFee;
      return { numberOfNights, roomCost, total };
    }
    return { numberOfNights: 0, roomCost: 0, total: 0 };
  };

  const { numberOfNights, roomCost, total } = calculateTotal();

  function handleDateChange(date: Date | undefined, which: "checkIn" | "checkOut") {
    if (which === "checkIn") onCheckInDateChange?.(date);
    if (which === "checkOut") onCheckOutDateChange?.(date);
  }

  return (
    <div>
      <div className="hidden md:block bg-white pt-6 pb-8 px-8 rounded-lg shadow max-w-[419px] mb-7">
        <h2 className="text-[22px] font-normal  text-secondary mb-5">
          ${ratePerNight}{" "}
          <span className="text-base font-normal ">per night</span>
        </h2>
        <div className="border rounded-lg mb-5">
          <div className="flex space-x-4 border-b">
            <div>
              <Label
                htmlFor="check-in"
                className="ml-3 text-[10px] font-bold Beautonomi-bold"
              >
                CHECK-IN
              </Label>
              <div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Input
                      id="check-in"
                      type="text"
                      value={checkInDate ? checkInDate.toDateString() : ""}
                      placeholder="Add Date"
                      readOnly
                      className="-mt-2"
                    />
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={checkInDate}
                      onSelect={(date) => handleDateChange(date, "checkIn")}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="border my-2"></div>
            <div>
              <Label
                htmlFor="check-out"
                className="ml-3 text-[10px] font-bold Beautonomi-bold"
              >
                CHECK-OUT
              </Label>
              <div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Input
                      id="check-out"
                      type="text"
                      value={checkOutDate ? checkOutDate.toDateString() : ""}
                      placeholder="Add Date"
                      readOnly
                      className="-mt-2"
                    />
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={checkOutDate}
                      onSelect={(date) => handleDateChange(date, "checkOut")}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
          <div className="border-none">
            <Label className="pl-3">Guests</Label>
            <Select>
              <SelectTrigger className="w-full border-none -mt-2">
                <SelectValue placeholder="guest" className="border-none" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>2 guests</SelectLabel>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button variant="secondary" className="w-full mb-4">
          Reserve
        </Button>
        <p className="text-sm font-normal  text-secondary text-center mb-5">
         {` You won't be charged yet`}
        </p>
        <div>
          <div className="border-b pb-3 mb-5">
            <div className="flex justify-between items-center mb-3">
              <p className="text-base font-normal  text-secondary">
                ${ratePerNight} x {numberOfNights} nights
              </p>
              <p className="text-base font-normal  text-secondary">
                ${roomCost}
              </p>
            </div>
            <div className="flex justify-between items-center mb-3">
              <p className="text-base font-normal  text-secondary underline">
              Beautonomi Service fee
              </p>
              <p className="text-base font-normal  text-secondary">
                ${serviceFee}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-base font-normal  text-secondary">
              Total before taxes
            </p>
            <p className="text-base font-normal  text-secondary">
              ${total}
            </p>
          </div>
        </div>
      </div>
      <div className="fixed bottom-0 left-0 right-0 md:hidden bg-white p-4 shadow-lg flex justify-between z-10 items-center">
        <div>
          <p className="text-base font-normal  text-secondary">
            ${ratePerNight} per night
          </p>
          {checkInDate && checkOutDate && (
            <p className="text-sm text-secondary">
              {checkInDate.toDateString()} - {checkOutDate.toDateString()}
            </p>
          )}
        </div>
        <Button variant="secondary" className="h-12">
          Reserve
        </Button>
      </div>
    </div>
  );
};

export default Reservation;
