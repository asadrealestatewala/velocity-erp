import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

const STACK = "max-sm:[&_thead]:sr-only max-sm:[&_tbody>tr]:block max-sm:[&_tbody>tr]:px-4 max-sm:[&_tbody>tr]:py-3 max-sm:[&_tbody>tr>td]:flex max-sm:[&_tbody>tr>td]:justify-between max-sm:[&_tbody>tr>td]:gap-3 max-sm:[&_tbody>tr>td]:px-0 max-sm:[&_tbody>tr>td]:py-1 max-sm:[&_tbody>tr>td[data-label]]:before:content-[attr(data-label)] max-sm:[&_tbody>tr>td[data-label]]:before:text-xs max-sm:[&_tbody>tr>td[data-label]]:before:text-ink-500 max-sm:[&_tbody>tr>td[data-label]]:before:shrink-0 max-sm:[&_tbody>tr>td[data-label]]:text-right";

/** `stack` turns each row into a labelled card below 640px (cells need a data-label), so nothing scrolls sideways on a phone. */
export function TableWrap({ children, className, footer, stack }: { children: React.ReactNode; className?: string; footer?: React.ReactNode; stack?: boolean }) {
  return (
    <div className={cn("card overflow-hidden", className)}>
      <div className="scrollbar-thin relative overflow-x-auto">
        <table className={cn("w-full divide-y divide-ink-100 [&_thead]:bg-ink-50/70 [&_tbody>tr]:transition-colors [&_tbody>tr:hover]:bg-brand-50/40", stack ? `${STACK} sm:min-w-[720px]` : "min-w-[720px]")}>{children}</table>
      </div>
      {footer}
    </div>
  );
}

/** Build a URL keeping current search params but overriding some. */
export function withParams(base: string, params: Record<string, string | undefined>, override: Record<string, string | number | undefined | null>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...override })) {
    if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  }
  const q = u.toString();
  return q ? `${base}?${q}` : base;
}

export function SortHeader({
  label,
  field,
  base,
  params,
  className,
}: {
  label: string;
  field: string;
  base: string;
  params: Record<string, string | undefined>;
  className?: string;
}) {
  const active = params.sort === field;
  const dir = active && params.dir === "asc" ? "desc" : "asc";
  const Icon = !active ? ChevronsUpDown : params.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={cn("th", className)} aria-sort={active ? (params.dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link href={withParams(base, params, { sort: field, dir, page: 1 })} className="inline-flex items-center gap-1 hover:text-ink-900">
        {label}
        <Icon className={cn("h-3.5 w-3.5", active ? "text-brand-600" : "text-ink-300")} />
      </Link>
    </th>
  );
}

export function Pagination({
  base,
  params,
  page,
  pageSize,
  total,
  sizes = [10, 25, 50, 100],
}: {
  base: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
  sizes?: number[];
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 bg-white px-4 py-3 text-sm text-ink-500">
      <div className="flex items-center gap-3">
        <span>
          {from}–{to} of <b className="text-ink-800">{total}</b>
        </span>
        <span className="hidden items-center gap-1 sm:flex">
          Rows:
          {sizes.map((s) => (
            <Link
              key={s}
              href={withParams(base, params, { pageSize: s, page: 1 })}
              className={cn("rounded px-1.5 py-0.5", s === pageSize ? "bg-ink-900 text-white" : "hover:bg-ink-100")}
            >
              {s}
            </Link>
          ))}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <PageLink disabled={page <= 1} href={withParams(base, params, { page: page - 1 })} label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </PageLink>
        <span className="px-2 text-ink-700">
          Page {page} / {pages}
        </span>
        <PageLink disabled={page >= pages} href={withParams(base, params, { page: page + 1 })} label="Next page">
          <ChevronRight className="h-4 w-4" />
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({ disabled, href, children, label }: { disabled: boolean; href: string; children: React.ReactNode; label: string }) {
  if (disabled)
    return (
      <span aria-disabled className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink-100 text-ink-300">
        {children}
      </span>
    );
  return (
    <Link href={href} aria-label={label} className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink-200 text-ink-600 hover:bg-ink-50">
      {children}
    </Link>
  );
}

export function parseListParams(sp: Record<string, string | string[] | undefined>, defaults: { pageSize?: number; sort?: string; dir?: "asc" | "desc" } = {}) {
  const flat: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) flat[k] = Array.isArray(v) ? v[0] : v || undefined;
  const page = Math.max(1, Number(flat.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(flat.pageSize) || defaults.pageSize || 25));
  const sort = flat.sort ?? defaults.sort;
  const dir: "asc" | "desc" = flat.dir === "asc" ? "asc" : flat.dir === "desc" ? "desc" : (defaults.dir ?? "desc");
  return { flat, page, pageSize, sort, dir, skip: (page - 1) * pageSize };
}
