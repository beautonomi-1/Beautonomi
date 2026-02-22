import React, { useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import Keyboard from './../../../../public/images/keyboard-icon.svg';
import { useResponsive } from '@/hooks/useMobile';

interface DateSelectorProps {
  checkInDate: Date | null;
  checkOutDate: Date | null;
  onCheckInDateChange: (date: Date | null) => void;
  onCheckOutDateChange: (date: Date | null) => void;
}

const DateSelector: React.FC<DateSelectorProps> = ({
  checkInDate,
  checkOutDate,
  onCheckInDateChange,
  onCheckOutDateChange
}) => {
  const [isCheckInSelected, setIsCheckInSelected] = useState<boolean>(true);
  const [isPopupOpen, setIsPopupOpen] = useState<boolean>(false);
  const numberOfMonths = useResponsive({ mobile: 1, desktop: 2 });

  const minimumNights = 2;

  const keyboardShortcuts = [
    { key: "↵", description: "Select the date in focus" },
    { key: "←/→", description: "Move backward (left) and forward (right) by one day" },
    { key: "↑/↓", description: "Move backward (up) and forward (down) by one week" },
    { key: "PgUp/PgDn", description: "Switch months" },
    { key: "Home/End", description: "Go to the first or last day of a week" },
    { key: "?", description: "Open this panel" },
  ];

  const handleDateSelect = (date: Date | null) => {
    if (date) {
      if (isCheckInSelected) {
        onCheckInDateChange(date);
        setIsCheckInSelected(false);
      } else {
        if (checkInDate) {
          const timeDiff = date.getTime() - checkInDate.getTime();
          const selectedNights = Math.ceil(timeDiff / (1000 * 3600 * 24));

          if (selectedNights >= minimumNights) {
            onCheckOutDateChange(date);
          } else {
            alert(`Minimum stay is ${minimumNights} nights.`);
          }
        }
      }
    }
  };

  const calculateNights = () => {
    if (checkInDate && checkOutDate) {
      const timeDiff = checkOutDate.getTime() - checkInDate.getTime();
      return Math.ceil(timeDiff / (1000 * 3600 * 24));
    }
    return 0;
  };

  const clearDates = () => {
    onCheckInDateChange(null);
    onCheckOutDateChange(null);
    setIsCheckInSelected(true);
  };

  const nights = calculateNights();

  const getDisplayText = () => {
    if (!checkInDate) {
      return "Select check-in date.";
    } else if (!checkOutDate) {
      return "Select checkout date.";
    } else if (nights > 0) {
      return `${nights} night${nights > 1 ? "s" : ""} in Downtown Dubai`;
    }
    return "";
  };

  const togglePopup = () => {
    setIsPopupOpen(!isPopupOpen);
  };

  return (
    <div className="container">
      <div className="mt-4">
        <p className="text-[22px] font-normal  text-secondary">
          {getDisplayText()}
        </p>
        <p className="text-sm font-normal  text-destructive mb-4">
          Minimum stay: 2 nights
        </p>
      </div>
      <div className="mb-5">
        <div className="w-full">
          <Calendar
            mode="single"
            //@ts-ignore 
            selected={isCheckInSelected ? checkInDate : checkOutDate}
            //@ts-ignore 
            onSelect={handleDateSelect}
            initialFocus
            numberOfMonths={numberOfMonths} // Set the number of months based on screen size
            to={checkOutDate ? checkOutDate : undefined}
            className="w-full"
            classNames={{
              //@ts-ignore
              day: ({ date }: any) => {
                const isSelected =
                  date?.toDateString() === checkInDate?.toDateString() ||
                  date?.toDateString() === checkOutDate?.toDateString();
                return isSelected ? "bg-black text-white" : "";
              },
            }}
          />
        </div>
      </div>

      <div className="flex justify-between mt-4">
        <Image
          src={Keyboard}
          alt="Keyboard Icon"
          onClick={togglePopup}
          className="cursor-pointer"
        />
        <Button variant="underline" onClick={clearDates}>
          Clear Dates
        </Button>
      </div>

      {isPopupOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full relative">
            <h2 className="text-lg font-semibold mb-12">Keyboard Shortcuts</h2>
            <div className="space-y-3">
              {keyboardShortcuts.map((shortcut, index) => (
                <div key={index} className="flex items-center gap-10">
                  <p className="bg-primary text-secondary text-xs font-normal  px-2 py-1 rounded mr-4 min-w-[60px] text-center">
                    {shortcut.key}
                  </p>
                  <p className="text-base font-normal  text-destructive max-w-60 text-left">
                    {shortcut.description}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-6 text-right">
              <Button variant="underline" onClick={togglePopup}>
                Back to Calendar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateSelector;
