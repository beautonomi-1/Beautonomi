import React from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const OptionCard = ({
  title,
  description,
  link,
}: {
  title: string;
  description: string;
  link?: string;
}) => (
  <Link href={link || "#"}>
    <div className="block p-4 border border-gray-200 hover:border-gray-300 rounded-lg mb-4 cursor-pointer duration-200 hover:bg-[#f7f7f7]">
      <h3 className="font-light text-lg">{title}</h3>
      <p className="text-gray-600 font-light">{description}</p>
    </div>
  </Link>
);

const OptionGroup = ({
  title,
  options,
}: {
  title: string;
  options: { title: string; description: string; link?: string }[];
}) => (
  <div className="mb-6">
    <h2 className="font-semibold text-xl mb-3">{title}</h2>
    {options.map((option, index) => (
      <OptionCard key={index} {...option} />
    ))}
  </div>
);

interface AppointmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const AppointmentDialog: React.FC<AppointmentDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const options = {
    book: [
      {
        title: "Book an appointment",
        description: "Schedule services for yourself",
        link: "/checkout", 
      },
      {
        title: "Group appointment",
        description: "For yourself and others",
        link: "/checkout", 
      },
    ],
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className=" z-[9999]">
        <DialogHeader>
          <DialogTitle className="text-4xl font-light text-center mb-8">
            Choose an option
          </DialogTitle>
          <DialogDescription className="sr-only">
            Select an appointment booking option
          </DialogDescription>
        </DialogHeader>
        <div className="max-w-[620px] mx-auto p-6">
          <OptionGroup title="Book" options={options.book} />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AppointmentDialog;
