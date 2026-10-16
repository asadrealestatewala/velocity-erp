"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/server/errors";

/**
 * Calls a server action, shows a toast, refreshes server components on success,
 * and exposes field errors for inline display.
 */
export function useAction<A extends unknown[], T>(
  action: (...args: A) => Promise<ActionResult<T>>,
  opts: { success?: string | ((d: T | undefined) => string); onSuccess?: (d: T | undefined) => void; refresh?: boolean } = {},
) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const run = (...args: A) =>
    new Promise<ActionResult<T>>((resolve) => {
      start(async () => {
        const res = await action(...args);
        if (res.ok) {
          setFieldErrors({});
          setError(null);
          const msg = typeof opts.success === "function" ? opts.success(res.data) : (opts.success ?? res.message);
          if (msg) toast.success(msg);
          if (opts.refresh !== false) router.refresh();
          opts.onSuccess?.(res.data);
        } else {
          setFieldErrors(res.fieldErrors ?? {});
          setError(res.error);
          toast.error(res.error);
        }
        resolve(res);
      });
    });

  return { run, pending, fieldErrors, error, setFieldErrors };
}
