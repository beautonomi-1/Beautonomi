// components/AccessibilityFeatures.js
import { Checkbox } from "@/components/ui/checkbox";

export default function AccessibilityFeatures() {
  const guestEntranceFeatures = [
    "Step-free Clients entrance",
    "Guest entrance wider than 32 inches",
    "Accessible parking spot",
    "Step-free path to the Clients entrance",
  ];

  const bedroomFeatures = [
    "Step-free bedroom access",
    "Bedroom entrance wider than 32 inches",
  ];

  const bathroomFeatures = [
    "Step-free bathroom access",
    "Bathroom entrance wider than 32 inches",
    "Toilet grab bar",
    "Shower grab bar",
    "Step-free shower",
    "Shower or bath chair",
  ];

  const adaptiveEquipment = ["Ceiling or mobile hoist"];

  return (
    <div className="">
      <h2 className="text-xl font-semibold mb-4">Accessibility features</h2>
      <div>
        <h3 className="text-lg font-normal">Guest entrance and parking</h3>
        {guestEntranceFeatures.map((feature, index) => (
          <div key={index} className="flex items-center space-x-2 mt-2">
            <Checkbox id={`guest-${index}`} />
            <label htmlFor={`guest-${index}`} className="text-secondary font-light text-sm">
              {feature}
            </label>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <h3 className="text-lg font-normal">Bedroom</h3>
        {bedroomFeatures.map((feature, index) => (
          <div key={index} className="flex items-center space-x-2 mt-2">
            <Checkbox id={`bedroom-${index}`} />
            <label htmlFor={`bedroom-${index}`} className="text-secondary font-light text-sm">
              {feature}
            </label>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <h3 className="text-lg font-normal">Bathroom</h3>
        {bathroomFeatures.map((feature, index) => (
          <div key={index} className="flex items-center space-x-2 mt-2">
            <Checkbox id={`bathroom-${index}`} />
            <label htmlFor={`bathroom-${index}`} className="text-secondary font-light text-sm">
              {feature}
            </label>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <h3 className="text-lg font-normal">Adaptive equipment</h3>
        {adaptiveEquipment.map((feature, index) => (
          <div key={index} className="flex items-center space-x-2 mt-2">
            <Checkbox id={`adaptive-${index}`} />
            <label htmlFor={`adaptive-${index}`} className="text-secondary font-light text-sm">
              {feature}
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
