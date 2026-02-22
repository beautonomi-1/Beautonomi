import React from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SelectValue, SelectTrigger, SelectItem, SelectContent, Select } from "@/components/ui/select";

export default function JobSearch() {
  return (
    <div className="bg-secondary pt-20 pb-24 mb-20">
      <div className="container flex flex-col items-center text-white">
        <h1 className="text-[72px] font-normal  mb-2">All Jobs</h1>
        <p className="text-lg font-normal  text-[#dddddd] mb-14">160 open roles</p>
        <div className="relative flex items-center max-w-xl mx-auto mb-8 py-3 pl-3 pr-2 border rounded-full bg-[#f7f7f7]">
          <Input
            type="text"
            placeholder="Start your search"
            className="flex-grow outline-none text-base font-normal  px-4 border-none bg-transparent rounded-full transition-colors duration-300"
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-2">
            <Button className="flex items-center justify-center h-11 w-11 rounded-full bg-gradient-to-r from-[#FF0077] to-[#D60565] p-2">
              <SearchIcon className="w-5 h-5 text-white" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap justify-center mt-8 gap-5">
          <Select>
            <SelectTrigger className="rounded-full bg-transparent text-white py-7 px-5 w-56">
              <SelectValue placeholder="Team"/>
            </SelectTrigger>
            <SelectContent className="">
              <SelectItem value="engineering">Engineering</SelectItem>
              <SelectItem value="design">Design</SelectItem>
              <SelectItem value="marketing">Marketing</SelectItem>
            </SelectContent>
          </Select>
          <Select>
            <SelectTrigger className=" rounded-full bg-transparent text-white py-7 px-5 w-56">
              <SelectValue placeholder="Where You Work" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="remote">Remote</SelectItem>
              <SelectItem value="onsite">Onsite</SelectItem>
              <SelectItem value="hybrid">Hybrid</SelectItem>
            </SelectContent>
          </Select>
          <Select>
            <SelectTrigger className=" rounded-full bg-transparent text-white py-7 px-5 w-56">
              <SelectValue placeholder="Work Flexibility" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full-time">Full-time</SelectItem>
              <SelectItem value="part-time">Part-time</SelectItem>
              <SelectItem value="contract">Contract</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

// SearchIcon component
function SearchIcon(props: React.JSX.IntrinsicAttributes & React.SVGProps<SVGSVGElement>) {
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