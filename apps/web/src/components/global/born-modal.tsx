import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface BornModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultValue?: string;
  defaultShowDecade?: boolean;
  onSave?: (decade: string, showDecade: boolean) => void;
}

export default function BornModal({ isOpen, onClose, defaultValue = "", defaultShowDecade = true, onSave }: BornModalProps) {
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
            Decade you were born
          </h2>
        </div>
        <p className="text-base text-destructive font-light mb-7">
          {"Don't"} worry, other people {"won't"} be able to see your exact birthday.
        </p>
        <div className="mb-6">
          <label className="text-base font-medium text-secondary mb-2 block">
            Select decade:
          </label>
          <select
            value={selectedDecade}
            onChange={(e) => setSelectedDecade(e.target.value)}
            className="w-full border rounded-md p-2 mb-4"
          >
            <option value="">Select a decade</option>
            <option value="1940s">1940s</option>
            <option value="1950s">1950s</option>
            <option value="1960s">1960s</option>
            <option value="1970s">1970s</option>
            <option value="1980s">1980s</option>
            <option value="1990s">1990s</option>
            <option value="2000s">2000s</option>
            <option value="2010s">2010s</option>
            <option value="2020s">2020s</option>
          </select>
        </div>
        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="font-light text-base text-secondary">
              Show the decade I was born
            </p>
            {selectedDecade && (
              <p className="text-sm font-light text-destructive">
                Born in the {selectedDecade}
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
          }}>Save</Button>
        </div>
      </div>
    </div>
  );
}
