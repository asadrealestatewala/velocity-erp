"use client";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { platformLoginAction, type PlatformLoginState } from "@/server/actions/platform";

type Result = { ok: true; message?: string; data?: unknown } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "number" | "select" | "checkbox" | "textarea" | "date" | "password";
  options?: { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
  defaultValue?: string | number | boolean | null;
  optional?: boolean;
};

function initial(fields: FieldDef[]) {
  return Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? (f.type === "checkbox" ? false : "")]));
}

/** Converts the raw form strings into the typed object the server action expects. */
function coerce(fields: FieldDef[], v: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = v[f.name];
    if (f.type === "number") out[f.name] = raw === "" || raw == null ? (f.optional ? null : 0) : Number(raw);
    else if (f.type === "checkbox") out[f.name] = Boolean(raw);
    else out[f.name] = f.optional && raw === "" ? null : raw;
  }
  return out;
}

function Fields({ fields, values, set, errors }: { fields: FieldDef[]; values: Record<string, unknown>; set: (k: string, v: unknown) => void; errors?: Record<string, string> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((f) => {
        const wide = f.type === "textarea";
        if (f.type === "checkbox")
          return <div key={f.name} className={wide ? "sm:col-span-2" : ""}><Checkbox label={f.label} checked={Boolean(values[f.name])} onChange={(e) => set(f.name, e.target.checked)} /></div>;
        return (
          <Field key={f.name} label={f.label} help={f.hint} error={errors?.[f.name]} className={wide ? "sm:col-span-2" : ""}>
            {(a) =>
              f.type === "select" ? (
                <Select {...a} value={String(values[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)}>
                  {f.optional && <option value="">None</option>}
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              ) : f.type === "textarea" ? (
                <Textarea {...a} rows={3} value={String(values[f.name] ?? "")} placeholder={f.placeholder} onChange={(e) => set(f.name, e.target.value)} />
              ) : (
                <Input {...a} type={f.type ?? "text"} value={String(values[f.name] ?? "")} placeholder={f.placeholder} autoComplete="off" onChange={(e) => set(f.name, e.target.value)} />
              )
            }
          </Field>
        );
      })}
    </div>
  );
}

/** An inline form that runs one server action with the typed values. */
export function ActionForm({ fields, action, submitLabel = "Save", refresh = true, reset = false, onDone }: {
  fields: FieldDef[];
  action: (values: any) => Promise<Result>; // eslint-disable-line @typescript-eslint/no-explicit-any
  submitLabel?: string;
  refresh?: boolean;
  reset?: boolean;
  onDone?: (r: Extract<Result, { ok: true }>) => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, unknown>>(() => initial(fields));
  const [errors, setErrors] = useState<Record<string, string>>();
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null); setErrors(undefined);
          const r = await action(coerce(fields, values));
          if (r.ok) {
            toast.success(r.message ?? "Saved");
            const d = r.data as { tempPassword?: string } | undefined;
            if (d?.tempPassword) setSecret(d.tempPassword);
            if (reset) setValues(initial(fields));
            onDone?.(r);
            if (refresh) router.refresh();
          } else { setError(r.error); setErrors(r.fieldErrors); }
        });
      }}
    >
      <Fields fields={fields} values={values} set={(k, v) => setValues((s) => ({ ...s, [k]: v }))} errors={errors} />
      <FormError error={error} />
      {secret && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Temporary password (shown once): <code className="font-mono font-semibold">{secret}</code></p>}
      <Button type="submit" loading={pending}>{submitLabel}</Button>
    </form>
  );
}

/** A button that asks for a written reason (when required) and then runs one server action. */
export function ReasonButton({ label, title, description, action, fixed, withReason = true, variant = "secondary", size = "sm", extra, confirmLabel, hideDefaultReason }: {
  label: string;
  title: string;
  description?: string;
  /** A (bound) server action. Receives { ...fixed, ...extraFields, reason }. */
  action: (payload: any) => Promise<Result>; // eslint-disable-line @typescript-eslint/no-explicit-any
  fixed?: Record<string, unknown>;
  withReason?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  extra?: FieldDef[];
  confirmLabel?: string;
  hideDefaultReason?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [vals, setVals] = useState<Record<string, unknown>>(() => initial(extra ?? []));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      trigger={<Button variant={variant} size={size}>{label}</Button>}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant={variant === "danger" ? "danger" : "primary"}
            loading={pending}
            onClick={() => start(async () => {
              setError(null);
              const r = await action({ ...fixed, ...coerce(extra ?? [], vals), ...(hideDefaultReason ? {} : { reason }) });
              if (r.ok) { toast.success(r.message ?? "Done"); setOpen(false); setReason(""); router.refresh(); } else setError(r.error);
            })}
          >
            {confirmLabel ?? label}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {description && <p className="text-sm text-slate-600">{description}</p>}
        {extra && extra.length > 0 && <Fields fields={extra} values={vals} set={(k, v) => setVals((s) => ({ ...s, [k]: v }))} />}
        {withReason && !hideDefaultReason && (
          <Field label="Reason (recorded in the audit log)">{(a) => <Textarea {...a} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        )}
        <FormError error={error} />
      </div>
    </Dialog>
  );
}

/** One-click action with no input (e.g. confirm a payment, run a job). */
export function RunButton({ label, action, variant = "secondary", size = "sm", reload = true }: { label: string; action: () => Promise<Result>; variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md"; reload?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant={variant} size={size} loading={pending} onClick={() => start(async () => { const r = await action(); if (r.ok) { toast.success(r.message ?? "Done", { duration: 8000 }); if (reload) router.refresh(); } else toast.error(r.error); })}>
      {label}
    </Button>
  );
}

export function PlatformLoginForm() {
  const [state, formAction] = useActionState<PlatformLoginState, FormData>(platformLoginAction, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <Field label="Email">{(a) => <Input {...a} name="email" type="email" required autoComplete="username" />}</Field>
      <Field label="Password">{(a) => <Input {...a} name="password" type="password" required autoComplete="current-password" />}</Field>
      {state?.needsCode && <Field label="Authenticator code or recovery code">{(a) => <Input {...a} name="code" autoComplete="one-time-code" autoFocus />}</Field>}
      <FormError error={state?.error} />
      <SubmitButton className="w-full">{state?.needsCode ? "Verify and sign in" : "Sign in"}</SubmitButton>
    </form>
  );
}
