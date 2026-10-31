"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Textarea } from "@/components/ui/form";

type Result = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Opens a ticket with the platform's support team; on success the action redirects to the new ticket. */
export function OpenTicketForm({ action }: { action: (v: { subject: string; body: string }) => Promise<Result | void> }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null); setErrors({});
          const r = await action({ subject, body });
          if (r && !r.ok) { setError(r.error); setErrors(r.fieldErrors ?? {}); }
        });
      }}
    >
      <Field label="Subject" error={errors.subject}>{(a) => <Input {...a} value={subject} maxLength={160} onChange={(e) => setSubject(e.target.value)} />}</Field>
      <Field label="What do you need help with?" error={errors.body}>{(a) => <Textarea {...a} rows={5} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
      <FormError error={error} />
      <Button type="submit" loading={pending} disabled={subject.trim().length < 3 || body.trim().length < 3}>Send to support</Button>
    </form>
  );
}
