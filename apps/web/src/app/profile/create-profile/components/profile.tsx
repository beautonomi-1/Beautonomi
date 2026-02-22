"use client";
import BornModal from "@/components/global/born-modal";
import IntroModal from "@/components/global/intro-modal";
import LanguageModal from "@/components/global/language-modal";
import LocationModal from "@/components/global/location-modal";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  GraduationCap,
  Briefcase,
  MapPin,
  Calendar,
  Heart,
  Wand2,
  Clock,
  PawPrint,
  Languages,
  Music,
  Lightbulb,
  BookOpen,
} from "lucide-react";
import { useState } from "react";

interface ProfileProps {
  school: string | null;
  setSchool: (value: string | null) => void;
  work: string | null;
  setWork: (value: string | null) => void;
  location: string | null;
  setLocation: (value: string | null) => void;
  languages: string[] | null;
  setLanguages: (value: string[] | null) => void;
  decadeBorn: string | null;
  setDecadeBorn: (value: string | null) => void;
  showDecadeBorn: boolean;
  setShowDecadeBorn: (value: boolean) => void;
  favoriteSong: string | null;
  setFavoriteSong: (value: string | null) => void;
  obsessedWith: string | null;
  setObsessedWith: (value: string | null) => void;
  funFact: string | null;
  setFunFact: (value: string | null) => void;
  uselessSkill: string | null;
  setUselessSkill: (value: string | null) => void;
  biographyTitle: string | null;
  setBiographyTitle: (value: string | null) => void;
  spendTime: string | null;
  setSpendTime: (value: string | null) => void;
  pets: string | null;
  setPets: (value: string | null) => void;
}

export default function Profile({
  school, setSchool,
  work, setWork,
  location, setLocation,
  languages, setLanguages,
  decadeBorn, setDecadeBorn,
  showDecadeBorn, setShowDecadeBorn,
  favoriteSong, setFavoriteSong,
  obsessedWith, setObsessedWith,
  funFact, setFunFact,
  uselessSkill, setUselessSkill,
  biographyTitle, setBiographyTitle,
  spendTime, setSpendTime,
  pets, setPets,
}: ProfileProps) {
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const _availableLanguages = [
    "English",
    "Spanish",
    "French",
    "German",
    "Chinese",
  ]; // Example languages

  const openModal = (modalType: string) => setActiveModal(modalType);
  const closeModal = () => setActiveModal(null);
  const openLocationModal = () => setShowLocationModal(true);
  const closeLocationModal = () => setShowLocationModal(false);
  const openLanguageModal = () => setShowLanguageModal(true);
  const closeLanguageModal = () => setShowLanguageModal(false);
  const openBornModal = () => setIsModalOpen(true);
  const closeBornModal = () => setIsModalOpen(false);

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="max-w-3xl">
        <CardHeader className="">
          <CardTitle className="text-[32px] font-bold text-secondary mb-5">
            Your profile
          </CardTitle>
          <CardDescription className="text-base font-light text-destructive mt-2">
            The information you share will be used across Beautonomi to help other
            clients and Providers get to know you.{" "}
            <a href="#" className="font-medium underline">
              Learn more
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-14 gap-y-6">
            <ProfileField
              icon={GraduationCap}
              label="Where I went to school"
              value={school}
              onClick={() => openModal("school")}
            />
            <ProfileField
              icon={Briefcase}
              label="My work"
              value={work}
              onClick={() => openModal("work")}
            />
            <ProfileField
              icon={MapPin}
              label="Where I live"
              value={location}
              onClick={openLocationModal}
            />
            <ProfileField
              icon={Languages}
              label="Languages I speak: Add languages"
              value={languages && languages.length > 0 ? languages.join(", ") : undefined}
              onClick={openLanguageModal}
            />
            <ProfileField 
              icon={Calendar} 
              label="Decade I was born"
              value={decadeBorn}
              onClick={openBornModal}
            />
            <ProfileField
              icon={Music}
              label="My favorite song in high school"
              value={favoriteSong}
              onClick={() => openModal("music")}
            />
            <ProfileField
              icon={Heart}
              label="I'm obsessed with"
              value={obsessedWith}
              onClick={() => openModal("obsessed")}
            />
            <ProfileField
              icon={Lightbulb}
              label="My fun fact"
              value={funFact}
              onClick={() => openModal("fun fact")}
            />
            <ProfileField
              icon={Wand2}
              label="My most useless skill"
              value={uselessSkill}
              onClick={() => openModal("useless skill")}
            />
            <ProfileField
              icon={BookOpen}
              label="My biography title would be"
              value={biographyTitle}
              onClick={() => openModal("biography")}
            />
            <ProfileField
              icon={Clock}
              label="I spend too much time"
              value={spendTime}
              onClick={() => openModal("spend time")}
            />
            <ProfileField
              icon={PawPrint}
              label="Pets"
              value={pets}
              onClick={() => openModal("pets")}
            />
          </div>
        </CardContent>
      </div>

      {/* Render the IntroModal conditionally based on activeModal state */}
      {activeModal === "school" && (
        <IntroModal
          showModal={true}
          closeModal={closeModal}
          title="Where did you go to school?"
          description="Whether it's home school, high school, or trade school, name the school that made you who you are."
          inputType="input"
          inputPlaceholder="Where I went to school"
          maxChars={100}
          defaultValue={school || ""}
          onSave={(value) => setSchool(value || null)}
        />
      )}
      {activeModal === "work" && (
        <IntroModal
          showModal={true}
          closeModal={closeModal}
          title="What do you do for work?"
          description="Tell us what your profession is. If you don't have a traditional job, tell us your life's calling. Example: Nurse, parent to four kids, or retired surfer. Where is this shown?"
          inputType="input"
          inputPlaceholder="My work:"
          maxChars={100}
          defaultValue={work || ""}
          onSave={(value) => setWork(value || null)}
        />
      )}
      {activeModal === "music" && (
        <IntroModal
          showModal={true}
          closeModal={closeModal}
          title="What was your favorite song in high school?"
          description="However embarrassing, share the tune you listened to on repeat as a teenager."
          inputType="input"
          inputPlaceholder="My favorite song in high school:"
          maxChars={100}
          defaultValue={favoriteSong || ""}
          onSave={(value) => setFavoriteSong(value || null)}
        />
      )}
      {activeModal === "obsessed" && (
        <IntroModal
          showModal={true}
          closeModal={closeModal}
          title="What are you obsessed with?"
          description="Share whatever you can't get enough of—in a good way. Example: Baking rosemary focaccia."
          inputType="input"
          inputPlaceholder="I am obsessed with:"
          maxChars={100}
          defaultValue={obsessedWith || ""}
          onSave={(value) => setObsessedWith(value || null)}
        />
      )}
      {activeModal === "fun fact" && (
        <IntroModal
          showModal={true}
          closeModal={closeModal}
          title="What's a fun fact about you?"
          description="Share something unique or unexpected about you. Example: I was in a music video or I'm a juggler."
          inputType="input"
          inputPlaceholder="My fun fact:"
          maxChars={100}
          defaultValue={funFact || ""}
          onSave={(value) => setFunFact(value || null)}
        />
      )}
      {activeModal === "useless skill" && (
        <IntroModal
          showModal={true}
          closeModal={closeModal}
          title="What's your most useless skill?"
          description="Share a surprising but pointless talent you have. Example: Shuffling cards with one hand."
          inputType="input"
          inputPlaceholder="My most useless skill:"
          maxChars={100}
          defaultValue={uselessSkill || ""}
          onSave={(value) => setUselessSkill(value || null)}
        />
      )}
      {activeModal === "biography" && (
        <IntroModal
          showModal={true}
          closeModal={closeModal}
          title="What would your biography title be?"
          description="If someone wrote a book about your life, what would they call it? Example: Born to Roam or Chronicles of a Dog Mom."
          inputType="input"
          inputPlaceholder="My biography title would be:"
          maxChars={100}
          defaultValue={biographyTitle || ""}
          onSave={(value) => setBiographyTitle(value || null)}
        />
      )}
      {activeModal === "spend time" && (
        <IntroModal
          showModal={true}
          closeModal={closeModal}
          title="What do you spend too much time doing?"
          description="Share an activity or hobby you spend lots of free time on. Example: Watching cat videos or playing chess."
          inputType="input"
          inputPlaceholder="I spend my too much time:"
          maxChars={100}
          defaultValue={spendTime || ""}
          onSave={(value) => setSpendTime(value || null)}
        />
      )}
      {activeModal === "pets" && (
        <IntroModal
          showModal={true}
          closeModal={closeModal}
          title="Do you have any pets in your life?"
          description="Share any pets you have and their names. Example: My calico cat Whiskers, or Leonardo my speedy turtle."
          inputType="input"
          inputPlaceholder="Pets:"
          maxChars={100}
          defaultValue={pets || ""}
          onSave={(value) => setPets(value || null)}
        />
      )}
      <LocationModal
        showModal={showLocationModal}
        closeModal={closeLocationModal}
        defaultValue={location || ""}
        onSave={(value) => setLocation(value || null)}
      />
      <LanguageModal
        showModal={showLanguageModal}
        closeModal={closeLanguageModal}
        selectedLanguages={languages || []}
        setSelectedLanguages={(langsOrUpdater) => {
          const langs = typeof langsOrUpdater === "function" ? langsOrUpdater(languages || []) : langsOrUpdater;
          setLanguages(langs.length > 0 ? langs : null);
        }}
      />
      <BornModal 
        isOpen={isModalOpen} 
        onClose={closeBornModal}
        defaultValue={decadeBorn || ""}
        defaultShowDecade={showDecadeBorn}
        onSave={(decade, show) => {
          setDecadeBorn(decade || null);
          setShowDecadeBorn(show);
        }}
      />
    </div>
  );
}

interface ProfileFieldProps {
  icon: React.ElementType;
  label: string;
  value?: string | null;
  onClick?: () => void; // Optional onClick handler
}

function ProfileField({ icon: Icon, label, value, onClick }: ProfileFieldProps) {
  const hasValue = value && value.trim().length > 0;
  
  return (
    <div
      className="flex items-center gap-2 px-2 pb-6 border-b cursor-pointer"
      onClick={onClick}
    >
      <Icon className="w-7 h-7 text-secondary" />
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-base text-light text-destructive">{label}</span>
        {hasValue && (
          <span className="text-sm text-gray-400 mt-0.5 truncate">{value}</span>
        )}
      </div>
    </div>
  );
}
