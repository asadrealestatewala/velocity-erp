export class AppError extends Error {
  constructor(
    message: string,
    public code: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "RATE_LIMITED" | "BILLING_LOCKED" | "PLAN_LIMIT" = "VALIDATION",
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

export const forbidden = (msg = "You do not have permission to perform this action.") => new AppError(msg, "FORBIDDEN");
export const notFound = (msg = "Record not found.") => new AppError(msg, "NOT_FOUND");

export type ActionResult<T = unknown> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Wrap a server-action body: converts AppErrors into safe results and hides internal errors. */
export async function runAction<T>(fn: () => Promise<T | ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    const out = await fn();
    if (out && typeof out === "object" && "ok" in (out as object)) return out as ActionResult<T>;
    return { ok: true, data: out as T };
  } catch (e) {
    // Next.js redirect()/notFound() throw control-flow errors that must propagate.
    if (e && typeof e === "object" && "digest" in e && typeof (e as { digest: unknown }).digest === "string") {
      const d = (e as { digest: string }).digest;
      if (d.startsWith("NEXT_REDIRECT") || d.startsWith("NEXT_NOT_FOUND") || d.startsWith("NEXT_HTTP_ERROR")) throw e;
    }
    if (e instanceof AppError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    if (e && typeof e === "object" && "issues" in e) {
      const issues = (e as { issues: { path: (string | number)[]; message: string }[] }).issues;
      const fieldErrors: Record<string, string> = {};
      for (const i of issues) fieldErrors[i.path.join(".")] ??= i.message;
      return { ok: false, error: "Please correct the highlighted fields.", fieldErrors };
    }
    console.error("[action error]", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
