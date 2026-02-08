"use client";

import { useEffect, useRef } from "react";

type Props = {
  src: string;
  onClose: () => void;
};

export function ImageLightbox({ src, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    // Prevent background scroll while lightbox is open
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Focus the overlay on mount for keyboard accessibility
  useEffect(() => {
    overlayRef.current?.focus();
  }, []);

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 cursor-pointer outline-none"
      onClick={onClose}
    >
      <img
        src={src}
        alt="Full size preview"
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
