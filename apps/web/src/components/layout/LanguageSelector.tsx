"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslation, supportedLanguages } from "@beautonomi/i18n";

export function LanguageSelector() {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const current =
    supportedLanguages.find((l) => l.code === i18n.language) ||
    supportedLanguages[0];

  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem("beautonomi_locale", code);
    setIsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 transition"
        aria-label="Change language"
      >
        <span className="text-base">🌐</span>
        <span>{current.nativeName}</span>
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border z-50 py-1">
          {supportedLanguages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => changeLanguage(lang.code)}
              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition ${
                lang.code === i18n.language
                  ? "bg-pink-50 text-pink-600 font-medium"
                  : ""
              }`}
            >
              <span className="font-medium">{lang.nativeName}</span>
              <span className="text-gray-400 ml-2 text-xs">{lang.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
