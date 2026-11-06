import type { ReactNode } from "react";
import { FaqList } from "./faq-list";

/**
 * Renders a page or post body written as plain text: "## " / "### " headings, "- " list items,
 * "> " quotes, "![alt](url)" images, blank lines between paragraphs. Never injects HTML.
 * Imported pages often carry stat counters as separate one-line blocks (label, number, optional "+");
 * runs of those are detected and shown as a stat-card grid. Colors come from the workspace's --site var.
 */
type Stat = { label: string; value: string; suffix: string };
type Node =
  | { t: "stats"; items: Stat[] }
  | { t: "cta"; title: string; text: string; label: string; href: string }
  | { t: "block"; text: string };

const BUTTON = /^\[button: ?([^\]]+)\]\((https:\/\/[^)\s]+|\/[^)\s]*)\)$/;

const NUM = /^\d[\d,.]*$/;
const SUFFIX = /^(\+|%|k|m|K|M)$/;
const isLabel = (s: string) => s.length > 1 && s.length <= 60 && !/^(#{2,3} |- |> |!\[)/.test(s) && !NUM.test(s) && !SUFFIX.test(s) && !/[.!?]$/.test(s);

/** Reads one stat starting at blocks[j]: "label, number[, +]" or "number[, +], label". Returns the stat and how many blocks it used. */
function readStat(blocks: string[], j: number): { stat: Stat; used: number } | null {
  const a = blocks[j], b = blocks[j + 1], c = blocks[j + 2];
  if (a === undefined || b === undefined) return null;
  if (NUM.test(a)) {
    // number first: "36", "+", "Distributors"
    if (SUFFIX.test(b) && c !== undefined && isLabel(c)) return { stat: { label: c, value: a, suffix: b }, used: 3 };
    if (isLabel(b)) return { stat: { label: b, value: a, suffix: "" }, used: 2 };
    return null;
  }
  if (isLabel(a) && NUM.test(b)) {
    const hasSuffix = c !== undefined && SUFFIX.test(c);
    return { stat: { label: a, value: b, suffix: hasSuffix ? c : "" }, used: hasSuffix ? 3 : 2 };
  }
  return null;
}
const isZero = (v: string) => Number(v.replace(/,/g, "")) === 0;

function group(blocks: string[]): Node[] {
  const out: Node[] = [];
  let i = 0;
  while (i < blocks.length) {
    const items: Stat[] = [];
    let j = i;
    for (let r = readStat(blocks, j); r; r = readStat(blocks, j)) { items.push(r.stat); j += r.used; }
    // "## Heading", optional text, then a [button: Label](url) block => centered call-to-action card
    const h = /^## (.+)$/.exec(blocks[i]);
    if (h) {
      const b1 = BUTTON.exec(blocks[i + 1] ?? "");
      const hasText = !b1 && !!blocks[i + 1] && !/^(#{2,3} |- |> |!\[)/.test(blocks[i + 1]);
      const btn = b1 ?? (hasText ? BUTTON.exec(blocks[i + 2] ?? "") : null);
      if (btn) { out.push({ t: "cta", title: h[1], text: hasText ? blocks[i + 1] : "", label: btn[1], href: btn[2] }); i += hasText ? 3 : 2; continue; }
    }
    // a lone label+number is far more likely to be prose than a stat; need at least two
    // Figures that are still 0 are placeholders, so they are left out rather than shown as "0".
    if (items.length >= 2) { const shown = items.filter((x) => !isZero(x.value)); if (shown.length) out.push({ t: "stats", items: shown }); i = j; } else { out.push({ t: "block", text: blocks[i] }); i++; }
  }
  return out;
}

const fmt = (v: string) => (/^\d{4,}$/.test(v) ? Number(v).toLocaleString("en-US") : v);
const safeUrl = (u: string) => (/^(https:\/\/|\/)/.test(u) ? u : null);

function inline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") && p.length > 4 ? <strong key={i}>{p.slice(2, -2)}</strong> : p));
}

type Chunk = { faq: false; blocks: string[] } | { faq: true; items: { q: string; a: string[] }[] };
const isHeading = (b: string) => /^#{2,3} /.test(b);
const isQuestion = (b: string) => isHeading(b) && /\?$/.test(b.trim());

/** Headings that end in "?" followed by their answer paragraphs are collected into an interactive FAQ list. */
function chunk(blocks: string[]): Chunk[] {
  const out: Chunk[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (isQuestion(b)) {
      const item = { q: b.replace(/^#{2,3} /, ""), a: [] as string[] };
      i++;
      while (i < blocks.length && !isHeading(blocks[i])) item.a.push(blocks[i++]);
      const last = out[out.length - 1];
      if (last?.faq) last.items.push(item); else out.push({ faq: true, items: [item] });
    } else {
      const last = out[out.length - 1];
      if (last && !last.faq) last.blocks.push(b); else out.push({ faq: false, blocks: [b] });
      i++;
    }
  }
  return out;
}

/** A block of short single lines that includes a number ("36 / + / Distributors") is really separate stat blocks. */
function splitTokens(b: string): string[] {
  const lines = b.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2 || !lines.some((l) => NUM.test(l)) || !lines.every((l) => l.length <= 60 && !/^(#{2,3} |- |> |!\[|\[button)/.test(l))) return [b];
  return lines;
}

export function EntryBody({ body }: { body: string }) {
  const blocks = body.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).flatMap(splitTokens);
  return (
    <div className="space-y-5 text-[17px] leading-8 text-neutral-700">
      {chunk(blocks).map((c, ci) => c.faq ? <FaqList key={`f${ci}`} items={c.items.map((x) => ({ q: x.q, a: x.a.join("\n\n") }))} /> : <Plain key={`p${ci}`} blocks={c.blocks} />)}
    </div>
  );
}

function Plain({ blocks }: { blocks: string[] }) {
  return (
    <>
      {group(blocks).map((n, i) => {
        if (n.t === "stats") {
          return (
            <div key={i} className="my-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
              {n.items.map((s, k) => (
                <div key={k} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-5 text-center shadow-sm" style={{ borderTop: "4px solid var(--site)" }}>
                  <p className="whitespace-nowrap text-3xl font-extrabold leading-none tabular-nums sm:text-4xl" data-sm-count style={{ color: "var(--site)" }}>{fmt(s.value)}{s.suffix}</p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-neutral-600 sm:text-sm">{s.label}</p>
                </div>
              ))}
            </div>
          );
        }
        if (n.t === "cta") {
          return (
            <div key={i} className="my-10 rounded-3xl bg-neutral-50 px-6 py-10 text-center">
              <h2 className="text-2xl font-bold text-neutral-900">{n.title}</h2>
              {n.text && <p className="mx-auto mt-2 max-w-xl text-neutral-600">{inline(n.text)}</p>}
              <a href={n.href} className="mt-6 inline-block rounded-full px-7 py-3 text-sm font-semibold text-white shadow-sm" style={{ backgroundColor: "var(--site)" }}>{n.label}</a>
            </div>
          );
        }
        const b = n.text;
        const btn = BUTTON.exec(b);
        if (btn) return <p key={i} className="text-center"><a href={btn[2]} className="inline-block rounded-full px-7 py-3 text-sm font-semibold text-white shadow-sm" style={{ backgroundColor: "var(--site)" }}>{btn[1]}</a></p>;
        if (b.startsWith("## ")) return <h2 key={i} className="mt-10 border-l-4 pl-3 text-2xl font-bold leading-snug text-neutral-900" style={{ borderColor: "var(--site)" }}>{b.slice(3)}</h2>;
        if (b.startsWith("### ")) return <h3 key={i} className="mt-6 text-xl font-semibold text-neutral-900">{b.slice(4)}</h3>;
        const img = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(b);
        if (img && safeUrl(img[2])) {
          return (
            <figure key={i} className="my-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={safeUrl(img[2])!} alt={img[1]} loading="lazy" className="w-full rounded-2xl object-cover shadow-sm" />
              {img[1] && <figcaption className="mt-2 text-center text-sm text-neutral-500">{img[1]}</figcaption>}
            </figure>
          );
        }
        const lines = b.split("\n");
        if (lines.every((l) => l.startsWith("> "))) {
          return <blockquote key={i} className="my-6 rounded-r-2xl border-l-4 bg-neutral-50 px-5 py-4 text-lg italic text-neutral-800" style={{ borderColor: "var(--site)" }}>{inline(lines.map((l) => l.slice(2)).join(" "))}</blockquote>;
        }
        if (lines.every((l) => l.startsWith("- "))) {
          return (
            <ul key={i} className="space-y-2.5">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-3">
                  <span className="mt-3 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: "var(--site)" }} aria-hidden />
                  <span>{inline(l.slice(2))}</span>
                </li>
              ))}
            </ul>
          );
        }
        return <p key={i} className="whitespace-pre-line">{inline(b)}</p>;
      })}
    </>
  );
}
