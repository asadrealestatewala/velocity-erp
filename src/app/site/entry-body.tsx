import type { ReactNode } from "react";

/**
 * Renders a page or post body written as plain text: "## " / "### " headings, "- " list items,
 * "> " quotes, "![alt](url)" images, blank lines between paragraphs. Never injects HTML.
 * Imported pages often carry stat counters as separate one-line blocks (label, number, optional "+");
 * runs of those are detected and shown as a stat-card grid. Colors come from the workspace's --site var.
 */
type Stat = { label: string; value: string; suffix: string };
type Node =
  | { t: "stats"; items: Stat[] }
  | { t: "faq"; items: { q: string; a: string[] }[] }
  | { t: "cta"; title: string; text: string; label: string; href: string }
  | { t: "block"; text: string };

const BUTTON = /^\[button: ?([^\]]+)\]\((https:\/\/[^)\s]+|\/[^)\s]*)\)$/;
const isQuestion = (s: string) => s.length > 8 && s.length <= 220 && s.endsWith("?") && !s.includes("\n") && !/^(#{2,3} |- |> |!\[)/.test(s);

const NUM = /^\d[\d,.]*$/;
const SUFFIX = /^(\+|%|k|m|K|M)$/;
const isLabel = (s: string) => s.length > 1 && s.length <= 60 && !/^(#{2,3} |- |> |!\[)/.test(s) && !NUM.test(s) && !SUFFIX.test(s) && !/[.!?]$/.test(s);

function group(blocks: string[]): Node[] {
  const out: Node[] = [];
  let i = 0;
  while (i < blocks.length) {
    const items: Stat[] = [];
    let j = i;
    while (j + 1 < blocks.length && isLabel(blocks[j]) && NUM.test(blocks[j + 1])) {
      const hasSuffix = j + 2 < blocks.length && SUFFIX.test(blocks[j + 2]);
      items.push({ label: blocks[j], value: blocks[j + 1], suffix: hasSuffix ? blocks[j + 2] : "" });
      j += hasSuffix ? 3 : 2;
    }
    // consecutive question blocks followed by answer blocks become an accordion (two or more questions)
    const faq: { q: string; a: string[] }[] = [];
    let k = i;
    while (k < blocks.length && isQuestion(blocks[k])) {
      const a: string[] = [];
      let m = k + 1;
      while (m < blocks.length && !isQuestion(blocks[m]) && !/^#{2,3} /.test(blocks[m]) && !BUTTON.test(blocks[m])) a.push(blocks[m++]);
      if (a.length === 0) break;
      faq.push({ q: blocks[k], a });
      k = m;
    }
    if (faq.length >= 2) { out.push({ t: "faq", items: faq }); i = k; continue; }
    // heading + optional text + button => centered call-to-action card
    const h = /^## (.+)$/.exec(blocks[i]);
    if (h) {
      const b1 = BUTTON.exec(blocks[i + 1] ?? "");
      const b2 = BUTTON.exec(blocks[i + 2] ?? "");
      const hasText = !b1 && b2 && !/^(#{2,3} |- |> |!\[)/.test(blocks[i + 1]);
      const btn = b1 ?? (hasText ? b2 : null);
      if (btn) { out.push({ t: "cta", title: h[1], text: hasText ? blocks[i + 1] : "", label: btn[1], href: btn[2] }); i += hasText ? 3 : 2; continue; }
    }
    // a lone label+number is far more likely to be prose than a stat; need at least two
    if (items.length >= 2) { out.push({ t: "stats", items }); i = j; } else { out.push({ t: "block", text: blocks[i] }); i++; }
  }
  return out;
}

const fmt = (v: string) => (/^\d{4,}$/.test(v) ? Number(v).toLocaleString("en-US") : v);
const safeUrl = (u: string) => (/^(https:\/\/|\/)/.test(u) ? u : null);

function inline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") && p.length > 4 ? <strong key={i}>{p.slice(2, -2)}</strong> : p));
}

export function EntryBody({ body }: { body: string }) {
  const blocks = body.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-5 text-[17px] leading-8 text-neutral-700">
      {group(blocks).map((n, i) => {
        if (n.t === "stats") {
          return (
            <div key={i} className="my-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
              {n.items.map((s, k) => (
                <div key={k} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-5 text-center shadow-sm" style={{ borderTop: "4px solid var(--site)" }}>
                  <p className="text-3xl font-extrabold leading-none sm:text-4xl" style={{ color: "var(--site)" }}>{fmt(s.value)}{s.suffix}</p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-neutral-600 sm:text-sm">{s.label}</p>
                </div>
              ))}
            </div>
          );
        }
        if (n.t === "faq") {
          return (
            <div key={i} className="my-6 space-y-3">
              {n.items.map((f, k) => (
                <details key={k} className="group rounded-2xl border border-neutral-200 bg-white shadow-sm open:border-[color:var(--site)] open:shadow-md">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-base font-semibold text-neutral-900 [&::-webkit-details-marker]:hidden">
                    <span>{f.q}</span>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white transition-transform group-open:rotate-45" style={{ backgroundColor: "var(--site)" }} aria-hidden>+</span>
                  </summary>
                  <div className="space-y-3 border-t border-neutral-100 px-5 py-4 text-base leading-7 text-neutral-700">
                    {f.a.map((t, j) => <p key={j} className="whitespace-pre-line">{inline(t)}</p>)}
                  </div>
                </details>
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
    </div>
  );
}
