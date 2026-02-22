"use client"
import { useState } from 'react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

// Sample job listings data
const jobListings = [
  {
    category: "Finance & Accounting",
    locationType: "Live and Work Anywhere",
    title: "Associate Principal Technical Control Testing",
    location: "India",
  },
    {
    category: "Finance & Accounting",
    locationType: "Live and Work Anywhere",
    title: "Associate Principal Technical Control Testing",
    location: "India",
  },
  {
    category: "Community Support",
    locationType: "Live and Work Anywhere",
    title: "Directeur·rice Principal·e des Services Spécialisés (Canada)",
    location: "Canada / United States",
  },
    {
    category: "Finance & Accounting",
    locationType: "Live and Work Anywhere",
    title: "Associate Principal Technical Control Testing",
    location: "India",
  },
  {
    category: "Finance",
    locationType: "Hybrid - Be close to an office",
    title: "Associate Principal, Strategic Finance & Analytics, Americas",
    location: "Mexico City, Mexico",
  },
  {
    category: "Finance & Accounting",
    locationType: "Live and Work Anywhere",
    title: "Associate Principal, Technical Control Design",
    location: "Gurugram, India",
  },
  {
    category: "Community Support",
    locationType: "Live and Work Anywhere",
    title: "Associé(e) au Support Premium",
    location: "Canada",
  },
  {
    category: "Operations",
    locationType: "Live and Work Anywhere",
    title: "Business Operations Manager",
    location: "United States",
  },
  {
    category: "Operations",
    locationType: "Live and Work Anywhere",
    title: "Business Operations Manager, Payments",
    location: "United States",
  },
  {
    category: "Community Support",
    locationType: "Onsite",
    title: "Business Process Improvement, Manager",
    location: "Gurugram, India",
  },
  {
    category: "Engineering",
    locationType: "Onsite",
    title: "Data Engineer – HotelTonight",
    location: "Bangalore, India",
  },
  {
    category: "Data Science",
    locationType: "Live and Work Anywhere",
    title: "Data Scientist, Algorithms – Core DS",
    location: "United States",
  },
  {
    category: "Community Support",
    locationType: "Live and Work Anywhere",
    title: "Directeur·rice Principal·e des Services Spécialisés (Canada)",
    location: "Canada / United States",
  },
  {
    category: "Community Support",
    locationType: "Live and Work Anywhere",
    title: "Directeur·rice Principal·e des Services Spécialisés (Canada)",
    location: "Canada / United States",
  },
];

const ITEMS_PER_PAGE = 10; // Number of items per page

export default function JobsGrid() {
  const [currentPage, setCurrentPage] = useState(1);

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;

  const paginatedJobs = jobListings.slice(startIndex, endIndex);

  const totalPages = Math.ceil(jobListings.length / ITEMS_PER_PAGE);

  const pageNumbers = [];
  for (let i = 1; i <= totalPages; i++) {
    pageNumbers.push(i);
  }

  // Handler functions for pagination
  const handlePageClick = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  return (
    <div className="px-8 mb-56">
      {/* Header Section */}
      <div className=" grid lg:flex justify-normal lg:justify-between items-center mb-10">
        <h2 className="text-[22px] text-secondary font-normal  ">
          Showing {(startIndex + 1)}-{Math.min(endIndex, jobListings.length)} results out of total {jobListings.length} open jobs
        </h2>
        <div className="text-right flex gap-2 items-center max-w-80  ml-auto">
          <span className="w-full text-base font-normal ">
            Sort by:
          </span>
          <Select>
            <SelectTrigger id="sort" aria-label="Sort by">
              <SelectValue placeholder="Job Title (A-Z)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="job-title-asc">Job Title (A-Z)</SelectItem>
              <SelectItem value="job-title-desc">Job Title (Z-A)</SelectItem>
              <SelectItem value="location-asc">Location (A-Z)</SelectItem>
              <SelectItem value="location-desc">Location (Z-A)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Job Listings */}
      <ul className="space-y-4">
        {paginatedJobs.map((job, index) => (
          <li key={index} className="border-b pb-2 grid lg:flex justify-normal lg:justify-between">
            <div className='mb-6 lg:mb-0'>
              <h3 className="text-xs font-normal  text-[#717171]">
                {job.category} · {job.locationType}
              </h3>
              <h2 className="text-base font-normal ">
                {job.title}
              </h2>
            </div>
            <div>
              <h4 className="text-right text-base font-normal  text-[#717171]">{job.location}</h4>
            </div>
          </li>
        ))}
      </ul>

      {/* Pagination Controls */}
      <div className="flex items-center justify-center mt-4 space-x-2">
        {/* Previous Page */}
        <button 
          className="p-2 rounded-full  disabled:opacity-50"
          onClick={() => handlePageClick(currentPage - 1)}
          disabled={currentPage === 1}
        >
          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

         {/* Page Numbers  */}
        {pageNumbers.map((number) => (
          <button
            key={number}
            className={`h-8 w-8 rounded-full text-sm font-normal ${
              number === currentPage ? 'bg-black text-white' : ' text-gray-600'
            }`}
            onClick={() => handlePageClick(number)}
          >
            {number}
          </button>
        ))}

        {/* Next Page */}
        <button 
          className="p-2 rounded-full  "
          onClick={() => handlePageClick(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
