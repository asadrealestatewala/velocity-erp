"use client";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { requestDemoAction, type DemoState } from "@/server/actions/marketing";

export function DemoForm() {
  const [state, action] = useActionState<DemoState, FormData>(requestDemoAction, undefined);
  if (state?.ok) return <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Thank you. We will email you within one working day.</p>;
  const e = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-3">
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <Field label="Your name" error={e.name}>{(a) => <Input {...a} name="name" required autoComplete="name" />}</Field>
      <Field label="Work email" error={e.email}>{(a) => <Input {...a} name="email" type="email" required autoComplete="email" />}</Field>
      <Field label="Company" error={e.company}>{(a) => <Input {...a} name="company" autoComplete="organization" />}</Field>
      <Field label="What would you like to see?" error={e.message}>{(a) => <Textarea {...a} name="message" rows={3} />}</Field>
      <FormError error={state?.error} />
      <SubmitButton>Request a demo</SubmitButton>
    </form>
  );
}

/** Staff who forgot their company's address: type the workspace code and go to its sign-in page. */
export function WorkspaceFinder() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const clean = code.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (clean) router.push(`/w/${clean}/login`);
      }}
    >
      <Field label="Workspace code">{(a) => <Input {...a} value={code} onChange={(ev) => setCode(ev.target.value)} placeholder="e.g. acme-motors" className="w-56" autoCapitalize="none" />}</Field>
      <Button type="submit" variant="secondary" disabled={!clean}>Go to sign-in</Button>
    </form>
  );
}
