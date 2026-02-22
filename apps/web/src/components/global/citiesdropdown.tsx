import React from "react";

interface CitiesDropDownProps {
  onCitySelect: (city: string) => void;
}

const cities = [
  "New York",
  "Los Angeles",
  "Chicago",
  // Add more cities as needed
];

const CitiesDropDown: React.FC<CitiesDropDownProps> = ({
  onCitySelect,
}) => {
  return (
    <div className="absolute z-10 top-20 w-72 bg-white border border-gray-300 rounded-lg shadow-lg">
      <ul className="py-2 overflow-y-scroll h-72">
        {cities.map((city) => (
          <li
            key={city}
            className="px-4 py-2 cursor-pointer hover:bg-gray-100"
            onClick={() => onCitySelect(city)}
          >
            {city}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CitiesDropDown;
