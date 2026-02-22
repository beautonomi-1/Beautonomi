"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SearchBox() {
  const [isSearchActive, setIsSearchActive] = useState(false);

  // Define an array of search suggestions
  const searchSuggestions = [
    "Canceling your reservation for a stay",
    "Change the date or time of your Experience reservation",
    "If your Beauty Partner cancels your reservation"
  ];

  return (
    <div className="mb-8">
    <div className="flex flex-col items-center gap-4 p-8">
      <h1 className="text-5xl font-normal  mb-3">
        Hi, how can we help?
      </h1>
      <div className="relative w-full max-w-2xl">
        <div
          className={`relative flex items-center max-w-sm mx-auto py-3 pl-3 pr-2 border rounded-full ${
            isSearchActive ? "bg-white shadow-2xl" : "bg-primary"
          }`}
          onFocus={() => setIsSearchActive(true)}
          onBlur={() => setIsSearchActive(false)}
        >
          <Input
            type="text"
            placeholder="Search how-tos and more"
            className="flex-grow outline-none text-base font-light  px-4 border-none bg-transparent rounded-full transition-colors duration-300"
          />
          {!isSearchActive && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-2">
              <Button
                className="flex items-center justify-center h-11 w-11 rounded-full bg-gradient-to-r from-[#FF0077] to-[#D60565] p-2"
                onClick={() => setIsSearchActive(true)}
              >
                <SearchIcon className="w-5 h-5 text-white" />
              </Button>
            </div>
          )}
          {isSearchActive && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-2">
              <div className="h-11 w-28 flex items-center gap-2 justify-center rounded-full bg-gradient-to-r from-[#FF0077] to-[#D60565]">
                <Button
                  className="flex items-center gap-2 rounded-full bg-transparent"
                  onClick={() => {
                    // Navigate to search results or perform search
                    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
                    if (input && input.value.trim()) {
                      window.location.href = `/search?q=${encodeURIComponent(input.value.trim())}`;
                    }
                  }}
                >
                  <SearchIcon className="w-5 h-5 text-white" />
                  <span className="text-white font-light">Search</span>
                </Button>
              </div>
            </div>
          )}
        </div>
        {isSearchActive && (
          <Card className="absolute top-20 left-0 right-0 mt-2 pr-5 shadow-2xl max-w-sm mx-auto rounded-[32px]">
            <CardHeader>
              <CardTitle>Top articles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {searchSuggestions.map((suggestion, index) => (
                <div key={index} className="flex items-center gap-4">
                  <div className="p-2 bg-gray-200 rounded-xl">
                    <FileTextIcon className="w-6 h-6" />
                  </div>
                  <span className="text-sm font-light  text-secondary">{suggestion}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
    </div>
  );
}

function FileTextIcon(props: any) {
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
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
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
