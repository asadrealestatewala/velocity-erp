"use client";
import { forwardRef, useId } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "./button";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn("input", className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, ...p },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn("input resize-y", className)} {...p} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...p },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        "input appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22none%22 stroke=%22%23667085%22 stroke-width=%222%22 viewBox=%220 0 24 24%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-9",
        className,
      )}
      {...p}
    >
      {children}
    </select>
  );
});

/** Label + control + help/error. Pass the control as a render function to wire ids and aria. */
export function Field({
  label,
  required,
  error,
  help,
  className,
  children,
}: {
  label?: React.ReactNode;
  required?: boolean;
  error?: string;
  help?: React.ReactNode;
  className?: string;
  children: (p: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => React.ReactNode;
}) {
  const id = useId();
  const descId = error || help ? `${id}-desc` : undefined;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="label">
          {label}
          {required && <span className="ml-0.5 text-brand-600">*</span>}
        </label>
      )}
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": descId })}
      {error ? (
        <p id={descId} className="mt-1 text-xs font-medium text-red-600">
          {error}
        </p>
      ) : help ? (
        <p id={descId} className="mt-1 text-xs text-ink-500">
          {help}
        </p>
      ) : null}
    </div>
  );
}

export function Checkbox({ label, className, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5 text-sm text-ink-700", className)}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-ink-300 accent-brand-500" {...p} />
      <span>{label}</span>
    </label>
  );
}

export function SubmitButton({ children, ...p }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} {...p}>
      {children}
    </Button>
  );
}

export function FormError({ error }: { error?: string | null }) {
  if (!error) return null;
  return <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>;
}
