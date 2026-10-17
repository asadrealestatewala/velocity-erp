/** Shown instantly while a page's data loads (and prefetched with navigation links). */
export function PageSkeleton() {
  const bar = "animate-pulse rounded-lg bg-ink-200/70";
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-6">
      <div className="space-y-2">
        <div className={`${bar} h-3 w-32`} />
        <div className={`${bar} h-7 w-64`} />
        <div className={`${bar} h-3 w-96 max-w-full`} />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }, (_, i) => <div key={i} className={`${bar} h-9 w-36`} />)}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="card h-24 animate-pulse bg-white" />)}
      </div>
      <div className="card overflow-hidden">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-ink-100 px-4 py-3.5 last:border-0">
            <div className={`${bar} h-8 w-8 rounded-full`} />
            <div className={`${bar} h-3 w-40`} />
            <div className={`${bar} ml-auto h-3 w-24`} />
            <div className={`${bar} h-3 w-16`} />
          </div>
        ))}
      </div>
    </div>
  );
}
