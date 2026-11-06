/** Renders a page or post body written as plain text: "## " / "### " headings, "- " list items, blank lines between paragraphs. Never injects HTML. */
export function EntryBody({ body }: { body: string }) {
  const blocks = body.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-4 leading-relaxed text-neutral-800">
      {blocks.map((b, i) => {
        if (b.startsWith("## ")) return <h2 key={i} className="pt-4 text-xl font-bold text-neutral-900">{b.slice(3)}</h2>;
        if (b.startsWith("### ")) return <h3 key={i} className="pt-2 text-lg font-semibold text-neutral-900">{b.slice(4)}</h3>;
        const lines = b.split("\n");
        if (lines.every((l) => l.startsWith("- "))) return <ul key={i} className="list-disc space-y-1 pl-6">{lines.map((l, j) => <li key={j}>{l.slice(2)}</li>)}</ul>;
        return <p key={i} className="whitespace-pre-line">{b}</p>;
      })}
    </div>
  );
}
