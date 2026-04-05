"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HelpPageContent } from "../page";

const DEFAULT_SUGGESTIONS = [
  "Canceling your booking",
  "Change the date or time of your appointment",
  "If your provider cancels your booking",
];

function sectionText(content: HelpPageContent | null | undefined, key: string) {
  return content?.[key]?.content?.trim() ?? "";
}

interface SearchBoxProps {
  content?: HelpPageContent | null;
}

export default function SearchBox({ content = null }: SearchBoxProps) {
  const [isSearchActive, setIsSearchActive] = useState(false);

  const heroTitle = sectionText(content, "hero_title") || "Hi, how can we help?";
  const searchPlaceholder =
    sectionText(content, "search_placeholder") || "Search how-tos and more";

  const [query, setQuery] = useState("");
  const rawSuggestions = sectionText(content, "search_suggestions");
  const searchSuggestions = useMemo(() => {
    if (!rawSuggestions) return DEFAULT_SUGGESTIONS;
    try {
      const parsed = JSON.parse(rawSuggestions) as unknown;
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
        return parsed as string[];
      }
    } catch {
      // keep defaults
    }
    return DEFAULT_SUGGESTIONS;
  }, [rawSuggestions]);

  return (
    <div className="mb-8">
    <div className="flex flex-col items-center gap-4 p-8">
      <h1 className="text-5xl font-normal mb-3">
        {heroTitle}
      </h1>
      <div className="relative w-full max-w-2xl">
        <div
          className={`relative flex items-center max-w-sm mx-auto py-3 pl-3 pr-2 border rounded-full transition-colors ${
            isSearchActive
              ? "bg-white border-zinc-300 shadow-xl"
              : "bg-zinc-100 border-zinc-300"
          }`}
          onFocus={() => setIsSearchActive(true)}
          onBlur={() => setIsSearchActive(false)}
        >
          <Input
            type="text"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) {
                window.location.href = `/search?q=${encodeURIComponent(query.trim())}`;
              }
            }}
            className="flex-grow outline-none text-[14px] font-normal text-zinc-800 placeholder:text-zinc-500 px-4 border-none bg-transparent rounded-full transition-colors duration-300"
          />
          {!isSearchActive && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-2">
              <Button
                className="flex items-center justify-center h-11 w-11 rounded-full bg-gradient-to-r from-primary to-primary-hover p-2"
                onClick={() => setIsSearchActive(true)}
              >
                <SearchIcon className="w-5 h-5 text-white" />
              </Button>
            </div>
          )}
          {isSearchActive && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-2">
              <div className="h-11 w-28 flex items-center gap-2 justify-center rounded-full bg-gradient-to-r from-primary to-primary-hover">
                <Button
                  className="flex items-center gap-2 rounded-full bg-transparent"
                  onClick={() => {
                    if (query.trim()) {
                      window.location.href = `/search?q=${encodeURIComponent(query.trim())}`;
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
              <div className="flex items-center gap-4 pb-2 border-b border-gray-100">
                <Link href="/learn" className="flex items-center gap-4 w-full text-primary hover:underline font-medium text-sm">
                  <div className="p-2 bg-gray-200 rounded-xl">
                    <FileTextIcon className="w-6 h-6" />
                  </div>
                  Browse Learning Center
                </Link>
              </div>
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
