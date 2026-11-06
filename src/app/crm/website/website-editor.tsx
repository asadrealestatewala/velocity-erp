"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { saveWebsiteAction } from "@/server/actions/website";
import type { WebsiteConfig } from "@/server/website";

export function WebsiteEditor({ initial, forms, appUrl, addresses }: { initial: WebsiteConfig; forms: { slug: string; name: string }[]; appUrl: string; addresses: { slug: string; subdomain: string | null; customDomain: string | null } }) {
  const [f, setF] = useState<WebsiteConfig>(initial);
  const [embed, setEmbed] = useState("");
  const { run, pending, fieldErrors } = useAction(saveWebsiteAction);
  const set = <K extends keyof WebsiteConfig>(k: K, v: WebsiteConfig[K]) => setF((x) => ({ ...x, [k]: v }));
  const text = (k: keyof WebsiteConfig, label: string, extra: { required?: boolean; help?: string; type?: string; placeholder?: string } = {}) => (
    <Field label={label} required={extra.required} help={extra.help} error={fieldErrors[k]}>
      {(p) => <Input {...p} type={extra.type} placeholder={extra.placeholder} value={f[k] as string} onChange={(e) => set(k, e.target.value as never)} />}
    </Field>
  );
  const area = (k: keyof WebsiteConfig, label: string, help: string) => (
    <Field label={label} help={help} error={fieldErrors[k]}>{(p) => <Textarea {...p} rows={4} value={f[k] as string} onChange={(e) => set(k, e.target.value as never)} />}</Field>
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
      <div className={`rounded-xl border p-4 text-sm ${initial.published ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        <p className="font-semibold">{initial.published ? "Your website is live" : "Your website is ready but not published yet"}</p>
        <p className="mt-1 text-ink-700">Your free website address: <a className="font-mono underline" href={addresses.subdomain ?? `${appUrl}/w/${addresses.slug}/site`} target="_blank" rel="noreferrer">{addresses.subdomain ?? `${appUrl}/w/${addresses.slug}/site`}</a></p>
        {!initial.published && <p className="mt-1 text-ink-700">Review the details below, then tick <strong>Published</strong> and save to put it online.</p>}
      </div>
      <Checkbox label={<span><strong>Published</strong> — anyone with the link can see the website</span>} checked={f.published} onChange={(e) => set("published", e.target.checked)} />
      <div className="grid gap-4 md:grid-cols-2">
        {text("siteName", "Business name", { required: true })}
        {text("tagline", "Tagline")}
        {text("heroTitle", "Headline", { required: true })}
        {text("heroSubtitle", "Sub-headline")}
        {text("heroImageUrl", "Hero image link", { help: "An https:// link or a path such as /brand/hero-dealership.jpg. Leave empty for a plain colour." })}
        {text("logoUrl", "Logo link", { help: "Shown in the header. An https:// link or a path such as /brand/yadea-vi-logo.png. Leave empty to show the business name." })}
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
      <div className="grid gap-4 md:grid-cols-2">
        {area("statsText", "Key numbers", "One per line: value | label")}
        {area("highlightsText", "Why choose us / technology", "One per line: title | description")}
        {text("highlightsTitle", "“Why us” heading", { help: "Leave empty for the plain list style." })}
        {text("highlightsIntro", "“Why us” intro text")}
        {area("impactText", "Impact cards", "One per line: value | label | optional image link")}
        {text("impactTitle", "Impact heading")}
        {area("cardsText", "Info cards", "One per line: title | text | link (e.g. /#showrooms)")}
        {area("heroSlidesText", "Hero slider", "One per line: image link | optional page link | alt text. Replaces the single hero image.")}
        {text("latestModelsTitle", "“Latest models” heading", { help: "Shows a sliding row of model cards with key specs. Leave empty to hide." })}
        {area("featureBlocksText", "Feature blocks", "One per line: title | intro | image link | point; point; point")}
        {text("insightsTitle", "Latest blog posts heading", { help: "Shows the 3 newest posts on the home page. Leave empty to hide." })}
        {text("newsletterTitle", "Subscribe box heading", { help: "Leave empty to hide." })}
        {text("newsletterText", "Subscribe box text")}
        {area("programsText", "Finance and lease programs", "One per line: title | description")}
        {area("socialsText", "Social links", "One per line: Facebook | https://...")}
        {area("navLinksText", "Extra menu links", "One per line: label | /forms/slug or https://...")}
      </div>
      <Checkbox label="Show the hero image as a plain banner (use when the artwork already has text on it)" checked={f.heroPlainImage} onChange={(e) => set("heroPlainImage", e.target.checked)} />
      <div className="flex flex-wrap gap-6">
        <Checkbox label="Show bike models" checked={f.showModels} onChange={(e) => set("showModels", e.target.checked)} />
        <Checkbox label="Show “in stock” page" checked={f.showInventory} onChange={(e) => set("showInventory", e.target.checked)} />
        <Checkbox label="Show showrooms" checked={f.showShowrooms} onChange={(e) => set("showShowrooms", e.target.checked)} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {text("seoTitle", "Search title", { help: "Shown in Google results. Defaults to the business name." })}
        {text("seoDescription", "Search description")}
      </div>
      <div className="space-y-2 rounded-xl border border-ink-200 p-4 text-sm">
        <p className="font-semibold">Your website addresses</p>
        <ul className="list-disc pl-5 text-ink-600">
          <li><code>{appUrl}/w/{addresses.slug}/site</code></li>
          {addresses.subdomain && <li><code>{addresses.subdomain}</code></li>}
          {addresses.customDomain ? <li><code>{addresses.customDomain}</code> (custom domain)</li> : <li>Want your own domain, e.g. www.yourbrand.com? Ask support to connect it, then point a CNAME at our host.</li>}
        </ul>
        <p className="pt-2 font-semibold">Embed a form on another website</p>
        {forms.length === 0 ? <p className="text-ink-600">Publish a form first.</p> : (
          <>
            <Select aria-label="Form to embed" value={embed || forms[0]!.slug} onChange={(e) => setEmbed(e.target.value)}>
              {forms.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}
            </Select>
            <Textarea readOnly rows={3} className="font-mono text-xs" value={`<iframe src="${appUrl}/w/${addresses.slug}/forms/${embed || forms[0]!.slug}" width="100%" height="720" style="border:0" title="Contact form" loading="lazy"></iframe>`} onFocus={(e) => e.currentTarget.select()} />
          </>
        )}
      </div>
      <div className="flex justify-end"><Button type="submit" loading={pending}>Save website</Button></div>
    </form>
  );
}
