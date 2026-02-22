"use client";
import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Language {
  name: string;
  region: string;
}

interface Currency {
  name: string;
  code: string;
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
  
  const currencies: Currency[] = [
    { name: "United States dollar", code: "USD – $" },
    { name: "Australian dollar", code: "AUD – $" },
    { name: "Brazilian real", code: "BRL – R$" },
    { name: "Bulgarian lev", code: "BGN – лв." },
    { name: "Canadian dollar", code: "CAD – $" },
    { name: "Chilean peso", code: "CLP – $" },
    { name: "Chinese yuan", code: "CNY – ¥" },
    { name: "Colombian peso", code: "COP – $" },
    { name: "Costa Rican colon", code: "CRC – ₡" },
    { name: "Croatian kuna", code: "HRK – kn" },
    { name: "Czech koruna", code: "CZK – Kč" },
    { name: "Danish krone", code: "DKK – kr" },
    { name: "Egyptian pound", code: "EGP – ج.م" },
    { name: "Emirati dirham", code: "AED – د.إ" },
    { name: "Euro", code: "EUR – €" },
    { name: "Hong Kong dollar", code: "HKD – $" },
    { name: "Hungarian forint", code: "HUF – Ft" },
    { name: "Indian rupee", code: "INR – ₹" },
    { name: "Indonesian rupiah", code: "IDR – Rp" },
    { name: "Israeli new shekel", code: "ILS – ₪" },
    { name: "Japanese yen", code: "JPY – ¥" },
    { name: "Kenyan shilling", code: "KES – KSh" },
    { name: "Malaysian ringgit", code: "MYR – RM" },
    { name: "Mexican peso", code: "MXN – $" },
    { name: "Moroccan dirham", code: "MAD" },
    { name: "New Taiwan dollar", code: "TWD – $" },
    { name: "New Zealand dollar", code: "NZD – $" },
    { name: "Norwegian krone", code: "NOK – kr" },
    { name: "Peruvian sol", code: "PEN – S/" },
    { name: "Philippine peso", code: "PHP – ₱" },
    { name: "Polish złoty", code: "PLN – zł" },
    { name: "Pound sterling", code: "GBP – £" },
    { name: "Qatari riyal", code: "QAR – ر.ق" },
    { name: "Romanian leu", code: "RON – lei" },
    { name: "Saudi Arabian riyal", code: "SAR – SR" },
    { name: "Singapore dollar", code: "SGD – $" },
    { name: "South African rand", code: "ZAR – R" },
    { name: "South Korean won", code: "KRW – ₩" },
    { name: "Swedish krona", code: "SEK – kr" },
    { name: "Swiss franc", code: "CHF" },
    { name: "Thai baht", code: "THB – ฿" },
    { name: "Turkish lira", code: "TRY – ₺" },
    { name: "Ugandan shilling", code: "UGX – USh" },
    { name: "Ukrainian hryvnia", code: "UAH – ₴" },
    { name: "Uruguayan peso", code: "UYU – $U" },
    { name: "Vietnamese dong", code:"VND – ₫"}
  ];

  interface LanguageModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }
  
  export default function LanguageModal({ open, onOpenChange }: LanguageModalProps) {
    const [translation, setTranslation] = useState(false);
    const [selectedLanguage, setSelectedLanguage] = useState<Language | null>(null);
    const [selectedCurrency, setSelectedCurrency] = useState<Currency | null>(null);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
      queueMicrotask(() => setIsMounted(true));
    }, []);
  
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
              selectedItem && selectedItem.code === item.code
                ? 'border border-secondary'
                : 'border-none'
            }`}
            onClick={() => setSelectedItem(item)}
          >
            <div className="text-left">
              <div className="font-light text-sm text-secondary">{item.name}</div>
              <div className="font-light text-sm text-destructive">{item.code}</div>
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