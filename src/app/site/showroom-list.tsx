"use client";
import { useMemo, useState } from "react";

export type Showroom = { id: string; name: string; city: string; address: string; phone: string; lat: number | null; lng: number | null; /** Also offers after-sales service. */ service: boolean };

const STEP = 24;

/** Straight-line distance in km (haversine). */
function km_(a: { lat: number; lng: number }, lat: number, lng: number) {
  const r = Math.PI / 180;
  const h = Math.sin(((lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(lat * r) * Math.sin(((lng - a.lng) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** Showroom cards with a city filter and search; long lists load in steps. */
export function ShowroomList({ items, color }: { items: Showroom[]; color: string }) {
  const [city, setCity] = useState("");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(STEP);
  const [type, setType] = useState<"" | "showroom" | "service">("");
  const [km, setKm] = useState(0);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [geo, setGeo] = useState<"" | "asking" | "denied">("");
  const locate = () => {
    if (!navigator.geolocation) { setGeo("denied"); return; }
    setGeo("asking");
    navigator.geolocation.getCurrentPosition(
      (p) => { setMe({ lat: p.coords.latitude, lng: p.coords.longitude }); setGeo(""); },
      () => { setGeo("denied"); setKm(0); },
      { timeout: 10000 },
    );
  };
  const cities = useMemo(() => [...new Set(items.map((x) => x.city).filter(Boolean))].sort(), [items]);
  const withDist = useMemo(() => items.map((x) => ({ ...x, dist: me && x.lat != null && x.lng != null ? km_(me, x.lat, x.lng) : null })), [items, me]);
  const unplaced = items.filter((x) => x.lat == null || x.lng == null).length;
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const r = withDist.filter((x) =>
      (!city || x.city === city) &&
      (!t || `${x.name} ${x.city} ${x.address}`.toLowerCase().includes(t)) &&
      (!type || (type === "service") === x.service) &&
      (!km || (x.dist != null && x.dist <= km)));
    return me ? r.sort((a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9)) : r;
  }, [withDist, city, q, type, km, me]);
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
      <div className="mt-3 grid gap-3 sm:grid-cols-[16rem_1fr]">
        <select aria-label="Filter by type" value={type} onChange={(e) => { setType(e.target.value as typeof type); setShown(STEP); }} className={field}>
          <option value="">All types</option>
          <option value="showroom">Showroom only</option>
          <option value="service">Showroom + After-service</option>
        </select>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Distance from me" value={km} disabled={!me} onChange={(e) => { setKm(Number(e.target.value)); setShown(STEP); }} className={`${field} sm:max-w-[14rem]`}>
            <option value={0}>Any distance</option>
            {[5, 10, 20, 50, 100, 200].map((n) => <option key={n} value={n}>Within {n} km</option>)}
          </select>
          {!me && <button type="button" onClick={locate} disabled={geo === "asking"} className="rounded-full border px-4 py-2.5 text-sm font-semibold" style={{ borderColor: color, color }}>{geo === "asking" ? "Finding you…" : "Use my location"}</button>}
          {me && <button type="button" onClick={() => { setMe(null); setKm(0); }} className="text-sm font-semibold underline">Clear location</button>}
        </div>
      </div>
      {geo === "denied" && <p className="mt-2 text-sm text-neutral-600">We couldn’t get your location. Allow location access in your browser to filter by distance, or pick a city.</p>}
      {km > 0 && unplaced > 0 && <p className="mt-2 text-xs text-neutral-500">{unplaced} stores have no map location yet and are hidden from distance results.</p>}
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
                {d.dist != null && <p className="mt-1 text-xs font-semibold text-neutral-500">{d.dist < 10 ? d.dist.toFixed(1) : Math.round(d.dist)} km away (straight line)</p>}
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
