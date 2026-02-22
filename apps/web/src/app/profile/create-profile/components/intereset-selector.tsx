'use client'

import { useState } from 'react'
import { PlusIcon } from 'lucide-react'
import InterestModal from '@/components/global/add-interest-modal'

interface InterestSelectorProps {
  interests: string[] | null;
  setInterests: (value: string[] | null) => void;
}

export default function InterestSelector({ interests, setInterests }: InterestSelectorProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  const openModal = () => setIsModalOpen(true)
  const closeModal = () => setIsModalOpen(false)

  const handleSaveInterests = (newInterests: string[]) => {
    setInterests(newInterests.length > 0 ? newInterests : null)
  }

  return (
    <div className="max-w-5xl mx-auto px-6 bg-white">
      <h2 className="text-[22px] font-medium text-secondary mb-2">What {"you're"} into</h2>
      <p className="text-base font-light text-destructive mb-4">
        Find common ground with other clients and Providers by adding interests to your profile.
      </p>
      <div className="flex flex-wrap gap-4 mb-4">
        {(interests || []).map((interest) => (
          <div
            key={interest}
            className="w-28 h-10 border border-gray-300 rounded-full flex items-center justify-center px-3"
          >
            <span className="text-sm text-gray-400 truncate">{interest}</span>
          </div>
        ))}
        {(interests?.length || 0) < 3 && (
          Array.from({ length: 3 - (interests?.length || 0) }).map((_, index) => (
            <div
              key={`empty-${index}`}
              className="w-28 h-10 border-2 border-dashed border-gray-300 rounded-full flex items-center justify-center"
            >
              <PlusIcon
                className="text-gray-400 cursor-pointer"
                onClick={openModal}
              />
            </div>
          ))
        )}
      </div>
      <button
        className="text-black underline"
        onClick={openModal}
      >
        {(interests?.length || 0) > 0 ? 'Edit interests' : 'Add interests'}
      </button>
      <InterestModal 
        isOpen={isModalOpen} 
        onClose={closeModal} 
        onSave={handleSaveInterests}
        defaultSelectedInterests={interests || []}
      />
    </div>
  )
}