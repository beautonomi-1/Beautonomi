import { useState } from 'react'
import React from 'react'
import { X } from 'lucide-react'
import { Button } from "@/components/ui/button"
import Image from 'next/image'
import Pedicure from './../../../public/images/pedicure.png'
import Manicure from './../../../public/images/manicure (1).png'
import HairDye from './../../../public/images/hair-dye (1).png'
import Facial from './../../../public/images/facial.png'

const interests = [
  { name: 'Pedicure', icon: Pedicure },
  { name: 'Manicure', icon: Manicure },
  { name: 'HairDye', icon: HairDye },
  { name: 'Facial', icon: Facial },
]

interface InterestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (interests: string[]) => void;
  defaultSelectedInterests?: string[];
}

export default function InterestModal({ isOpen, onClose, onSave, defaultSelectedInterests = [] }: InterestModalProps) {
  const [selectedInterests, setSelectedInterests] = useState<string[]>(defaultSelectedInterests)
  const [showAll, setShowAll] = useState(false)

  // Update selectedInterests when modal opens with new default values
  React.useEffect(() => {
    if (isOpen && defaultSelectedInterests) {
      setSelectedInterests(defaultSelectedInterests)
    }
  }, [isOpen, defaultSelectedInterests])

  const toggleInterest = (interest: string) => {
    setSelectedInterests(prev =>
      prev.includes(interest)
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    )
  }

  const displayedInterests = showAll ? interests : interests.slice(0, 12)

  const handleSave = () => {
    onSave(selectedInterests)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-800 bg-opacity-50">
      <div className="w-full max-w-xl mx-auto bg-white rounded-lg shadow-lg p-6 relative">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-[22px] font-medium text-secondary">What are you into?</h2>
          <X className="h-6 w-6 text-gray-500 cursor-pointer" onClick={onClose} />
        </div>
        <p className="text-base font-light text-destructive mb-4">
          Pick some interests you enjoy that you want to show on your profile.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          {displayedInterests.map((interest) => (
            <button
              key={interest.name}
              onClick={() => toggleInterest(interest.name)}
              className={`flex justify-center items-center space-x-2 p-2 rounded-full border ${
                selectedInterests.includes(interest.name)
                  ? 'bg-blue-100 border-blue-500'
                  : 'border-gray-300'
              }`}
            >
              <Image
                src={interest.icon}
                alt={interest.name}
                width={24}
                height={24}
                className="w-6 h-6"
              />
              <span>{interest.name}</span>
            </button>
          ))}
        </div>
        {!showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="text-black tex-base font-light underline mb-4"
          >
            Show all
          </button>
        )}
        <div className="flex justify-between items-center">
          <span className="text-gray-600">
            {selectedInterests.length} selected
          </span>
          <Button
            disabled={selectedInterests.length === 0}
            onClick={handleSave}
            variant="default"
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}