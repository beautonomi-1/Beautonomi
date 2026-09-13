import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useTranslation } from "@beautonomi/i18n";

interface BornModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultValue?: string;
  defaultShowDecade?: boolean;
  onSave?: (decade: string, showDecade: boolean) => void;
}

const DECADE_VALUES = ["1940s", "1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"] as const;

export default function BornModal({ isOpen, onClose, defaultValue = "", defaultShowDecade = true, onSave }: BornModalProps) {
  const { t } = useTranslation();
  const [showDecade, setShowDecade] = useState(defaultShowDecade);
  const [selectedDecade, setSelectedDecade] = useState<string>(defaultValue);

  useEffect(() => {
    queueMicrotask(() => {
      setShowDecade(defaultShowDecade);
      setSelectedDecade(defaultValue);
    });
  }, [defaultValue, defaultShowDecade, isOpen]);

  if (!isOpen) return null;

  // Handler to close the modal
  const handleOverlayClick = (e: React.MouseEvent) => {
    // Check if the click was outside the modal content
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      onClick={handleOverlayClick}
    >
      <div className="fixed inset-0 bg-black opacity-50" />
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-xl w-full mx-auto z-10">
        <X className="h-5 w-5 mb-7 cursor-pointer" onClick={onClose} />
        <div className="flex justify-between items-center">
          <h2 className="text-[26px] font-medium text-secondary">
            {t("web.global.bornModal.title")}
          </h2>
        </div>
        <p className="text-base text-destructive font-light mb-7">
          {t("web.global.bornModal.privacyHint")}
        </p>
        <div className="mb-6">
          <label className="text-base font-medium text-secondary mb-2 block">
            {t("web.global.bornModal.selectDecade")}
          </label>
          <select
            value={selectedDecade}
            onChange={(e) => setSelectedDecade(e.target.value)}
            className="w-full border rounded-md p-2 mb-4"
          >
            <option value="">{t("web.global.bornModal.selectADecade")}</option>
            {DECADE_VALUES.map((decade) => (
              <option key={decade} value={decade}>
                {t(`web.global.bornModal.decade${decade}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="font-light text-base text-secondary">
              {t("web.global.bornModal.showDecade")}
            </p>
            {selectedDecade && (
              <p className="text-sm font-light text-destructive">
                {t("web.global.bornModal.bornIn", { decade: selectedDecade })}
              </p>
            )}
          </div>
          <Switch checked={showDecade} onCheckedChange={setShowDecade} />
        </div>
        <div className="text-end border-t pt-5 mt-5">
          <Button onClick={() => {
            if (onSave) {
              onSave(selectedDecade, showDecade);
            }
            onClose();
          }}>{t("common.save")}</Button>
        </div>
      </div>
    </div>
  );
}
