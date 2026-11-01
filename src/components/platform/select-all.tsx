"use client";
import { useEffect, useRef, useState } from "react";

/** Header checkbox that ticks every row checkbox named `name` on the page and shows how many are ticked. */
export function SelectAll({ name = "ids", label = "Select all rows" }: { name?: string; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [count, setCount] = useState(0);
  const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`));
  const sync = () => {
    const all = boxes();
    const n = all.filter((b) => b.checked).length;
    setCount(n);
    if (ref.current) { ref.current.checked = all.length > 0 && n === all.length; ref.current.indeterminate = n > 0 && n < all.length; }
  };
  useEffect(() => {
    document.addEventListener("change", sync);
    return () => document.removeEventListener("change", sync);
  });
  return (
    <>
      <input ref={ref} type="checkbox" aria-label={label} onChange={(e) => { boxes().forEach((b) => { b.checked = e.target.checked; }); sync(); }} />
      <span className="sr-only" aria-live="polite">{count} selected</span>
    </>
  );
}
