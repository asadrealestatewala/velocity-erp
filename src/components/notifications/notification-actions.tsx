"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/ui/use-action";
import { markNotificationsReadAction } from "@/server/actions/notifications";

export function MarkAllRead() {
  const { run, pending } = useAction(markNotificationsReadAction, { success: "All marked as read" });
  return <Button size="sm" variant="secondary" loading={pending} onClick={() => run("all")}><CheckCheck className="h-4 w-4" /> Mark all read</Button>;
}

/** Marks a notification read when opened, then navigates to the (authorised) record. */
export function NotificationLink({ id, href, isRead, children }: { id: string; href: string | null; isRead: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const open = async () => {
    if (!isRead) await markNotificationsReadAction([id]);
    if (href) router.push(href);
    else router.refresh();
  };
  return href ? (
    <Link href={href} onClick={(e) => { e.preventDefault(); void open(); }} className="hover:underline">{children}</Link>
  ) : (
    <button onClick={() => void open()} className="text-left">{children}</button>
  );
}
