// import { X } from "lucide-react";
// import React from "react";
// import { Button } from "../ui/button";

// interface IntroModalProps {
//   showModal: boolean;
//   closeModal: () => void;
// }

// const IntroModal: React.FC<IntroModalProps> = ({ showModal, closeModal }) => {
//   if (!showModal) return null;

//   return (
//     <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
//       <div className="bg-white rounded-lg p-6 max-w-xl w-full">
//         <div className="items-center mb-4">
//           <X className="h-5 w-5 mb-7 cursor-pointer" onClick={closeModal} />
//           <h3 className="text-[26px] font-medium text-secondary">About you</h3>
//           <p className="text-base font-light text-destructive">
//             Tell us a little bit about yourself, so your future hosts or guests
//             can get to know you.
//           </p>
//         </div>
//         <textarea
//           rows={4}
//           cols={50}
//           placeholder=""
//           className="border rounded-md w-full p-2"
//         ></textarea>
//         <p className="text-right text-xs text-destructive font-light">
//           450 characters available
//         </p>
//         <div className="mt-8 text-right border-t pt-4">
//           <Button onClick={closeModal} variant="default" className="h-12">
//             Done
//           </Button>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default IntroModal;

import { X } from "lucide-react";
import React from "react";
import { Button } from "../ui/button";

interface IntroModalProps {
  showModal: boolean;
  closeModal: () => void;
  title: string;
  description: string;
  inputType?: "textarea" | "input"; // Optional prop to choose between textarea or input
  inputPlaceholder?: string;
  maxChars?: number; // Optional prop for max character limit
  defaultValue?: string; // Optional default value
  onSave?: (value: string) => void; // Callback when saving
}

const IntroModal: React.FC<IntroModalProps> = ({
  showModal,
  closeModal,
  title,
  description,
  inputType = "textarea", // Default to textarea
  inputPlaceholder = "",
  maxChars = 450, // Default to 450 characters
  defaultValue = "",
  onSave,
}) => {
  const [value, setValue] = React.useState(defaultValue);

  React.useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue, showModal]);

  const handleSave = () => {
    if (onSave) {
      onSave(value);
    }
    closeModal();
  };

  if (!showModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg p-6 max-w-xl w-full">
        <div className="items-center mb-4">
          <X className="h-5 w-5 mb-7 cursor-pointer" onClick={closeModal} />
          <h3 className="text-[26px] font-medium text-secondary">{title}</h3>
          <p className="text-base font-light text-destructive">{description}</p>
        </div>
        {inputType === "textarea" ? (
          <textarea
            rows={4}
            placeholder={inputPlaceholder}
            maxLength={maxChars}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="border rounded-md w-full p-2"
          ></textarea>
        ) : (
          <input
            type="text"
            placeholder={inputPlaceholder}
            maxLength={maxChars}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="border rounded-md w-full p-2"
          />
        )}
        <p className="text-right text-xs text-destructive font-light">
          {maxChars - value.length} characters available
        </p>
        <div className="mt-8 text-right border-t pt-4">
          <Button onClick={handleSave} variant="default" className="h-12">
            Done
          </Button>
        </div>
      </div>
    </div>
  );
};

export default IntroModal;
