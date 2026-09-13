import React, { useState } from "react";
import { ChevronDown, ChevronUp, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@beautonomi/i18n";

export default function FilterInterface() {
  const { t } = useTranslation();
  const [sortBy, setSortBy] = useState("recommended");
  const [_price, setPrice] = useState(35953);
  const [isExpanded, setIsExpanded] = useState(false);

  const _handlePriceChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setPrice(Number(event.target.value));
  };

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const [venueType, setVenueType] = useState<string | null>(null);

  const venueOptions = [
    { id: "everyone", label: t("web.home.venueEveryone"), icon: <Users /> },
    { id: "female-only", label: t("web.home.venueFemaleOnly"), icon: <User /> },
    { id: "male-only", label: t("web.home.venueMaleOnly"), icon: <User /> },
  ];
  return (
    <div className="">
      <div
        className="flex justify-between items-center mb-3 cursor-pointer"
        onClick={toggleExpand}
      >
        <h2 className="text-lg font-medium text-secondary">{t("web.home.sortBy")}</h2>
        <span>{isExpanded ? <ChevronDown /> :  <ChevronUp />}</span>
      </div>

      {isExpanded && (
        <>
          <div className="mb-6">
            {([
              { id: "recommended", label: t("web.home.sortRecommended") },
              { id: "nearest", label: t("web.home.sortNearest") },
              { id: "top-rated", label: t("web.home.sortTopRated") },
            ] as const).map((option) => (
              <label key={option.id} className="flex items-center mb-2">
                <input
                  type="radio"
                  name="sortBy"
                  value={option.id}
                  checked={sortBy === option.id}
                  onChange={() => setSortBy(option.id)}
                  className={`radio-input appearance-none w-4 h-4 rounded-full  ${
                    sortBy === option.id
                      ? "border-muted bg-white border-4"
                      : "border-gray-400 border"
                  } checked:bg-white`}
                />
                <span className="ms-2 font-light text-sm">{option.label}</span>
              </label>
            ))}
          </div>

          <div className="mb-6">
            <h3 className="font-semibold mb-2">{t("web.home.venueType")}</h3>
            <div className="flex flex-wrap gap-2 mb-6">
              {venueOptions.map((option) => (
                <Button
                  key={option.id}
                  variant="outline"
                  onClick={() => setVenueType(option.id)}
                  className={`flex items-center space-x-2 rounded-full max-h-[42px] px-3.5 hover:bg-transparent ${
                    venueType === option.id
                     ? "bg-[#f7f7f7] text-secondary border-secondary"
                              : "bg-white text-black border-gray-300"
                  }`}
                >
                  {option.icon}
                  <span className="text-xs font-light">{option.label}</span>
                </Button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
