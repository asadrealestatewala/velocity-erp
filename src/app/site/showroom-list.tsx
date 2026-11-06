"use client";
import { useMemo, useState } from "react";

export type Showroom = { id: string; name: string; city: string; address: string; phone: string; lat: number | null; lng: number | null; /** Also offers after-sales service. */ service: boolean };

const STEP = 24;

/** Showroom cards with a city filter and search; long lists load in steps. */
export function ShowroomList({ items, color }: { items: Showroom[]; color: string }) {
  const [city, setCity] = useState("");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(STEP);
  const cities = useMemo(() => [...new Set(items.map((x) => x.city).filter(Boolean))].sort(), [items]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter((x) => (!city || x.city === city) && (!t || `${x.name} ${x.city} ${x.address}`.toLowerCase().includes(t)));
  }, [items, city, q]);
  const field = "w-full rounded-full border border-neutral-300 bg-white px-4 py-2.5 text-sm";
  return (
    <>
      <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_16rem]">
        <input aria-label="Search showrooms" type="search" placeholder="Search by name or area" value={q} onChange={(e) => { setQ(e.target.value); setShown(STEP); }} className={field} />
        <select aria-label="Filter by city" value={city} onChange={(e) => { setCity(e.target.value); setShown(STEP); }} className={field}>
          <option value="">All cities ({items.length})</option>
          {cities.map((x) => <option key={x} value={x}>{x} ({items.filter((i) => i.city === x).length})</option>)}
        </select>
      </div>
      {list.length === 0 ? <p className="mt-6 text-neutral-600">No showrooms match. Try another city or search.</p> : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.slice(0, shown).map((d) => {
            const dir = d.lat != null && d.lng != null ? `${d.lat},${d.lng}` : [d.name, d.address, d.city].filter(Boolean).join(", ");
            return (
              <li key={d.id} className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {d.city && <p className="text-xs font-semibold uppercase tracking-wide" style={{ color }}>{d.city}</p>}
                  <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-700">{d.service ? "Showroom + After-service" : "Showroom"}</span>
                </div>
                <h3 className="mt-1 font-semibold">{d.name}</h3>
                {d.address && <p className="mt-2 text-sm text-neutral-600">{d.address}</p>}
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  {d.phone && <a href={`tel:${d.phone}`} className="rounded-full px-4 py-2 text-xs font-semibold text-white" style={{ backgroundColor: color }}>Call {d.phone}</a>}
                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dir)}`} target="_blank" rel="noreferrer" className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold">Directions</a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {list.length > shown && (
        <div className="mt-6 text-center">
          <button type="button" onClick={() => setShown((n) => n + STEP)} className="rounded-full border px-6 py-2.5 text-sm font-semibold" style={{ borderColor: color, color }}>Show more ({list.length - shown} left)</button>
        </div>
      )}
    </>
  );
}
