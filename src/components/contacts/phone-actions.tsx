import { Phone } from "lucide-react";
import { cn } from "@/lib/utils";

/** WhatsApp glyph (lucide has no brand icons). */
function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91A9.84 9.84 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.21 8.21 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.23-.16-.48-.29Z" />
    </svg>
  );
}

const btn = "inline-flex shrink-0 items-center justify-center rounded-full transition duration-150 hover:-translate-y-px hover:shadow-md active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2";

/**
 * A phone number with two one-click icons: WhatsApp (opens the chat with that number in WhatsApp) and Call (the device's dialler).
 * `digits` is the number in international form without "+" (e.g. 923001234567), which is what wa.me expects.
 */
export function PhoneWithActions({ phone, digits, name, size = "md", className }: { phone: string | null | undefined; digits?: string | null; name?: string; size?: "sm" | "md"; className?: string }) {
  if (!phone) return <span className={className}>—</span>;
  const dim = size === "sm" ? "h-6 w-6" : "h-7 w-7";
  const ico = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const who = name ? ` ${name}` : "";
  const tel = phone.replace(/[^\d+]/g, "");
  return (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap", className)}>
      <span className="tabular-nums">{phone}</span>
      {digits && (
        <a
          href={`https://wa.me/${digits}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Open WhatsApp chat"
          aria-label={`Open WhatsApp chat with${who || " this number"} (opens in a new tab)`}
          className={cn(btn, dim, "bg-[#25D366] text-white hover:bg-[#1fb857] focus-visible:outline-[#25D366]")}
        >
          <WhatsAppGlyph className={ico} />
        </a>
      )}
      <a href={`tel:${tel}`} title="Call" aria-label={`Call${who || " this number"}`} className={cn(btn, dim, "bg-brand-50 text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100 focus-visible:outline-brand-600")}>
        <Phone className={ico} aria-hidden />
      </a>
    </span>
  );
}
