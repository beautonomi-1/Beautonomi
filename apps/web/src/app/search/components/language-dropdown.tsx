"use client"
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox"; 
import { ChevronDown, ChevronUp } from "lucide-react";

const languages = [
  "Chinese", "English", "French", "German", "Italian", "Japanese", 
  "Korean", "Portuguese", "Russian", "Spanish", "Arabic", "Czech"
];

const LanguageDropdown = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);

  const toggleDropdown = () => {
    setIsOpen((prev) => !prev);
  };

  const handleLanguageSelect = (language: string) => {
    setSelectedLanguages((prev) =>
      prev.includes(language)
        ? prev.filter((l) => l !== language) 
        : [...prev, language] 
    );
  };

  return (
    <div className="">
      <div className="flex justify-between items-center py-2 cursor-pointer" onClick={toggleDropdown}>
        <h2 className="text-lg font-medium">Partner language</h2>
        <span>
          {isOpen ? <ChevronDown /> : <ChevronUp />}
        </span>
      </div>

      {isOpen && (
        <div className="mt-2 grid grid-cols-2 gap-y-0 gap-4">
          {languages.map((language) => (
            <label
              key={language}
              className="flex items-center mb-5 cursor-pointer"
              onClick={() => handleLanguageSelect(language)}
            >
              <Checkbox
                checked={selectedLanguages.includes(language)}
                onCheckedChange={() => handleLanguageSelect(language)}
                className="h-6 w-6"
              />
              <span className="ml-2 tex-base font-light text-secondary">{language}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageDropdown;