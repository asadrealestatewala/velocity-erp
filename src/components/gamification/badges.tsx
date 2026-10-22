import { Award, Bike, CalendarCheck, Repeat, Trophy, Users, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = { zap: Zap, repeat: Repeat, bike: Bike, trophy: Trophy, users: Users, "calendar-check": CalendarCheck, award: Award };

export function BadgeGrid({ all, earned }: { all: { id: string; name: string; description: string; icon: string }[]; earned: Map<string, Date> }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {all.map((a) => {
        const Icon = ICONS[a.icon] ?? Award;
        const at = earned.get(a.id);
        return (
          <li key={a.id} title={a.description} className={cn("rounded-xl border p-3 text-center transition", at ? "border-xp-200 bg-gradient-to-b from-xp-50 to-white" : "border-dashed border-ink-200 opacity-60")}>
            <span className={cn("mx-auto mb-1.5 flex h-10 w-10 items-center justify-center rounded-full", at ? "bg-xp-500 text-white shadow-md shadow-xp-500/30" : "bg-ink-100 text-ink-400")}>
              <Icon className="h-5 w-5" />
            </span>
            <p className="text-xs font-semibold text-ink-900">{a.name}</p>
            <p className="mt-0.5 text-[11px] leading-tight text-ink-500">{at ? `Earned ${at.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}` : a.description}</p>
          </li>
        );
      })}
    </ul>
  );
}
