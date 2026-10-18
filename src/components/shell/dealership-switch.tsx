"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Store } from "lucide-react";

/** Only rendered for users who belong to more than one dealership: scopes the page to the chosen one via ?dealership=. */
export function DealershipSwitch({ options, value }: { options: { id: string; name: string }[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  if (options.length < 2) return null;
  return (
    <label className="inline-flex items-center gap-2 text-sm text-ink-600">
      <Store className="h-4 w-4 text-ink-400" aria-hidden />
      <span className="sr-only">Dealership</span>
      <select
        value={value}
        onChange={(e) => {
          const p = new URLSearchParams(params.toString());
          p.set("dealership", e.target.value);
          p.delete("page");
          router.push(`${pathname}?${p.toString()}`);
        }}
        className="input h-9 py-1.5 pr-8"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
    </label>
  );
}
