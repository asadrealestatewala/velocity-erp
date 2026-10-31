"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Textarea } from "@/components/ui/form";

type Result<T = unknown> = { ok: true; message?: string; data?: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };
type Action<T = unknown> = (values: any) => Promise<Result<T>>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TABS = [
  { href: "/platform/mail", label: "Inbox", exact: true },
  { href: "/platform/mail/sent", label: "Sent log" },
  { href: "/platform/mail/templates", label: "Templates", settings: true },
  { href: "/platform/mail/mailboxes", label: "Mailboxes & setup", settings: true },
  { href: "/platform/mail/branding", label: "Branding", settings: true },
];

export function MailTabs({ canSettings }: { canSettings: boolean }) {
  const path = usePathname();
  return (
    <nav aria-label="Mail" className="mb-6 flex flex-wrap gap-1 border-b border-ink-200">
      {TABS.filter((t) => canSettings || !t.settings).map((t) => {
        const on = t.exact ? !TABS.some((o) => !o.exact && path.startsWith(o.href)) : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${on ? "border-brand-600 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-900"}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Reply to a received message. */
export function ReplyBox({ action, toLabel }: { action: Action; toLabel: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const r = await action({ body });
          if (r.ok) { toast.success(r.message ?? "Sent"); setBody(""); router.refresh(); } else setError(r.fieldErrors?.body ?? r.error);
        });
      }}
    >
      <Field label={`Reply to ${toLabel}`}>{(a) => <Textarea {...a} rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your reply…" />}</Field>
      <FormError error={error} />
      <Button type="submit" loading={pending} disabled={!body.trim()}>Send reply</Button>
    </form>
  );
}

/** Sandboxed preview of a rendered email (no scripts, no same-origin access). */
export function MailPreview({ html, title = "Email preview" }: { html: string; title?: string }) {
  return <iframe title={title} sandbox="" srcDoc={html} className="h-[34rem] w-full rounded-xl border border-ink-200 bg-white" />;
}

export type TemplateDraft = { subject: string; heading: string; body: string; ctaLabel: string; ctaUrl: string; isEnabled: boolean };

/** Edit one template with a live preview (rendered on the server with sample values) and a test send. */
export function TemplateEditor({ templateKey, initial, canDisable, defaultTo, save, reset, preview, testSend, customised }: {
  templateKey: string;
  initial: TemplateDraft;
  canDisable: boolean;
  defaultTo: string;
  customised: boolean;
  save: Action;
  reset: () => Promise<Result>;
  preview: Action<{ subject: string; html: string }>;
  testSend: Action;
}) {
  const router = useRouter();
  const [v, setV] = useState<TemplateDraft>(initial);
  const [to, setTo] = useState(defaultTo);
  const [html, setHtml] = useState<string>("");
  const [subjectPreview, setSubjectPreview] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busy, startBusy] = useTransition();
  const seq = useRef(0);
  const set = <K extends keyof TemplateDraft>(k: K, val: TemplateDraft[K]) => setV((s) => ({ ...s, [k]: val }));

  useEffect(() => {
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const r = await preview(v);
      if (n !== seq.current) return;
      if (r.ok) { setHtml(r.data!.html); setSubjectPreview(r.data!.subject); setPreviewError(null); } else setPreviewError(r.error);
    }, 400);
    return () => clearTimeout(t);
  }, [v, preview]);

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setError(null);
            const r = await save(v);
            if (r.ok) { toast.success(r.message ?? "Saved"); router.refresh(); } else setError(r.error);
          });
        }}
      >
        <Field label="Subject">{(a) => <Input {...a} value={v.subject} onChange={(e) => set("subject", e.target.value)} />}</Field>
        <Field label="Heading">{(a) => <Input {...a} value={v.heading} onChange={(e) => set("heading", e.target.value)} />}</Field>
        <Field label="Message" help="Leave a blank line between paragraphs. Insert values with {{variables}}.">{(a) => <Textarea {...a} rows={10} value={v.body} onChange={(e) => set("body", e.target.value)} />}</Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Button label (optional)">{(a) => <Input {...a} value={v.ctaLabel} onChange={(e) => set("ctaLabel", e.target.value)} />}</Field>
          <Field label="Button link">{(a) => <Input {...a} value={v.ctaUrl} onChange={(e) => set("ctaUrl", e.target.value)} />}</Field>
        </div>
        {canDisable && <Checkbox label="Send this email" checked={v.isEnabled} onChange={(e) => set("isEnabled", e.target.checked)} />}
        <FormError error={error} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={pending}>Save template</Button>
          {customised && (
            <Button type="button" variant="secondary" loading={busy} onClick={() => startBusy(async () => { const r = await reset(); if (r.ok) { toast.success(r.message ?? "Restored"); router.refresh(); setTimeout(() => window.location.reload(), 300); } else toast.error(r.error); })}>
              Restore built-in wording
            </Button>
          )}
        </div>
        <div className="rounded-xl border border-ink-200 p-3">
          <p className="mb-2 text-sm font-medium">Send a test</p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Send to" className="min-w-0 flex-1">{(a) => <Input {...a} type="email" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
            <Button type="button" variant="secondary" loading={busy} onClick={() => startBusy(async () => { const r = await testSend({ ...v, to }); if (r.ok) toast.success(r.message ?? "Sent", { duration: 8000 }); else toast.error(r.error); })}>Send test</Button>
          </div>
          <p className="mt-1 text-xs text-ink-500">Uses the sample values shown in the preview, and the current (unsaved) text. Template: <code>{templateKey}</code></p>
        </div>
      </form>
      <div>
        <p className="mb-1 text-sm font-medium">Preview</p>
        <p className="mb-2 text-sm text-ink-600">Subject: <strong>{subjectPreview || "…"}</strong></p>
        {previewError ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{previewError}</p> : <MailPreview html={html || "<p style='font-family:sans-serif;padding:16px'>Rendering…</p>"} />}
      </div>
    </div>
  );
}

export type BrandValues = { companyName: string; logoUrl: string; accentColor: string; addressLine: string; website: string; supportEmail: string; supportPhone: string; footerNote: string };

export function BrandEditor({ initial, save, preview }: { initial: BrandValues; save: Action; preview: Action<{ html: string }> }) {
  const router = useRouter();
  const [v, setV] = useState<BrandValues>(initial);
  const [html, setHtml] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const seq = useRef(0);
  const set = (k: keyof BrandValues, val: string) => setV((s) => ({ ...s, [k]: val }));
  useEffect(() => {
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const r = await preview(v);
      if (n === seq.current && r.ok) setHtml(r.data!.html);
    }, 400);
    return () => clearTimeout(t);
  }, [v, preview]);
  const text = (k: keyof BrandValues, label: string, help?: string, type = "text") => (
    <Field label={label} help={help} error={errors[k]}>{(a) => <Input {...a} type={type} value={v[k]} onChange={(e) => set(k, e.target.value)} />}</Field>
  );
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setError(null); setErrors({});
            const r = await save(v);
            if (r.ok) { toast.success(r.message ?? "Saved"); router.refresh(); } else { setError(r.error); setErrors(r.fieldErrors ?? {}); }
          });
        }}
      >
        {text("companyName", "Company name")}
        {text("logoUrl", "Logo (shown on a dark header)", "An https:// link, or a path on this site such as /brand/velocity-logo-white.png. Leave empty to show the company name.")}
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <Field label="Button colour" error={errors.accentColor}>{(a) => <Input {...a} type="color" className="h-10 p-1" value={/^#[0-9a-fA-F]{6}$/.test(v.accentColor) ? v.accentColor : "#d6307a"} onChange={(e) => set("accentColor", e.target.value)} />}</Field>
          {text("accentColor", "Hex value")}
        </div>
        {text("addressLine", "Business address", "Shown in the footer of every email.")}
        {text("website", "Website", "https://…")}
        {text("supportEmail", "Support email", "Shown as “Need help?”. Falls back to Settings → Support email.", "email")}
        {text("supportPhone", "Support phone / WhatsApp")}
        {text("footerNote", "Extra footer line", "For example a registration number or a short disclaimer.")}
        <FormError error={error} />
        <Button type="submit" loading={pending}>Save branding</Button>
      </form>
      <div>
        <p className="mb-2 text-sm font-medium">Preview</p>
        <MailPreview html={html || "<p style='font-family:sans-serif;padding:16px'>Rendering…</p>"} title="Branding preview" />
      </div>
    </div>
  );
}
