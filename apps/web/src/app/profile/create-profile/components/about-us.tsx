"use client";
import IntroModal from "@/components/global/intro-modal";
import { CardHeader, CardTitle } from "@/components/ui/card";
import React, { useState } from "react";

interface AboutUsProps {
  about: string | null;
  setAbout: (value: string | null) => void;
}

const AboutUs = ({ about, setAbout }: AboutUsProps) => {
  const [showModal, setShowModal] = useState(false);

  const openModal = () => setShowModal(true);
  const closeModal = () => setShowModal(false);

  return (
    <div className="w-full max-w-5xl mx-auto border-b mb-8 pb-5">
      <CardHeader>
        <CardTitle className="text-[32px] font-bold text-secondary mb-5">
          About Us
        </CardTitle>
        <div className="px-5 py-7 border-dashed border-destructive border rounded-xl">
          {about ? (
            <>
              <p className="text-base font-normal text-destructive mb-2">
                Write something fun and punchy.
              </p>
              <p className="text-sm text-gray-400 mb-2 whitespace-pre-wrap">{about}</p>
              <button
                className="text-base font-medium underline"
                onClick={openModal}
              >
                Edit intro
              </button>
            </>
          ) : (
            <>
              <p className="text-base font-normal text-destructive mb-2">
                Write something fun and punchy.
              </p>
              <button
                className="text-base font-medium underline"
                onClick={openModal}
              >
                Add intro
              </button>
            </>
          )}
        </div>
      </CardHeader>

      <IntroModal
        showModal={showModal}
        closeModal={closeModal}
        title="About you"
        description="Tell us a little bit about yourself, so your future providers or clients can get to know you."
        inputType="textarea"
        inputPlaceholder=""
        maxChars={450}
        defaultValue={about || ""}
        onSave={(value) => setAbout(value || null)}
      />
    </div>
  );
};

export default AboutUs;
