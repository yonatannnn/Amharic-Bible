"use client";

import { useState } from "react";
import { ImageLightbox } from "./ImageLightbox";

/** An avatar that opens the full image in a lightbox when clicked (if it has one). */
export function ClickableAvatar({
  name,
  url,
  size = 44,
  className = "",
}: {
  name: string | null;
  url: string | null;
  size?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const initial = (name ?? "?").trim().charAt(0).toUpperCase();

  return (
    <>
      <button
        type="button"
        onClick={() => url && setOpen(true)}
        className={`shrink-0 overflow-hidden rounded-full ${url ? "cursor-zoom-in" : "cursor-default"} ${className}`}
        style={{ width: size, height: size }}
        aria-label={url ? "View photo" : undefined}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span
            className="grid h-full w-full place-items-center bg-gradient-to-br from-emerald-400 to-good font-bold text-white"
            style={{ fontSize: size * 0.42 }}
          >
            {initial}
          </span>
        )}
      </button>
      {open && url && <ImageLightbox src={url} onClose={() => setOpen(false)} />}
    </>
  );
}
