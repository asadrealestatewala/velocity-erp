"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { saveWebsiteAction } from "@/server/actions/website";
import type { WebsiteConfig } from "@/server/website";

export function WebsiteEditor({ initial, forms }: { initial: WebsiteConfig; forms: { slug: string; name: string }[] }) {
  const [f, setF] = useState<WebsiteConfig>(initial);
  const { run, pending, fieldErrors } = useAction(saveWebsiteAction);
  const set = <K extends keyof WebsiteConfig>(k: K, v: WebsiteConfig[K]) => setF((x) => ({ ...x, [k]: v }));
  const text = (k: keyof WebsiteConfig, label: string, extra: { required?: boolean; help?: string; type?: string; placeholder?: string } = {}) => (
    <Field label={label} required={extra.required} help={extra.help} error={fieldErrors[k]}>
      {(p) => <Input {...p} type={extra.type} placeholder={extra.placeholder} value={f[k] as string} onChange={(e) => set(k, e.target.value as never)} />}
    </Field>
  );
  const formSelect = (k: "testDriveFormSlug" | "contactFormSlug", label: string) => (
    <Field label={label} error={fieldErrors[k]} help="Only published forms are listed.">
      {(p) => (
        <Select {...p} value={f[k]} onChange={(e) => set(k, e.target.value)}>
          <option value="">None (hide button)</option>
          {forms.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}
          {f[k] && !forms.some((x) => x.slug === f[k]) && <option value={f[k]}>{f[k]} (not published)</option>}
        </Select>
      )}
    </Field>
  );
  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); run(f); }}>
      <Checkbox label={<span><strong>Published</strong> — anyone with the link can see the website at <code>/site</code></span>} checked={f.published} onChange={(e) => set("published", e.target.checked)} />
      <div className="grid gap-4 md:grid-cols-2">
        {text("siteName", "Business name", { required: true })}
        {text("tagline", "Tagline")}
        {text("heroTitle", "Headline", { required: true })}
        {text("heroSubtitle", "Sub-headline")}
        {text("heroImageUrl", "Hero image link", { help: "An https:// link or a path such as /brand/hero-dealership.jpg. Leave empty for a plain colour." })}
        {text("primaryColor", "Brand colour", { help: "Hex colour, e.g. #e11d2e" })}
      </div>
      <Field label="About your business" error={fieldErrors.about}>{(p) => <Textarea {...p} rows={4} value={f.about} onChange={(e) => set("about", e.target.value)} />}</Field>
      <div className="grid gap-4 md:grid-cols-2">
        {text("phone", "Phone")}
        {text("whatsapp", "WhatsApp number", { help: "With country code, e.g. 923001234567" })}
        {text("email", "Email", { type: "email" })}
        {text("address", "Address")}
        {formSelect("testDriveFormSlug", "“Book a test drive” opens")}
        {formSelect("contactFormSlug", "“Contact us” opens")}
      </div>
      <div className="flex flex-wrap gap-6">
        <Checkbox label="Show bike models" checked={f.showModels} onChange={(e) => set("showModels", e.target.checked)} />
        <Checkbox label="Show showrooms" checked={f.showShowrooms} onChange={(e) => set("showShowrooms", e.target.checked)} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {text("seoTitle", "Search title", { help: "Shown in Google results. Defaults to the business name." })}
        {text("seoDescription", "Search description")}
      </div>
      <div className="flex justify-end"><Button type="submit" loading={pending}>Save website</Button></div>
    </form>
  );
}
