// components/global/LocationModal.tsx

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input"; // Assuming you have an Input component
import { Button } from "@/components/ui/button"; // Assuming you have a Button component
import { X } from "lucide-react";

interface LocationModalProps {
  showModal: boolean;
  closeModal: () => void;
  defaultValue?: string;
  onSave?: (value: string) => void;
}

export default function LocationModal({ showModal, closeModal, defaultValue = "", onSave }: LocationModalProps) {
  const [location, setLocation] = useState(defaultValue);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>(defaultValue);

  useEffect(() => {
    queueMicrotask(() => {
      setLocation(defaultValue);
      setSelectedLocation(defaultValue);
    });
  }, [defaultValue, showModal]);

  // Perform the search when location changes using Mapbox
  useEffect(() => {
    if (location.trim().length < 3) {
      queueMicrotask(() => setSearchResults([]));
      return;
    }

    const fetchResults = async () => {
      try {
        const response = await fetch("/api/mapbox/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: location,
            limit: 5,
          }),
        });
        const data = await response.json();
        if (data.data) {
          setSearchResults(data.data.map((result: any) => result.place_name));
        } else {
          setSearchResults([]);
        }
      } catch (error) {
        console.error("Error fetching search results:", error);
        setSearchResults([]);
      }
    };

    const debounceTimer = setTimeout(fetchResults, 300);
    return () => clearTimeout(debounceTimer);
  }, [location]);

  return (
    showModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-white rounded-lg p-6 max-w-lg w-full relative">
          <X className="h-5 w-5  cursor-pointer mb-7" onClick={closeModal} />
          <h2 className="text-[26px] font-medium text-secondary mb-8">Where you live?</h2>
          <div className="border rounded-full border-secondary mb-20 flex items-center">
            <Input
              type="text"
              placeholder="Search for your city"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="rounded-full flex-grow"
            />
          </div>
          {searchResults.length > 0 && (
            <ul className="mt-4 border-t pt-2">
              {searchResults.map((result, index) => (
                <li 
                  key={index} 
                  className="py-1 px-2 hover:bg-gray-200 rounded cursor-pointer"
                  onClick={() => {
                    setSelectedLocation(result);
                    setLocation(result);
                    setSearchResults([]);
                  }}
                >
                  {result}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 justify-end flex">
          <Button onClick={() => {
            if (onSave) {
              onSave(selectedLocation || location);
            }
            closeModal();
          }}>Save</Button>
        </div>
        </div>
      </div>
    )
  );
}
