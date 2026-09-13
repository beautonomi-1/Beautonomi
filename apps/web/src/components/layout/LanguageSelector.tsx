"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslation, supportedLanguages, normalizeLanguageCode, ensureLocaleResources } from "@beautonomi/i18n";
import { persistClientLanguage } from "@/lib/locale/persist-client-language";
import { useAuth } from "@/providers/AuthProvider";
import { fetcher } from "@/lib/http/fetcher";
import { useLanguageOptions } from "@/hooks/useLanguageOptions";

export function LanguageSelector() {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { waveA, waveB } = useLanguageOptions(true);
  const currentLanguage = normalizeLanguageCode(i18n.language);

  const currentMeta = supportedLanguages.find((l) => l.code === currentLanguage);
  const currentOption =
    waveA.find((l) => l.code === currentLanguage) ??
    waveB.find((l) => l.code === currentLanguage);

  const changeLanguage = async (code: string) => {
    const resolved = normalizeLanguageCode(code);
    await ensureLocaleResources(i18n, resolved);
    await i18n.changeLanguage(resolved);
    persistClientLanguage(resolved);
    if (user) {
      void fetcher.post("/api/me/preferences", { language: resolved }).catch(() => {});
    }
    setIsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const renderOption = (lang: { code: string; name: string }) => (
    <button
      key={lang.code}
      type="button"
      onClick={() => void changeLanguage(lang.code)}
      className={`w-full text-start px-4 py-2.5 text-sm hover:bg-gray-50 transition ${
        lang.code === currentLanguage ? "bg-pink-50 text-pink-600 font-medium" : ""
      }`}
    >
      <span className="font-medium">{lang.name.split(" (")[0]}</span>
      <span className="text-gray-400 ms-2 text-xs">
        {lang.name.match(/\(([^)]+)\)/)?.[1] ?? lang.code}
      </span>
    </button>
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 transition"
        aria-label={t("web.a11y.changeLanguage")}
      >
        <span className="text-base">🌐</span>
        <span>{currentMeta?.nativeName ?? currentOption?.name?.split(" (")[0] ?? currentLanguage}</span>
      </button>
      {isOpen && (
        <div className="absolute end-0 mt-1 w-48 max-h-80 overflow-y-auto bg-white rounded-lg shadow-lg border z-50 py-1">
          {waveA.map(renderOption)}
          {waveB.length > 0 && (
            <>
              <div className="my-1 border-t" />
              <p className="px-4 py-1 text-xs font-medium text-gray-500">
                {t("web.common.moreLanguages")}
              </p>
              {waveB.map(renderOption)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
