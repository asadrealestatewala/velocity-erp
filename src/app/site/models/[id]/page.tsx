import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { fmtMoney, humanize } from "@/lib/utils";
import { publishedWebsite, siteBase } from "@/server/website";
import { Gallery } from "./gallery";

type Props = { params: Promise<{ id: string }> };

const find = (id: string) => db.bikeModel.findFirst({ where: { id, isActive: true, availability: { not: "DISCONTINUED" } } });
const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]+/g, "_");

/** Table rows, in order. Each takes the first matching spec key; a row with no value is not shown. */
const ROWS: [string, string[]][] = [
  ["Motor", ["motor", "rated_motor_power", "motor_power"]],
  ["Peak Power", ["peak_power", "peak_motor_power"]],
  ["Top Speed", ["max_speed", "top_speed"]],
  ["Range", ["range"]],
  ["Battery", ["battery", "battery_type"]],
  ["Capacity", ["battery_capacity"]],
  ["Max Torque", ["max_torque", "torque"]],
  ["Warranty", ["warranty", "battery_warranty"]],
];
const TILES = ["Motor", "Peak Power", "Top Speed", "Range"];
const STOCK: Record<string, [string, string, string]> = {
  AVAILABLE: ["In stock", "#15803d", "#ecfdf3"],
  COMING_SOON: ["Coming soon", "#b45309", "#fffbeb"],
  OUT_OF_STOCK: ["Out of stock", "#b91c1c", "#fef2f2"],
};

/** Break a pasted run-on description into short paragraphs and bullet lists. */
function overview(text: string | null): { p?: string; li?: string[] }[] {
  if (!text) return [];
  const out: { p?: string; li?: string[] }[] = [];
  for (const block of text.replace(/\r/g, "").split(/\n{1,}/).map((b) => b.trim()).filter(Boolean)) {
    const last = out[out.length - 1];
    if (/^([-•*·]|\d+[.)])\s+/.test(block)) {
      const item = block.replace(/^([-•*·]|\d+[.)])\s+/, "");
      if (last?.li) last.li.push(item); else out.push({ li: [item] });
      continue;
    }
    const sentences = block.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [block];
    for (let i = 0; i < sentences.length; i += 2) out.push({ p: sentences.slice(i, i + 2).join(" ") });
  }
  return out;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ id }, s] = await Promise.all([params, publishedWebsite()]);
  const m = s ? await find(id) : null;
  return m ? { title: `${m.name} · ${s!.siteName}`, description: m.description?.slice(0, 160) ?? undefined } : { title: "Model", robots: { index: false } };
}

export default async function SiteModelPage({ params }: Props) {
  const { id } = await params;
  const s = (await publishedWebsite())!;
  const m = s.showModels ? await find(id) : null;
  if (!m) notFound();
  const base = await siteBase();
  const c = s.primaryColor;
  const raw = Object.entries((m.specifications ?? {}) as Record<string, unknown>).filter(([, v]) => (typeof v === "string" || typeof v === "number") && String(v).trim() !== "");
  const map = new Map(raw.map(([k, v]) => [norm(k), String(v)]));
  const used = new Set<string>();
  const rows: [string, string][] = ROWS.flatMap(([label, keys]) => {
    const k = keys.find((x) => map.has(x));
    if (!k) return [];
    used.add(k);
    return [[label, map.get(k)!] as [string, string]];
  });
  // any other real spec the model carries is listed after the standard rows
  for (const [k, v] of raw) if (!used.has(norm(k))) rows.push([humanize(k.replace(/_/g, " ")), String(v)]);
  const tiles = TILES.flatMap((t) => { const r = rows.find(([l]) => l === t); return r ? [r] : []; });
  const images = [
    ...(m.imageFileId ? [`/api/files/${m.imageFileId}`] : []),
    ...(/gt\s*-?70/i.test(m.name) ? ["/brand/gt70-trunk.webp"] : []),
  ];
  const stock = STOCK[m.availability];
  const testDrive = s.testDriveFormSlug ? `/forms/${s.testDriveFormSlug}?model=${m.id}` : null;
  const enquire = s.contactFormSlug ? `/forms/${s.contactFormSlug}?model=${m.id}` : `${base}/#contact`;
  const text = overview(m.description);
  const btn = "inline-flex min-w-[10rem] flex-1 items-center justify-center whitespace-nowrap rounded-xl px-6 py-3.5 text-sm font-bold uppercase tracking-wide sm:flex-none";

  return (
    <div className="bg-white">
      <section className="mx-auto max-w-6xl px-5 pb-10 pt-6 sm:pt-8">
        <nav aria-label="Breadcrumb" className="text-sm text-neutral-500">
          <a href={base || "/"} className="hover:underline">Home</a><span className="mx-2">›</span>
          <a href={`${base}/#models`} className="hover:underline">Models</a><span className="mx-2">›</span>
          <span className="font-semibold text-neutral-800">{m.name}</span>
        </nav>
        <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
          {images.length > 0 ? <Gallery images={images} name={m.name} color={c} /> : <div className="hidden lg:block" />}
          <div>
            {m.category && <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: c }}>{m.category}</p>}
            <h1 className="mt-2 text-3xl font-extrabold leading-tight text-neutral-900 sm:text-5xl">{m.name}</h1>
            {m.price != null && (
              <>
                <p className="mt-5 text-3xl font-extrabold sm:text-4xl" style={{ color: c }}>{fmtMoney(m.price.toString(), m.currency)}</p>
                <p className="mt-2 text-xs text-neutral-500 sm:text-sm">Price in Pakistan. Shipping &amp; registration extra. Prices may vary by city.</p>
              </>
            )}
            {stock && <span className="mt-4 inline-block rounded-full border px-3 py-1 text-xs font-semibold" style={{ color: stock[1], backgroundColor: stock[2], borderColor: stock[1] + "33" }}>{stock[0]}</span>}
            <div className="mt-6 flex flex-wrap gap-3">
              {testDrive && <a href={testDrive} className={`${btn} text-white`} style={{ backgroundColor: c }}>Book a test ride</a>}
              <a href={enquire} className={`${btn} border border-neutral-300 text-neutral-900`}>Enquire</a>
            </div>
            {tiles.length > 0 && (
              <dl className="mt-6 grid grid-cols-2 gap-3">
                {tiles.map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm shadow-sm"><dt className="text-xs text-neutral-500">{k}</dt><dd className="mt-0.5 font-semibold text-neutral-900">{v}</dd></div>
                ))}
              </dl>
            )}
            <div className="mt-6 rounded-2xl bg-neutral-50 p-5">
              <p className="font-bold text-neutral-900">Hassle-free ownership</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-500">Sold through authorised YADEA dealers across Pakistan, with genuine spare parts and certified technicians. <a href={s.showShowrooms ? `${base}/showrooms` : enquire} className="font-semibold underline" style={{ color: c }}>{s.showShowrooms ? "Find a dealer" : "Ask us"}</a></p>
            </div>
          </div>
        </div>
      </section>
      {(text.length > 0 || rows.length > 0) && (
        <section className="border-t border-neutral-100 bg-white px-5 py-10 sm:py-14">
          <div className="mx-auto max-w-3xl">
            {text.length > 0 && (
              <>
                <h2 className="text-2xl font-extrabold text-neutral-900 sm:text-3xl">Overview</h2>
                <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-neutral-700">
                  {text.map((b, i) => b.li
                    ? <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-[var(--site)]">{b.li.map((x) => <li key={x}>{x}</li>)}</ul>
                    : <p key={i}>{b.p}</p>)}
                </div>
              </>
            )}
            {rows.length > 0 && (
              <>
                <h2 className={`text-2xl font-extrabold text-neutral-900 sm:text-3xl ${text.length ? "mt-12" : ""}`}>Specifications</h2>
                <dl className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 text-sm shadow-sm">
                  {rows.map(([k, v], i) => (
                    <div key={k} className={`grid grid-cols-[2fr_3fr] gap-4 px-4 py-3.5 sm:px-5 ${i % 2 ? "bg-neutral-50" : "bg-white"}`}><dt className="text-neutral-500">{k}</dt><dd className="break-words font-semibold text-neutral-900">{v}</dd></div>
                  ))}
                </dl>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
