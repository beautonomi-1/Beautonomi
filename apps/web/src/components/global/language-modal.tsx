"use client";

import { useTranslation } from "@beautonomi/i18n";

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
  const { t } = useTranslation();
  const [currentSelection, setCurrentSelection] =
    useState<string[]>(selectedLanguages);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const languageOptions = [
    { id: "English", key: "english" },
    { id: "Spanish", key: "spanish" },
    { id: "French", key: "french" },
    { id: "German", key: "german" },
    { id: "Chinese", key: "chinese" },
    { id: "Arabic", key: "arabic" },
    { id: "Armenian", key: "armenian" },
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

  const filteredLanguages = languageOptions.filter((language) =>
    language.id.toLowerCase().includes(searchQuery.toLowerCase()) || t(`web.layout.languageModal.${language.key}`).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    showModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-white rounded-lg p-6 max-w-lg w-full h-[80vh] overflow-y-auto">
          <X className="h-5 w-5 cursor-pointer mb-7" onClick={closeModal} />
          <h2 className="text-[26px] font-medium mb-4">{t("web.layout.languageModal.title")}</h2>
          <div className="border rounded-full border-secondary mb-8 flex items-center">
            <Input
              type="text"
              placeholder={t("web.layout.languageModal.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-full flex-grow"
            />
          </div>
          <div className="flex flex-col gap-2">
            {filteredLanguages.map((language) => (
              <div
                key={language.id}
                className="flex items-center justify-between border-b pb-6 mb-6"
              >
                <span className="text-base font-light text-secondary">
                  {t(`web.layout.languageModal.${language.key}`)}
                </span>
                <input
                  type="checkbox"
                  checked={currentSelection.includes(language.id)}
                  onChange={() => toggleLanguage(language.id)}
                  className="h-5 w-5"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button onClick={handleSave}>{t("common.save")}</Button>
          </div>
        </div>
      </div>
    )
  );
};

export default LanguageModal;
