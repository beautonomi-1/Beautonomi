"use client";
import React from "react";
import Image from "next/image";
import UserImage from "./../../../../public/images/8aa5cbca-b607-4a45-bd0c-2d63a663aa30.webp";

type TeamMember = {
  name: string;
  role: string;
  avatar?: string;
};

const teamMembers: TeamMember[] = [
  { name: "Zimasa", role: "Nail Technician", avatar: UserImage.src },
  { name: "Shannen", role: "Nail Technician", avatar: UserImage.src },
  { name: "Qaqamba", role: "Nail Technician", avatar: UserImage.src },
  { name: "Laurraine", role: "Pedicure Technician", avatar: UserImage.src },
  { name: "Agness", role: "Pedicure Technician", avatar: UserImage.src },
  { name: "Prunella", role: "Pedicure Technician", avatar: UserImage.src },
  { name: "Farllon", role: "Nail Technician", avatar: UserImage.src },
  { name: "Natasha", role: "Pedicure Technician", avatar: UserImage.src },
  { name: "Memory", role: "Nail Technician", avatar: UserImage.src },
];

const PartnerTeam: React.FC = () => {
  return (
    <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
      <h2 className="text-2xl font-semibold mb-6">Team</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {teamMembers.map((member, index) => (
          <div key={index} className="flex flex-col items-center text-center">
            <div className="relative w-20 h-20 mb-3">
              {member.avatar ? (
                <Image
                  src={member.avatar}
                  alt={member.name}
                  width={80}
                  height={80}
                  className="rounded-full object-cover"
                />
              ) : (
                <div className="w-full h-full rounded-full bg-gray-200 flex items-center justify-center text-2xl font-semibold text-gray-500">
                  {member.name.charAt(0)}
                </div>
              )}
            </div>
            <p className="font-medium text-sm mb-1">{member.name}</p>
            <p className="text-gray-500 text-xs">{member.role}</p>
          </div>
        ))}
      </div>
      <div className="mt-6">
        <button className="text-gray-600 hover:text-gray-900 underline text-sm">
          See all
        </button>
      </div>
    </div>
  );
};

export default PartnerTeam;
