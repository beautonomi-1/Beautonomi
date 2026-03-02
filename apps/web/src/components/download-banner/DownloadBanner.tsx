"use client";

interface DownloadBannerProps {
  linkUrl: string;
  ctaLabel: string;
  onDismiss: () => void;
  onTrackClick: () => void;
}

export default function DownloadBanner({ linkUrl, ctaLabel, onDismiss, onTrackClick }: DownloadBannerProps) {
  const handleClick = () => {
    onTrackClick();
    window.open(linkUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-3 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      role="banner"
    >
      <a
        href={linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          e.preventDefault();
          handleClick();
        }}
        className="min-w-0 flex-1 rounded-lg bg-black px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-600 focus:ring-offset-2"
      >
        {ctaLabel}
      </a>
      <button
        type="button"
        onClick={onDismiss}
        className="flex-shrink-0 rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
        aria-label="Dismiss banner"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
