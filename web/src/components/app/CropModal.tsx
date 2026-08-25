"use client";

import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import { getCroppedBlob, type Area } from "@/lib/cropImage";

export function CropModal({
  src,
  onCancel,
  onDone,
}: {
  src: string;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixels, setPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onComplete = useCallback((_: Area, areaPixels: Area) => {
    setPixels(areaPixels);
  }, []);

  async function confirm() {
    if (!pixels) return;
    setBusy(true);
    try {
      const blob = await getCroppedBlob(src, pixels);
      onDone(blob);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/80">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <button onClick={onCancel} className="text-sm">
          Cancel
        </button>
        <span className="text-sm font-semibold">Crop photo</span>
        <button
          onClick={confirm}
          disabled={busy || !pixels}
          className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "…" : "Save"}
        </button>
      </div>

      <div className="relative flex-1">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onComplete}
        />
      </div>

      <div className="flex items-center gap-3 px-6 py-5">
        <span className="text-white">➖</span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="flex-1 accent-brand"
        />
        <span className="text-white">➕</span>
      </div>
    </div>
  );
}
