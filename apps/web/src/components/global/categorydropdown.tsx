import React from "react";
import Image from "next/image";
import Threading from "./../../../public/images/hair-removal.png";
import MassageImage from "./../../../public/images/message-icon.svg"; 
import HairStylingImage from "./../../../public/images/curling-hair.png";
import NailsImage from "./../../../public/images/nail-art.png";
import Facial from "./../../../public/images/facial.png";
import Hairdye from "./../../../public/images/hair-dye (1).png";
import Pedicure from "./../../../public/images/pedicure.png";

interface CategoryDropdownProps {
  onCategorySelect: (category: string) => void;
}

const categories = [
  { name: "Hair & styling", image: HairStylingImage },
  { name: "Nails", image: NailsImage },
  { name: "Facials & skincares", image: Facial },
  { name: "Massage", image: MassageImage },
  { name: "Threading", image: Threading },
  { name: "Hair dye", image: Hairdye },
  { name: "Pedicure", image: Pedicure },
];

const CategoryDropdown: React.FC<CategoryDropdownProps> = ({
  onCategorySelect,
}) => {
  return (
    <div className="absolute z-10 top-20 w-72 bg-white border border-gray-300 rounded-lg shadow-lg">
      <ul className="py-2 overflow-y-scroll h-72">
        {categories.map(({ name, image }) => (
          <li
            key={name}
            className="flex items-center px-4 py-2 cursor-pointer hover:bg-gray-100"
            onClick={() => onCategorySelect(name)}
          >
            <div className="border p-2 rounded-md mr-5">
            <Image
              src={image}
              alt={name}
              width={32}
              height={32}
              className=" "
            />
            </div>
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CategoryDropdown;
