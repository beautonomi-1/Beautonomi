"use client";
import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetcher } from "@/lib/http/fetcher";

interface Language {
  name: string;
  region: string;
}

/** ISO row from `/api/public/preference-options?type=currency` (tenant-scoped, iso_currencies-backed). */
interface Currency {
  iso: string;
  name: string;
  detail: string;
}

const languages: Language[] = [
    { name: "English", region: "United States" },
    { name: "Azərbaycan dili", region: "Azərbaycan" },
    { name: "Bahasa Indonesia", region: "Indonesia" },
    { name: "Bosanski", region: "Bosna i Hercegovina" },
    { name: "Català", region: "Espanya" },
    { name: "Čeština", region: "Česká republika" },
    { name: "Crnogorski", region: "Crna Gora" },
    { name: "Dansk", region: "Danmark" },
    { name: "Deutsch", region: "Deutschland" },
    { name: "Deutsch", region: "Österreich" },
    { name: "Deutsch", region: "Schweiz" },
    { name: "Deutsch", region: "Luxemburg" },
    { name: "Eesti", region: "Eesti" },
    { name: "English", region: "Australia" },
    { name: "English", region: "Canada" },
    { name: "English", region: "Guyana" },
    { name: "English", region: "India" },
    { name: "English", region: "Ireland" },
    { name: "English", region: "New Zealand" },
    { name: "English", region: "Singapore" },
    { name: "English", region: "United Arab Emirates" },
    { name: "English", region: "United Kingdom" },
    { name: "Español", region: "Argentina" },
    { name: "Español", region: "Belice" },
    { name: "Español", region: "Bolivia" },
    { name: "Español", region: "Chile" },
  { name: "Español", region: "Colombia" },
  { name: "Español", region: "Costa Rica" },
  { name: "Español", region: "Ecuador" },
  { name: "Español", region: "El Salvador" },
  { name: "Español", region: "España" },
  { name: "Español", region: "Estados Unidos" },
  { name: "Español", region: "Guatemala" },
  { name: "Español", region: "Honduras" },
  { name: "Español", region: "Latinoamérica" },
  { name: "Español", region: "México" },
  { name: "Español", region: "Nicaragua" },
  { name: "Español", region: "Panamá" },
  { name: "Español", region: "Paraguay" },
  { name: "Español", region: "Perú" },
  { name: "Español", region: "Venezuela" },
  { name: "Français", region: "Belgique" },
  { name: "Français", region: "Canada" },
  { name: "Français", region: "France" },
  { name: "Français", region: "Suisse" },
  { name: "Français", region: "Luxembourg" },
  { name: "Gaeilge", region: "Éire" },
  { name: "Hrvatski", region: "Hrvatska" },
  { name: "isiXhosa", region: "eMzantsi Afrika" },
  { name: "isiZulu", region: "iNingizimu Afrika" },
  { name: "Íslenska", region: "Ísland" },
  { name: "Italiano", region: "Italia" },
  { name: "Italiano", region: "Svizzera" },
  { name: "Kiswahili", region: "Afrika" },
  { name: "Latviešu", region: "Latvija" },
  { name: "Lietuvių", region: "Lietuva" },
  { name: "Magyar", region: "Magyarország" },
  { name: "Malti", region: "Malta" },
  { name: "Melayu", region: "Malaysia" },
  { name: "Vlaams", region: "België" },
  { name: "Nederlands", region: "Nederland" },
  { name: "Norsk", region: "Norge" },
  { name: "Polski", region: "Polska" },
  { name: "Português", region: "Brasil" },
  { name: "Português", region: "Portugal" },
  { name: "Română", region: "România" },
  { name: "Shqip", region: "Shqipëri" },
  { name: "Slovenčina", region: "Slovensko" },
  { name: "Slovenščina", region: "Slovenija" },
  { name: "Srpski", region: "Srbija" },
  { name: "Suomi", region: "Suomi" },
  { name: "Svenska", region: "Sverige" },
  { name: "Tagalog", region: "Pilipinas" },
  { name: "Tiếng Việt", region: "Việt Nam" },
  { name: "Türkçe", region: "Türkiye" },
  { name: "Ελληνικά", region: "Ελλάδα" },
  { name: "Български", region: "България" },
  { name: "Македонски", region: "Северна Македонија" },
  { name: "Русский", region: "Россия" },
  { name: "Українська", region: "Україна" },
  { name: "ქართული", region: "საქართველო" },
  { name: "Հայերեն", region: "Հայաստան" },
  { name: "עברית", region: "ישראל" },
  { name: "العربية", region: "العالم" },
  { name: "हिंदी", region: "भारत" },
  { name: "ไทย", region: "ประเทศไทย" },
  { name: "한국어", region: "대한민국" },
  { name: "日本語", region: "日本" },
  { name: "简体中文", region: "美国" },
  { name: "繁體中文", region: "美國" },
  { name: "简体中文", region: "中国" },
  { name: "繁體中文", region: "香港" },
  { name: "繁體中文", region: "台灣" }
  ];
  
  interface LanguageModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }
  
  export default function LanguageModal({ open, onOpenChange }: LanguageModalProps) {
    const [translation, setTranslation] = useState(false);
    const [selectedLanguage, setSelectedLanguage] = useState<Language | null>(null);
    const [selectedCurrency, setSelectedCurrency] = useState<Currency | null>(null);
    const [currencies, setCurrencies] = useState<Currency[]>([]);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
      queueMicrotask(() => setIsMounted(true));
    }, []);

    useEffect(() => {
      if (!open) return;
      let cancelled = false;
      void (async () => {
        try {
          const res = await fetcher.get<{
            data?: Array<{ code: string; name: string; metadata?: Record<string, unknown> }>;
          }>("/api/public/preference-options?type=currency");
          const rows = Array.isArray(res?.data) ? res.data : [];
          if (cancelled) return;
          const mapped: Currency[] = rows.map((r) => {
            const sym =
              r.metadata && typeof r.metadata === "object" && "symbol" in r.metadata
                ? String((r.metadata as { symbol?: unknown }).symbol ?? "").trim()
                : "";
            return {
              iso: String(r.code).toUpperCase(),
              name: r.name,
              detail: sym ? `${String(r.code).toUpperCase()} · ${sym}` : String(r.code).toUpperCase(),
            };
          });
          setCurrencies(mapped.length > 0 ? mapped : [
            {
              iso: LAST_RESORT_CURRENCY,
              name:
                new Intl.DisplayNames(undefined, { type: "currency" }).of(LAST_RESORT_CURRENCY) ??
                LAST_RESORT_CURRENCY,
              detail: LAST_RESORT_CURRENCY,
            },
          ]);
        } catch {
          if (!cancelled) {
            setCurrencies([
              {
                iso: LAST_RESORT_CURRENCY,
                name:
                  new Intl.DisplayNames(undefined, { type: "currency" }).of(LAST_RESORT_CURRENCY) ??
                  LAST_RESORT_CURRENCY,
                detail: LAST_RESORT_CURRENCY,
              },
            ]);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [open]);
  
    const renderLanguageGrid = (
      items: Language[],
      selectedItem: Language | null,
      setSelectedItem: React.Dispatch<React.SetStateAction<Language | null>>
    ) => (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {items.map((item, index) => (
          <div
            key={index}
            className={`h-auto p-2 rounded-lg cursor-pointer ${
              selectedItem && selectedItem.region === item.region
                ? 'border border-secondary'
                : 'border-none'
            }`}
            onClick={() => setSelectedItem(item)}
          >
            <div className="text-left">
              <div className="font-light text-sm text-secondary">{item.name}</div>
              <div className="font-light text-sm text-destructive">{item.region}</div>
            </div>
          </div>
        ))}
      </div>
    );
  
    const renderCurrencyGrid = (
      items: Currency[],
      selectedItem: Currency | null,
      setSelectedItem: React.Dispatch<React.SetStateAction<Currency | null>>
    ) => (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {items.map((item, index) => (
          <div
            key={index}
            className={`h-auto p-2 rounded-lg cursor-pointer ${
              selectedItem && selectedItem.iso === item.iso
                ? 'border border-secondary'
                : 'border-none'
            }`}
            onClick={() => setSelectedItem(item)}
          >
            <div className="text-left">
              <div className="font-light text-sm text-secondary">{item.name}</div>
              <div className="font-light text-sm text-destructive">{item.detail}</div>
            </div>
          </div>
        ))}
      </div>
    );
  
    const renderTabContent = (
      title: string,
      renderGrid: () => React.ReactElement
    ) => (
      <>
        <div className="rounded-md bg-primary p-4 mb-4 w-full max-w-lg">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-light text-sm text-secondary">Translation</h4>
              <p className="font-light text-sm text-destructive">
                Automatically translate descriptions and reviews to English.
              </p>
            </div>
            <Switch checked={translation} onCheckedChange={setTranslation} />
          </div>
        </div>
        <h3 className="text-[22px] font-medium text-secondary mb-4">{title}</h3>
        {renderGrid()}
      </>
    );
  
    if (!open) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="w-full max-w-5xl h-[700px] overflow-auto bg-white p-8 rounded-lg max-h-[90%]">
          <div
            className="rounded-sm opacity-70 mb-5 cursor-pointer"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </div>
          {isMounted ? (
            <Tabs defaultValue="language" className="">
              <TabsList className="bg-transparent">
                <TabsTrigger value="language" className="bg-transparent data-[state=active]:shadow-none w-1/2">
                  Language and region
                </TabsTrigger>
                <TabsTrigger value="currency" className="bg-transparent data-[state=active]:shadow-none w-1/2">
                  Currency
                </TabsTrigger>
              </TabsList>

              <TabsContent value="language" className="mt-4">
                {renderTabContent("Choose a language and region", () => renderLanguageGrid(languages, selectedLanguage, setSelectedLanguage))}
              </TabsContent>

              <TabsContent value="currency" className="mt-4">
                {renderTabContent("Choose a currency", () => renderCurrencyGrid(currencies, selectedCurrency, setSelectedCurrency))}
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex gap-4">
              <button className="bg-transparent w-1/2">Language and region</button>
              <button className="bg-transparent w-1/2">Currency</button>
            </div>
          )}
        </div>
      </div>
    );
  }