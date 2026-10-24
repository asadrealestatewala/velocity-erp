"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";

type Result = { ok: true; message?: string; data?: unknown } | { ok: false; error: string };

/** Two-factor enrolment on the account page. */
export function TotpSetup({ enabled, begin, confirm, disable }: {
  enabled: boolean;
  begin: () => Promise<Result>;
  confirm: (code: string) => Promise<Result>;
  disable: (password: string) => Promise<Result>;
}) {
  const router = useRouter();
  const [secret, setSecret] = useState<{ secret: string; url: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (codes)
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-700">Save these one-time recovery codes somewhere safe. Each works once if you lose your phone. They are not shown again.</p>
        <pre className="rounded-lg bg-slate-100 p-3 font-mono text-sm">{codes.join("\n")}</pre>
        <Button onClick={() => { setCodes(null); router.refresh(); }}>I have saved them</Button>
      </div>
    );
  if (enabled)
    return (
      <div className="space-y-3">
        <p className="text-sm text-emerald-700">Two-factor sign-in is on.</p>
        <Field label="Your password (to turn it off)">{(a) => <Input {...a} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
        <FormError error={error} />
        <Button variant="danger" loading={pending} onClick={() => start(async () => { const r = await disable(password); if (r.ok) { toast.success(r.message ?? "Off"); setPassword(""); router.refresh(); } else setError(r.error); })}>Turn off two-factor</Button>
      </div>
    );
  return (
    <div className="space-y-3">
      {!secret ? (
        <Button loading={pending} onClick={() => start(async () => { const r = await begin(); if (r.ok) setSecret(r.data as { secret: string; url: string }); else setError(r.error); })}>Set up authenticator app</Button>
      ) : (
        <>
          <p className="text-sm text-slate-700">In your authenticator app (Google Authenticator, Microsoft Authenticator, Authy) add an account with this key, then type the 6-digit code it shows.</p>
          <code className="block break-all rounded-lg bg-slate-100 p-3 font-mono text-sm">{secret.secret}</code>
          <a className="link text-sm text-brand-600" href={secret.url}>Open in authenticator app</a>
          <Field label="6-digit code">{(a) => <Input {...a} inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" />}</Field>
          <Button loading={pending} onClick={() => start(async () => { const r = await confirm(code); if (r.ok) setCodes((r.data as { recoveryCodes: string[] }).recoveryCodes); else setError(r.error); })}>Turn on</Button>
        </>
      )}
      <FormError error={error} />
    </div>
  );
}
