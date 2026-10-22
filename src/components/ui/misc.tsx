import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { CountUp, GrowBar } from "./motion";

export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("card", className)} {...p}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-3.5", className)}>
      <div className="min-w-0">
        <h3 className="eyebrow flex items-center gap-2 !text-ink-700"><span aria-hidden className="h-3.5 w-[3px] rounded-full bg-brand-500" />{title}</h3>
        {description && <p className="mt-1 text-[13px] text-ink-500">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

const tones = {
  gray: "bg-ink-100 text-ink-700 ring-ink-200",
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  dark: "bg-ink-900 text-white ring-ink-900",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "gray", className, children, dot }: { tone?: Tone; className?: string; children: React.ReactNode; dot?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset", tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  );
}

/** Badge coloured by an arbitrary hex (pipeline stage colours are admin-configured). */
export function StageBadge({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ background: `${color}18`, color, boxShadow: `inset 0 0 0 1px ${color}40` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {name}
    </span>
  );
}

export function Avatar({ name, src, size = 36, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const palette = ["#f07400", "#0ea5e9", "#8b5cf6", "#10b981", "#ef4444", "#f59e0b", "#14b8a6", "#6366f1"];
  const color = palette[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length];
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className={cn("shrink-0 rounded-full object-cover ring-2 ring-white", className)} style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white", className)}
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
    >
      {initials(name) || "?"}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}) {
  return (
    <div className={title || actions ? "mb-6" : "mb-3"}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-[13px] text-ink-500">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-ink-300" />}
              {b.href ? (
                <Link href={b.href} className="hover:text-ink-900">
                  {b.label}
                </Link>
              ) : (
                <span className="text-ink-700">{b.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      {(title || actions) && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            {title && <h1 className="text-[26px] leading-tight font-bold tracking-tight text-ink-900">{title}</h1>}
            {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600 ring-1 ring-brand-200/70">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-[15px] font-semibold text-ink-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const STAT_TONES = {
  brand: { chip: "bg-brand-50 text-brand-600", ring: "group-hover:ring-brand-200" },
  blue: { chip: "bg-blue-50 text-blue-600", ring: "group-hover:ring-blue-200" },
  green: { chip: "bg-emerald-50 text-emerald-600", ring: "group-hover:ring-emerald-200" },
  red: { chip: "bg-red-50 text-red-600", ring: "group-hover:ring-red-200" },
  violet: { chip: "bg-xp-50 text-xp-600", ring: "group-hover:ring-xp-100" },
  amber: { chip: "bg-amber-50 text-amber-600", ring: "group-hover:ring-amber-200" },
  gray: { chip: "bg-ink-100 text-ink-500", ring: "group-hover:ring-ink-200" },
} as const;

/** Compact KPI tile: icon chip, label, animated figure, a trend only when a previous period exists, and a hint. */
export function StatCard({
  label,
  value,
  icon: Icon,
  delta,
  hint,
  tone = "brand",
  href,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  delta?: { value: number; goodWhenUp?: boolean } | null;
  hint?: string;
  tone?: keyof typeof STAT_TONES;
  href?: string;
}) {
  const t = STAT_TONES[tone];
  const good = delta ? (delta.goodWhenUp ?? true) === delta.value >= 0 : true;
  const body = (
    <div className={cn("card group h-full p-4 ring-1 ring-transparent", href && "card-hover", href && t.ring)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] leading-snug font-medium text-ink-500">{label}</p>
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", t.chip)}>
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
      </div>
      <p className="mt-1 text-[30px] leading-none font-bold tracking-tight text-ink-900 tabular-nums">{typeof value === "string" || typeof value === "number" ? <CountUp value={String(value)} /> : value}</p>
      <div className="mt-2 flex min-h-5 flex-wrap items-center gap-x-2 text-[12.5px]">
        {delta && delta.value !== 0 ? (
          <span className={cn("inline-flex items-center gap-0.5 font-semibold", good ? "text-emerald-600" : "text-red-600")}>
            {delta.value > 0 ? "▲" : "▼"} {Math.abs(delta.value)}%
            <span className="font-normal text-ink-400"> vs last period</span>
          </span>
        ) : delta ? (
          <span className="font-medium text-ink-400">— no change</span>
        ) : null}
        {hint && <span className="text-ink-500">{hint}</span>}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-2xl">
      {body}
    </Link>
  ) : (
    body
  );
}

export function ProgressBar({ value, max = 100, className, color }: { value: number; max?: number; className?: string; color?: string }) {
  const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-ink-100", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <GrowBar pct={pct} color={color} className="h-full rounded-full" />
    </div>
  );
}

/** Placeholder block shown while a page streams in. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}

export function DescriptionList({ items, cols = 2 }: { items: { label: string; value: React.ReactNode }[]; cols?: 1 | 2 | 3 }) {
  // Columns follow the width of the card (container query), not the window — the contact page puts a records dock beside it.
  return (
    <div className="@container">
      <dl className={cn("grid gap-x-6 gap-y-4", cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-1 @sm:grid-cols-2" : "grid-cols-1 @sm:grid-cols-2 @3xl:grid-cols-3")}>
        {items.map((it) => (
          <div key={it.label} className="min-w-0">
            <dt className="text-[13px] font-medium text-ink-500">{it.label}</dt>
            <dd className="mt-0.5 text-[14.5px] break-words text-ink-900">{it.value ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
