"use client";
import { useActionState } from "react";
import { loginAction } from "@/server/actions/auth";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";

export function LoginForm({ portal, next }: { portal: "crm" | "portal"; next?: string }) {
  const [state, action] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="portal" value={portal} />
      {next && <input type="hidden" name="next" value={next} />}
      <FormError error={state?.error} />
      <Field label="Email">{(p) => <Input {...p} name="email" type="email" autoComplete="username" required placeholder="you@company.com" />}</Field>
      <Field label="Password">{(p) => <Input {...p} name="password" type="password" autoComplete="current-password" required />}</Field>
      <SubmitButton className="w-full" size="lg">
        Sign in
      </SubmitButton>
    </form>
  );
}
