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

interface LanguageSelectorProps {
  currentLanguage?: SupportedLanguage;
  onLanguageChange?: (lang: SupportedLanguage) => void;
}

export default function LanguageSelector({ 
  currentLanguage = "en",
  onLanguageChange 
}: LanguageSelectorProps) {
  const [language, setLanguage] = useState<SupportedLanguage>(currentLanguage);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Load saved language preference
    const saved = localStorage.getItem("preferred_language");
    if (saved && SUPPORTED_LANGUAGES.find((l) => l.code === saved)) {
      setLanguage(saved as SupportedLanguage);
    }
  }, []);

  const handleLanguageChange = async (newLang: SupportedLanguage) => {
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

      // Reload page to apply translations (or use a context provider for client-side)
      // window.location.reload();
    } catch (err) {
      console.error("Error changing language:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const currentLangData = SUPPORTED_LANGUAGES.find((l) => l.code === language) || SUPPORTED_LANGUAGES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isLoading}>
          <Globe className="w-4 h-4 mr-2" />
          {currentLangData.nativeName}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SUPPORTED_LANGUAGES.map((lang) => (
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
