"use client";
import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";

const pill = "peer h-11 w-full rounded-full bg-neutral-200/80 pr-12 pl-11 text-sm text-neutral-800 placeholder:text-neutral-500 transition focus:bg-white focus:ring-2 focus:ring-pink-500 focus:outline-none";

/** Pill-styled password field with a show/hide toggle, matching the platform sign-in card. */
export function PlatformPasswordInput({ id, name = "password", placeholder = "Password", autoComplete = "current-password", minLength }: { id: string; name?: string; placeholder?: string; autoComplete?: string; minLength?: number }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">{placeholder}</label>
      <input id={id} name={name} type={show ? "text" : "password"} required minLength={minLength} autoComplete={autoComplete} placeholder={placeholder} className={pill} />
      <Lock className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-neutral-600 peer-focus:text-pink-600" aria-hidden />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-neutral-600 transition hover:bg-neutral-300/60 hover:text-neutral-900">
        {show ? <EyeOff className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
      </button>
    </div>
  );
}
