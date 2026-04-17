"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HelpPageContent } from "../page";

interface Suggestion {
  label: string;
  href: string;
}

/**
 * Built-in suggestions with direct article links.
 * Labels must stay in sync with what the CMS may return so the merge below works.
 */
const DEFAULT_SUGGESTIONS: Suggestion[] = [
  { label: "Using the customer app (iOS & Android)", href: "/learn/article/customer-mobile-app" },
  { label: "Canceling your booking", href: "/learn/article/canceling-your-booking" },
  { label: "Change the date or time of your appointment", href: "/learn/article/reschedule-booking" },
  { label: "If your provider cancels your booking", href: "/learn/article/if-provider-cancels" },
  { label: "Payment methods accepted", href: "/learn/article/payment-methods-accepted" },
  { label: "Editing, removing, or adding a payment method", href: "/learn/article/edit-payment-method" },
  { label: "When you'll pay for your booking", href: "/learn/article/when-you-pay-booking" },
  { label: "How do I delete my account?", href: "/data-deletion" },
];

function sectionText(content: HelpPageContent | null | undefined, key: string) {
  return content?.[key]?.content?.trim() ?? "";
}

interface SearchBoxProps {
  content?: HelpPageContent | null;
}

export default function SearchBox({ content = null }: SearchBoxProps) {
  const router = useRouter();
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [query, setQuery] = useState("");

  const heroTitle = sectionText(content, "hero_title") || "Hi, how can we help?";
  const searchPlaceholder =
    sectionText(content, "search_placeholder") || "Search how-tos and more";

  const rawSuggestions = sectionText(content, "search_suggestions");

  /**
   * Merge CMS label list with the known-link table.
   * CMS-provided labels override the default set; any label with no match gets a learn search link.
   */
  const allSuggestions = useMemo<Suggestion[]>(() => {
    let cmsLabels: string[] = [];
    if (rawSuggestions) {
      try {
        const parsed = JSON.parse(rawSuggestions) as unknown;
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
          cmsLabels = parsed as string[];
        }
      } catch {
        // fall through to defaults
      }
    }
    if (cmsLabels.length === 0) return DEFAULT_SUGGESTIONS;
    return cmsLabels.map((label) => {
      const known = DEFAULT_SUGGESTIONS.find(
        (d) => d.label.toLowerCase() === label.toLowerCase(),
      );
      return known ?? { label, href: `/learn?q=${encodeURIComponent(label)}` };
    });
  }, [rawSuggestions]);

  /** Filter by typed query; fall back to all when empty. */
  const filteredSuggestions = useMemo<Suggestion[]>(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return allSuggestions.slice(0, 5);
    return allSuggestions
      .filter((s) => s.label.toLowerCase().includes(trimmed))
      .slice(0, 5);
  }, [query, allSuggestions]);

  const handleSearch = () => {
    const q = query.trim();
    if (!q) return;
    router.push(`/learn?q=${encodeURIComponent(q)}`);
    setIsSearchActive(false);
  };

  return (
    <div className="mb-8">
      <div className="flex flex-col items-center gap-4 py-6 sm:py-8 px-0 sm:px-4">
        <h1 className="text-3xl sm:text-5xl font-normal mb-3 text-center px-1 max-w-[min(100%,42rem)] leading-tight">
          {heroTitle}
        </h1>
        <div className="relative w-full max-w-2xl">
          <div
            className={`relative flex items-center max-w-sm mx-auto py-3 pl-3 pr-2 border rounded-full transition-colors ${
              isSearchActive
                ? "bg-white border-zinc-300 shadow-xl"
                : "bg-zinc-100 border-zinc-300"
            }`}
          >
            <Input
              type="text"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsSearchActive(true)}
              onBlur={() => {
                // Delay so any mousedown on a suggestion registers before the dropdown closes.
                setTimeout(() => setIsSearchActive(false), 160);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
                if (e.key === "Escape") setIsSearchActive(false);
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
                    onMouseDown={(e) => {
                      e.preventDefault(); // keep focus so blur timeout does not close the dropdown
                      handleSearch();
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
            <Card className="absolute top-20 left-0 right-0 mt-2 pr-5 shadow-2xl max-w-sm mx-auto rounded-[32px] z-50">
              <CardHeader>
                <CardTitle>{query.trim() ? "Suggestions" : "Top articles"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {/* Always-visible: Browse Learning Center */}
                <div className="pb-2 mb-2 border-b border-gray-100">
                  <Link
                    href="/learn"
                    className="flex items-center gap-4 w-full text-primary hover:underline font-medium text-sm py-1"
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <div className="p-2 bg-gray-200 rounded-xl shrink-0">
                      <FileTextIcon className="w-6 h-6" />
                    </div>
                    Browse Learning Center
                  </Link>
                </div>

                {/* Filtered suggestions */}
                {filteredSuggestions.length > 0 ? (
                  filteredSuggestions.map((s, index) => (
                    <Link
                      key={index}
                      href={s.href}
                      className="flex items-center gap-4 hover:bg-gray-50 rounded-lg -mx-2 px-2 py-2 transition-colors"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <div className="p-2 bg-gray-200 rounded-xl shrink-0">
                        <FileTextIcon className="w-6 h-6" />
                      </div>
                      <span className="text-sm font-light text-secondary">{s.label}</span>
                    </Link>
                  ))
                ) : (
                  /* Typed query matched nothing: offer a direct "search for X" link */
                  <Link
                    href={`/learn?q=${encodeURIComponent(query.trim())}`}
                    className="flex items-center gap-4 hover:bg-gray-50 rounded-lg -mx-2 px-2 py-2 transition-colors"
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <div className="p-2 bg-gray-200 rounded-xl shrink-0">
                      <SearchIcon className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-light text-secondary">
                      Search for &ldquo;{query}&rdquo;
                    </span>
                  </Link>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function FileTextIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
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

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
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
