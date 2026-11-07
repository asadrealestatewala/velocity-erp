"use client";
import { useState } from "react";

/** Large image card with a thumbnail row (the row only shows when the model has more than one real photo). */
export function Gallery({ images, name, color }: { images: string[]; name: string; color: string }) {
  const [i, setI] = useState(0);
  return (
    <div>
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-3xl border border-neutral-200 bg-neutral-50 p-4 sm:p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[i]} alt={name} className="max-h-full max-w-full object-contain" />
      </div>
      {images.length > 1 && (
        <div className="mt-3 flex gap-3">
          {images.map((src, k) => (
            <button key={src} type="button" onClick={() => setI(k)} aria-label={`Photo ${k + 1}`} aria-current={k === i} className="h-16 w-20 overflow-hidden rounded-2xl border-2 bg-neutral-50 p-1.5 sm:h-20 sm:w-24" style={{ borderColor: k === i ? color : "#e5e5e5" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-contain" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
