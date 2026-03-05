"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Globe } from "lucide-react";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/lib/i18n/config";
import { fetcher } from "@/lib/http/fetcher";

type LangOption = { code: string; name: string; nativeName: string };

interface LanguageSelectorProps {
  currentLanguage?: SupportedLanguage | string;
  onLanguageChange?: (lang: string) => void;
}

export default function LanguageSelector({
  currentLanguage = "en",
  onLanguageChange,
}: LanguageSelectorProps) {
  const [language, setLanguage] = useState<string>(currentLanguage);
  const [isLoading, setIsLoading] = useState(false);
  const [languages, setLanguages] = useState<LangOption[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetcher.get<{ data?: LangOption[] }>("/api/public/languages");
        const list = Array.isArray(res?.data) ? res.data : [];
        if (list.length) setLanguages(list);
      } catch {
        setLanguages(SUPPORTED_LANGUAGES.map((l) => ({ code: l.code, name: l.name, nativeName: l.nativeName })));
      }
    })();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("preferred_language");
    if (saved && (languages.some((l) => l.code === saved) || SUPPORTED_LANGUAGES.some((l) => l.code === saved))) {
      setLanguage(saved);
    }
  }, [languages]);

  const options = languages.length ? languages : SUPPORTED_LANGUAGES.map((l) => ({ code: l.code, name: l.name, nativeName: l.nativeName }));

  const handleLanguageChange = async (newLang: string) => {
    if (newLang === language) return;

    setIsLoading(true);
    try {
      // Save to localStorage
      localStorage.setItem("preferred_language", newLang);

      // Optionally save to user preferences in database
      try {
        await fetcher.post("/api/me/preferences", {
          language: newLang,
        });
      } catch (err) {
        // Ignore errors - localStorage is sufficient
        console.warn("Failed to save language preference:", err);
      }

      setLanguage(newLang);
      onLanguageChange?.(newLang);
    } catch (err) {
      console.error("Error changing language:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const currentLangData = options.find((l) => l.code === language) || options[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isLoading}>
          <Globe className="w-4 h-4 mr-2" />
          {currentLangData?.nativeName ?? language}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className={language === lang.code ? "bg-accent" : ""}
          >
            <div className="flex flex-col">
              <span className="font-medium">{lang.nativeName}</span>
              <span className="text-xs text-gray-500">{lang.name}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
