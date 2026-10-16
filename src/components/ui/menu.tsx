"use client";
import * as M from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Menu({ trigger, children, align = "end" }: { trigger: React.ReactNode; children: React.ReactNode; align?: "start" | "end" }) {
  return (
    <M.Root modal={false}>
      <M.Trigger asChild>{trigger}</M.Trigger>
      <M.Portal>
        <M.Content
          align={align}
          sideOffset={6}
          className="z-50 min-w-[180px] animate-pop-in rounded-xl border border-ink-200 bg-white p-1 shadow-[var(--shadow-pop)]"
        >
          {children}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

const itemCls =
  "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink-700 outline-none data-[highlighted]:bg-ink-100 data-[highlighted]:text-ink-900";

export function MenuItem({ onSelect, children, danger }: { onSelect?: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <M.Item onSelect={onSelect} className={cn(itemCls, danger && "text-red-600 data-[highlighted]:bg-red-50 data-[highlighted]:text-red-700")}>
      {children}
    </M.Item>
  );
}

export function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <M.Item asChild className={itemCls}>
      <Link href={href}>{children}</Link>
    </M.Item>
  );
}

export const MenuSeparator = () => <M.Separator className="my-1 h-px bg-ink-100" />;
export const MenuLabel = ({ children }: { children: React.ReactNode }) => (
  <M.Label className="px-2.5 py-1.5 text-xs font-semibold text-ink-400 uppercase">{children}</M.Label>
);
