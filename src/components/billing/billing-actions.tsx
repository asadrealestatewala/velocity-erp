"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { cancelSubscriptionAction, openPortalAction } from "@/server/actions/billing";
import { resendConfirmationAction } from "@/server/actions/workspace";

export function BillingActions({ canCancel, hasCard }: { canCancel: boolean; hasCard: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {hasCard && (
        <Button
          variant="secondary"
          loading={pending}
          onClick={() => start(async () => { const r = await openPortalAction(); if (r.ok) window.location.assign((r.data as { url: string }).url); else toast.error(r.error); })}
        >
          Manage card &amp; invoices
        </Button>
      )}
      {canCancel && (
        <ConfirmButton
          trigger={<Button variant="ghost">Cancel subscription</Button>}
          title="Cancel your subscription?"
          description="It will not renew. You keep full access until the end of the period you already paid for, and nothing is deleted."
          confirmLabel="Cancel subscription"
          onConfirm={() => cancelSubscriptionAction().then((r) => { if (r.ok) { toast.success(r.message ?? "Cancelled"); window.location.reload(); } else toast.error(r.error); })}
        />
      )}
    </div>
  );
}

export function ResendConfirmation() {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="secondary" loading={pending} onClick={() => start(async () => { const r = await resendConfirmationAction(); if (r.ok) toast.success(r.message ?? "Sent"); else toast.error(r.error); })}>
      Resend confirmation email
    </Button>
  );
}
