"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { saveSiteEntriesAction } from "@/server/actions/website";
import type { SiteEntry } from "@/server/website";

const today = () => new Date().toISOString().slice(0, 10);
const slugOf = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

export function ContentEditor({ initial }: { initial: SiteEntry[] }) {
  const [items, setItems] = useState<SiteEntry[]>(initial);
  const { run, pending, error } = useAction(saveSiteEntriesAction);
  const upd = (i: number, patch: Partial<SiteEntry>) => setItems((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const add = (kind: SiteEntry["kind"]) => setItems((a) => [...a, { slug: "", kind, title: "", summary: "", body: "", date: today(), published: false }]);
  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); run(items.map((x) => ({ ...x, slug: x.slug || slugOf(x.title) }))); }}>
      {items.length === 0 && <p className="text-sm text-ink-600">No pages or posts yet. Pages appear in the site menu; posts appear under Blog.</p>}
      {items.map((x, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-ink-200 p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Type">{(p) => <Select {...p} value={x.kind} onChange={(e) => upd(i, { kind: e.target.value as SiteEntry["kind"] })}><option value="page">Page</option><option value="post">Blog post</option></Select>}</Field>
            <Field label="Title" required>{(p) => <Input {...p} value={x.title} onChange={(e) => upd(i, { title: e.target.value })} />}</Field>
            <Field label="Address" help={`/${x.kind === "post" ? "blog" : "p"}/…`}>{(p) => <Input {...p} value={x.slug} placeholder={slugOf(x.title)} onChange={(e) => upd(i, { slug: e.target.value })} />}</Field>
            <Field label="Date">{(p) => <Input {...p} type="date" value={x.date} onChange={(e) => upd(i, { date: e.target.value })} />}</Field>
          </div>
          <Field label="Short summary">{(p) => <Input {...p} value={x.summary} onChange={(e) => upd(i, { summary: e.target.value })} />}</Field>
          <Field label="Cover photo link" help="Optional. Shown behind the heading. An https:// link or a path such as /brand/about-cover.jpg.">{(p) => <Input {...p} value={x.cover ?? ""} onChange={(e) => upd(i, { cover: e.target.value })} />}</Field>
          <Field label="Text" help={"Plain text. A blank line starts a new paragraph. Start a line with \"## \" for a heading, or with \"- \" for a bullet list."}>{(p) => <Textarea {...p} rows={8} value={x.body} onChange={(e) => upd(i, { body: e.target.value })} />}</Field>
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-6">
              <Checkbox label="Published" checked={x.published} onChange={(e) => upd(i, { published: e.target.checked })} />
              {x.kind === "page" && <Checkbox label="Show in header menu" checked={x.inMenu !== false} onChange={(e) => upd(i, { inMenu: e.target.checked })} />}
            </div>
            <Button type="button" variant="ghost" onClick={() => setItems((a) => a.filter((_, j) => j !== i))}>Remove</Button>
          </div>
        </div>
      ))}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap justify-between gap-2">
        <div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => add("page")}>Add page</Button><Button type="button" variant="secondary" onClick={() => add("post")}>Add blog post</Button></div>
        <Button type="submit" loading={pending}>Save pages and blog</Button>
      </div>
    </form>
  );
}
