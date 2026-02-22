import { X } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface LanguageModalProps {
  showModal: boolean;
  closeModal: () => void;
  selectedLanguages: string[];
  setSelectedLanguages: React.Dispatch<React.SetStateAction<string[]>>;
}

const LanguageModal = ({
  showModal,
  closeModal,
  selectedLanguages,
  setSelectedLanguages,
}: LanguageModalProps) => {
  const [currentSelection, setCurrentSelection] =
    useState<string[]>(selectedLanguages);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const availableLanguages = [
    "English",
    "Spanish",
    "French",
    "German",
    "Chinese",
    "Arabic",
    "Armenian",
  ];

  const toggleLanguage = (language: string) => {
    setCurrentSelection((prev) =>
      prev.includes(language)
        ? prev.filter((item) => item !== language)
        : [...prev, language]
    );
  };

  const handleSave = () => {
    setSelectedLanguages(currentSelection);
    closeModal();
  };

  const filteredLanguages = availableLanguages.filter((language) =>
    language.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    showModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-white rounded-lg p-6 max-w-lg w-full h-[80vh] overflow-y-auto">
          <X className="h-5 w-5 cursor-pointer mb-7" onClick={closeModal} />
          <h2 className="text-[26px] font-medium mb-4">Languages you speak</h2>
          <div className="border rounded-full border-secondary mb-8 flex items-center">
            <Input
              type="text"
              placeholder="Search for a language"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-full flex-grow"
            />
          </div>
          <div className="flex flex-col gap-2">
            {filteredLanguages.map((language) => (
              <div
                key={language}
                className="flex items-center justify-between border-b pb-6 mb-6"
              >
                <span className="text-base font-light text-secondary">
                  {language}
                </span>
                <input
                  type="checkbox"
                  checked={currentSelection.includes(language)}
                  onChange={() => toggleLanguage(language)}
                  className="h-5 w-5"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button onClick={handleSave}>Save</Button>
          </div>
        </div>
      </div>
    )
  );
};

export default LanguageModal;
