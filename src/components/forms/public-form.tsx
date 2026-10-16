"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { CheckCircle2, Loader2, Send, UploadCloud, X, AlertCircle, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { isFieldVisible, validateValues, type FormField, type FormSettings } from "@/lib/forms/schema";

type Opt = { id: string; name: string; hint?: string | null };
type Values = Record<string, string | string[] | boolean>;

const span = (w: FormField["width"]) => (w === "full" ? "sm:col-span-6" : w === "third" ? "sm:col-span-2" : "sm:col-span-3");

/**
 * Renders a form from its saved schema. Used for the public page and the builder's live preview.
 * Option lists come from the database (initialOptions + live outlet lookups) — nothing is hardcoded.
 */
export function PublicForm({
  slug,
  fields,
  settings,
  token,
  idempotencyKey,
  initialOptions,
  consentText,
  privacyPolicyUrl,
  mode = "live",
}: {
  slug: string;
  fields: FormField[];
  settings: FormSettings;
  token?: string;
  idempotencyKey?: string;
  initialOptions: { cities: (Opt & { provinceId?: string })[]; provinces: Opt[]; bikeModels: Opt[] };
  consentText: string;
  privacyPolicyUrl: string;
  mode?: "live" | "preview" | "builder";
}) {
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [outlets, setOutlets] = useState<Record<string, Opt[] | "loading">>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: number; title: string; message: string } | null>(null);
  const [idem, setIdem] = useState(idempotencyKey ?? "");
  const formRef = useRef<HTMLFormElement>(null);
  const started = useRef(Date.now());

  const modelField = fields.find((f) => f.optionsSource === "bikeModels");
  const set = (key: string, v: string | string[] | boolean) => {
    setValues((prev) => {
      const next = { ...prev, [key]: v };
      // Changing a parent clears dependent selections (e.g. city → outlet, province → city).
      for (const f of fields) if (f.dependsOn === key) next[f.key] = "";
      return next;
    });
    setErrors((e) => ({ ...e, [key]: "" }));
  };

  // Load outlets whenever a city (or the model) changes
  useEffect(() => {
    for (const f of fields.filter((x) => x.optionsSource === "outlets" && x.dependsOn)) {
      const cityId = values[f.dependsOn!];
      if (typeof cityId !== "string" || !cityId) {
        setOutlets((o) => ({ ...o, [f.key]: [] }));
        continue;
      }
      const modelId = modelField ? values[modelField.key] : undefined;
      setOutlets((o) => ({ ...o, [f.key]: "loading" }));
      const q = new URLSearchParams({ source: "outlets", cityId, ...(typeof modelId === "string" && modelId ? { bikeModelId: modelId } : {}) });
      fetch(`/api/public/options?${q}`)
        .then((r) => r.json())
        .then((d: { options?: Opt[] }) => {
          const list = d.options ?? [];
          setOutlets((o) => ({ ...o, [f.key]: list }));
          setValues((v) => (typeof v[f.key] === "string" && v[f.key] && !list.some((x) => x.id === v[f.key]) ? { ...v, [f.key]: "" } : v));
        })
        .catch(() => setOutlets((o) => ({ ...o, [f.key]: [] })));
    }
  }, [fields, modelField, ...fields.filter((f) => f.optionsSource === "cities").map((f) => values[f.key]), modelField ? values[modelField.key] : null]); // eslint-disable-line react-hooks/exhaustive-deps

  const noOutlet = useMemo(
    () => fields.find((f) => f.optionsSource === "outlets" && isFieldVisible(f, values) && f.dependsOn && values[f.dependsOn] && Array.isArray(outlets[f.key]) && (outlets[f.key] as Opt[]).length === 0),
    [fields, values, outlets],
  );

  const optionsFor = (f: FormField): Opt[] => {
    switch (f.optionsSource) {
      case "cities": {
        const parent = f.dependsOn ? values[f.dependsOn] : null;
        return typeof parent === "string" && parent ? initialOptions.cities.filter((c) => c.provinceId === parent) : initialOptions.cities;
      }
      case "provinces":
        return initialOptions.provinces;
      case "bikeModels":
        return initialOptions.bikeModels;
      case "outlets":
        return Array.isArray(outlets[f.key]) ? (outlets[f.key] as Opt[]) : [];
      default:
        return (f.options ?? []).map((o) => ({ id: o.value, name: o.label }));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode !== "live") return;
    setFormError(null);
    const raw: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(values)) raw[k] = typeof v === "boolean" ? (v ? "on" : "") : v;
    const { errors: errs } = validateValues(fields, raw, Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.length])));
    if (noOutlet) errs[noOutlet.key] = "No outlet is available — choose another city";
    if (Object.keys(errs).length) {
      setErrors(errs);
      setFormError("Please correct the highlighted fields.");
      formRef.current?.querySelector<HTMLElement>(`[name="${Object.keys(errs)[0]}"]`)?.focus();
      return;
    }
    const fd = new FormData();
    for (const [k, v] of Object.entries(raw)) (Array.isArray(v) ? v : [v]).forEach((x) => fd.append(k, x));
    for (const [k, list] of Object.entries(files)) list.forEach((file) => fd.append(k, file));
    fd.set("_token", token ?? "");
    fd.set("_idem", idem);
    fd.set("_referrer", document.referrer.slice(0, 400));
    fd.set("company_website", (formRef.current?.elements.namedItem("company_website") as HTMLInputElement | null)?.value ?? "");
    const url = new URL(window.location.href);
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
      const v = url.searchParams.get(k);
      if (v) fd.set(k, v);
    }
    setSubmitting(true);
    try {
      // Bots that submit instantly are filtered server-side; give humans a natural minimum.
      const elapsed = Date.now() - started.current;
      if (elapsed < 2200) await new Promise((r) => setTimeout(r, 2200 - elapsed));
      const res = await fetch(`/api/public/forms/${encodeURIComponent(slug)}/submit`, { method: "POST", body: fd });
      const data = (await res.json()) as { ok: boolean; error?: string; fieldErrors?: Record<string, string>; submissionNumber?: number; successTitle?: string; successMessage?: string };
      if (data.ok) {
        setDone({ number: data.submissionNumber!, title: data.successTitle!, message: data.successMessage! });
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setErrors(data.fieldErrors ?? {});
        setFormError(data.error ?? "Something went wrong.");
      }
    } catch {
      setFormError("Network error — please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setValues({});
    setFiles({});
    setErrors({});
    setDone(null);
    setIdem(crypto.randomUUID());
    started.current = Date.now();
  };

  const inputCls = (key: string) =>
    cn(
      "block w-full rounded-lg border border-transparent bg-[#f3f5f9] px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 transition",
      "focus:border-[var(--brand)] focus:bg-white focus:ring-4 focus:ring-[color-mix(in_srgb,var(--brand)_18%,transparent)] focus:outline-none",
      errors[key] && "border-red-400 bg-red-50/40",
    );

  if (done)
    return (
      <div className="animate-pop-in py-10 text-center" role="status">
        <div className="mx-auto mb-4 flex h-16 w-16 animate-celebrate items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-9 w-9" />
        </div>
        <h2 className="text-2xl font-bold text-ink-900">{done.title}</h2>
        <p className="mx-auto mt-2 max-w-md text-ink-600">{done.message}</p>
        <p className="mt-4 text-sm text-ink-400">Reference number: <b className="text-ink-700">#{done.number}</b></p>
        <button onClick={reset} className="mt-6 text-sm font-medium text-[var(--brand)] hover:underline">Submit another response</button>
      </div>
    );

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="space-y-5" style={{ ["--brand" as string]: settings.primaryColor }}>
      {mode !== "live" && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          <Eye className="h-4 w-4" /> Preview — submissions are disabled
        </div>
      )}
      {formError && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {formError}
        </div>
      )}
      {/* Honeypot: invisible to people, attractive to bots */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>Company website<input type="text" name="company_website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-6">
        {fields.map((f) => {
          if (!isFieldVisible(f, values)) return null;
          const id = `f-${f.key}`;
          const err = errors[f.key];
          const descId = err || f.helpText ? `${id}-d` : undefined;
          const common = { id, name: f.key, "aria-invalid": err ? true : undefined, "aria-describedby": descId, "aria-required": f.required || undefined };
          const label = (
            <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-ink-700">
              {f.label}{f.required && <span className="ml-0.5 text-[var(--brand)]">*</span>}
            </label>
          );
          const help = err ? <p id={descId} className="mt-1 text-xs font-medium text-red-600">{err}</p> : f.helpText ? <p id={descId} className="mt-1 text-xs text-ink-500">{f.helpText}</p> : null;

          if (f.type === "heading")
            return <h3 key={f.id} className="pt-2 text-sm font-bold tracking-wide text-ink-900 uppercase sm:col-span-6">{f.label}</h3>;

          if (f.type === "consent")
            return (
              <div key={f.id} className="sm:col-span-6">
                <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-ink-600">
                  <input type="checkbox" {...common} checked={values[f.key] === true} onChange={(e) => set(f.key, e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded accent-[var(--brand)]" />
                  <span>
                    <ConsentText text={settings.consentText || consentText} url={settings.privacyPolicyUrl || privacyPolicyUrl} />
                    {f.required && <span className="ml-0.5 text-[var(--brand)]">*</span>}
                  </span>
                </label>
                {help}
              </div>
            );

          if (f.type === "checkbox")
            return (
              <div key={f.id} className={span(f.width)}>
                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-700">
                  <input type="checkbox" {...common} checked={values[f.key] === true} onChange={(e) => set(f.key, e.target.checked)} className="mt-0.5 h-4 w-4 rounded accent-[var(--brand)]" />
                  <span>{f.label}{f.required && <span className="ml-0.5 text-[var(--brand)]">*</span>}</span>
                </label>
                {help}
              </div>
            );

          if (f.type === "radio" || f.type === "checkboxes") {
            const opts = optionsFor(f);
            const cur = values[f.key];
            return (
              <fieldset key={f.id} className={span(f.width)} aria-describedby={descId}>
                <legend className="mb-1.5 block text-[13px] font-medium text-ink-700">{f.label}{f.required && <span className="ml-0.5 text-[var(--brand)]">*</span>}</legend>
                <div className="flex flex-wrap gap-2">
                  {opts.map((o) => {
                    const checked = f.type === "radio" ? cur === o.id : Array.isArray(cur) && cur.includes(o.id);
                    return (
                      <label key={o.id} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition", checked ? "border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_8%,white)] text-ink-900" : "border-ink-200 bg-white text-ink-600 hover:border-ink-300")}>
                        <input
                          type={f.type === "radio" ? "radio" : "checkbox"}
                          name={f.key}
                          value={o.id}
                          checked={checked}
                          onChange={(e) => {
                            if (f.type === "radio") set(f.key, o.id);
                            else {
                              const arr = Array.isArray(cur) ? cur : [];
                              set(f.key, e.target.checked ? [...arr, o.id] : arr.filter((x) => x !== o.id));
                            }
                          }}
                          className="accent-[var(--brand)]"
                        />
                        {o.name}
                      </label>
                    );
                  })}
                </div>
                {help}
              </fieldset>
            );
          }

          if (f.type === "select") {
            const opts = optionsFor(f);
            const parentMissing = f.dependsOn && !values[f.dependsOn];
            const loading = f.optionsSource === "outlets" && outlets[f.key] === "loading";
            const parentLabel = fields.find((x) => x.key === f.dependsOn)?.label.toLowerCase();
            return (
              <div key={f.id} className={span(f.width)}>
                {label}
                <div className="relative">
                  <select
                    {...common}
                    value={(values[f.key] as string) ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    disabled={!!parentMissing || loading}
                    className={cn(inputCls(f.key), "appearance-none pr-9 disabled:cursor-not-allowed disabled:opacity-60")}
                  >
                    <option value="">{parentMissing ? `Select a ${parentLabel} first` : loading ? "Loading…" : (f.placeholder ?? `Select ${f.label}`)}</option>
                    {opts.map((o) => <option key={o.id} value={o.id}>{o.name}{o.hint ? ` — ${o.hint}` : ""}</option>)}
                  </select>
                  {loading ? <Loader2 className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-ink-400" /> : (
                    <svg className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-ink-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
                  )}
                </div>
                {noOutlet?.key === f.key ? (
                  <p className="mt-1 text-xs font-medium text-amber-700" role="status">
                    No outlet in this city currently offers test drives{modelField && values[modelField.key] ? " for the selected model" : ""}. Please choose another city{modelField ? " or model" : ""}.
                  </p>
                ) : help}
              </div>
            );
          }

          if (f.type === "textarea")
            return (
              <div key={f.id} className={span(f.width)}>
                {label}
                <textarea {...common} rows={4} placeholder={f.placeholder} value={(values[f.key] as string) ?? ""} onChange={(e) => set(f.key, e.target.value)} maxLength={f.validation?.maxLength ?? 5000} className={cn(inputCls(f.key), "resize-y")} />
                {help}
              </div>
            );

          if (f.type === "file") {
            const list = files[f.key] ?? [];
            return (
              <div key={f.id} className={span(f.width)}>
                {label}
                <label htmlFor={id} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3 text-sm transition", err ? "border-red-300 bg-red-50/40" : "border-ink-200 bg-[#f8f9fb] hover:border-[var(--brand)]")}>
                  <UploadCloud className="h-5 w-5 text-ink-400" />
                  <span className="text-ink-600">{list.length ? `${list.length} file(s) selected` : (f.placeholder ?? "Choose file(s) to upload")}</span>
                </label>
                <input
                  {...common}
                  type="file"
                  className="sr-only"
                  multiple={(f.maxFiles ?? 1) > 1}
                  accept={f.accept === "image" ? ".jpg,.jpeg,.png,.webp" : ".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.webp"}
                  onChange={(e) => {
                    const picked = Array.from(e.target.files ?? []);
                    const tooBig = picked.find((p) => p.size > 10 * 1024 * 1024);
                    if (tooBig) setErrors((x) => ({ ...x, [f.key]: `${tooBig.name} is larger than 10 MB` }));
                    else setErrors((x) => ({ ...x, [f.key]: "" }));
                    setFiles((x) => ({ ...x, [f.key]: [...(x[f.key] ?? []), ...picked.filter((p) => p.size <= 10 * 1024 * 1024)].slice(0, f.maxFiles ?? 1) }));
                    e.target.value = "";
                  }}
                />
                {list.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {list.map((file, i) => (
                      <li key={i} className="flex items-center gap-2 rounded-md bg-ink-50 px-2.5 py-1.5 text-xs text-ink-700">
                        <span className="flex-1 truncate">{file.name}</span>
                        <span className="text-ink-400">{(file.size / 1024).toFixed(0)} KB</span>
                        <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((x) => ({ ...x, [f.key]: list.filter((_, j) => j !== i) }))} className="text-ink-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
                      </li>
                    ))}
                  </ul>
                )}
                {help}
              </div>
            );
          }

          const type = { email: "email", phone: "tel", number: "number", date: "date", time: "time", datetime: "datetime-local", text: "text" }[f.type as string] ?? "text";
          const auto = f.mapTo === "firstName" ? "given-name" : f.mapTo === "lastName" ? "family-name" : f.mapTo === "email" ? "email" : f.mapTo === "phone" ? "tel" : undefined;
          return (
            <div key={f.id} className={span(f.width)}>
              {label}
              <input
                {...common}
                type={type}
                inputMode={f.type === "phone" ? "tel" : f.type === "number" ? "numeric" : undefined}
                autoComplete={auto}
                placeholder={f.placeholder}
                min={f.type === "date" ? new Date().toISOString().slice(0, 10) : f.validation?.min}
                max={f.validation?.max}
                value={(values[f.key] as string) ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
                className={inputCls(f.key)}
              />
              {help}
            </div>
          );
        })}
      </div>

      <div className="flex justify-center pt-2">
        <button
          type="submit"
          disabled={submitting || !!noOutlet || mode !== "live"}
          className="inline-flex h-12 w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-6 text-[15px] font-bold tracking-wide text-white uppercase shadow-lg shadow-[color-mix(in_srgb,var(--brand)_30%,transparent)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-4 w-4" />}
          {settings.submitLabel}
        </button>
      </div>
    </form>
  );
}

/** Renders the consent text, turning "Privacy Policy" into a link. */
function ConsentText({ text, url }: { text: string; url: string }) {
  const parts = text.split(/(Privacy Policy)/i);
  return (
    <>
      {parts.map((p, i) =>
        /privacy policy/i.test(p) ? (
          <a key={i} href={url} target="_blank" rel="noreferrer noopener" className="font-medium text-[var(--brand)] underline-offset-2 hover:underline">{p}</a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function FormShell({ settings, children, compact }: { settings: FormSettings; children: React.ReactNode; compact?: boolean }) {
  return (
    <div className={cn("bg-[#eef1f5]", compact ? "rounded-2xl" : "min-h-dvh")}>
      <header
        className={cn("relative overflow-hidden bg-ink-950 bg-cover bg-center", compact ? "h-44 rounded-t-2xl" : "h-60 sm:h-72")}
        style={settings.headerImageUrl ? { backgroundImage: `url(${settings.headerImageUrl})` } : undefined}
      >
        <div className={cn("absolute inset-0", settings.headerImageUrl ? "bg-ink-950/60" : "bg-[radial-gradient(ellipse_at_15%_10%,rgba(240,116,0,0.45),transparent_55%),radial-gradient(ellipse_at_90%_100%,rgba(240,116,0,0.25),transparent_45%),linear-gradient(135deg,#0a0c0f,#1f2530)]")} />
        {!settings.headerImageUrl && (
          <svg className="absolute right-[-60px] bottom-[-40px] h-72 w-72 opacity-[0.07]" viewBox="0 0 100 100" aria-hidden><circle cx="50" cy="50" r="46" fill="none" stroke="white" strokeWidth="1" /><circle cx="50" cy="50" r="30" fill="none" stroke="white" strokeWidth="1" /></svg>
        )}
        <div className="relative mx-auto flex h-full max-w-5xl flex-col px-4 pt-5 sm:px-6">
          <Image src="/brand/yadea-logo-light.png" alt="YADEA" width={120} height={26} className="h-6 w-auto self-start" priority />
          <div className={cn("flex flex-1 flex-col items-center text-center text-white", compact ? "justify-center pb-6" : "justify-center pb-14")}>
            <h1 className={cn("font-bold tracking-tight", compact ? "text-2xl" : "text-3xl sm:text-5xl")}>{settings.title}</h1>
            {settings.subtitle && <p className="mt-2 max-w-xl text-sm text-white/80 sm:text-base">{settings.subtitle}</p>}
          </div>
        </div>
      </header>
      <main className={cn("relative mx-auto max-w-4xl px-3 sm:px-6", compact ? "-mt-6 pb-6" : "-mt-14 pb-16")}>
        <div className="rounded-3xl bg-white p-5 shadow-[0_10px_40px_-12px_rgb(16_24_40/0.25)] sm:p-9">
          {settings.cardTitle && <h2 className="mb-6 text-center text-lg font-bold tracking-wide text-ink-900 uppercase sm:text-xl">{settings.cardTitle}</h2>}
          {children}
        </div>
        {!compact && <p className="mt-6 text-center text-xs text-ink-400">© {new Date().getFullYear()} YADEA · Your information is handled according to our privacy policy.</p>}
      </main>
    </div>
  );
}
