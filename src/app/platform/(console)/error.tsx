"use client";
import { Button } from "@/components/ui/button";

export default function ConsoleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="card mx-auto mt-10 max-w-lg p-6 text-center">
      <h1 className="text-lg font-semibold">This page could not load</h1>
      <p className="mt-2 text-sm text-[var(--pf-muted)]">Nothing was changed. Try again, and if it keeps happening share this reference with the team{error.digest ? `: ${error.digest}` : "."}</p>
      <div className="mt-4"><Button variant="secondary" onClick={reset}>Try again</Button></div>
    </div>
  );
}
