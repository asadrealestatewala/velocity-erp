"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Textarea } from "@/components/ui/form";

type Result = { ok: true; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Reply to a ticket, or leave a note only staff can see. `allowNote` is false for the customer's own reply box. */
export function TicketReplyBox({ action, allowNote = true, label = "Reply", submitLabel = "Send reply" }: { action: (v: { body: string; internal?: boolean }) => Promise<Result>; allowNote?: boolean; label?: string; submitLabel?: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const r = await action({ body, internal });
          if (r.ok) { toast.success(r.message ?? "Sent"); setBody(""); router.refresh(); } else setError(r.fieldErrors?.body ?? r.error);
        });
      }}
    >
      <Field label={internal ? "Internal note (customers never see this)" : label}>{(a) => <Textarea {...a} rows={5} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
      {allowNote && <Checkbox label="Internal note only" checked={internal} onChange={(e) => setInternal(e.target.checked)} />}
      <FormError error={error} />
      <Button type="submit" loading={pending} disabled={!body.trim()}>{internal ? "Add note" : submitLabel}</Button>
    </form>
  );
}
