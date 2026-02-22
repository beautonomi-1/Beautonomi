'use client'
import React from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useRouter } from "next/navigation"; 

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

const AppointmentPage: React.FC = () => {
  const router = useRouter(); 

  const handleClose = () => {
    router.push("/partner-profile"); 
  };

  const options = {
    book: [
      {
        title: "Book an appointment",
        description: "Schedule services for yourself",
        link: "/booking",
      },
      {
        title: "Group appointment",
        description: "For yourself and others",
        link: "/booking",
      },
    ],
  };

  return (
    <div className="bg-primary min-h-screen">
        <div className="justify-end flex p-4">
      <button className="p-2 rounded-full border" onClick={handleClose}>
        <X />
      </button>
      </div>
      <div className="max-w-[620px] w-full mx-auto p-6">
        <h1 className="text-4xl font-light text-center mb-8">Choose an option</h1>
        <OptionGroup title="Book" options={options.book} />
      </div>
    </div>
  );
};

export default AppointmentPage;
