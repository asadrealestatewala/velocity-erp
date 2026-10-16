"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/misc";
import { Field, Input } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { changePasswordAction } from "@/server/actions/auth";
import { saveNotificationPrefsAction } from "@/server/actions/notifications";

type Prefs = Record<string, { inApp: boolean; email: boolean }>;

export function AccountView({ user, types, prefs, mustChange, emailConfigured }: { user: { name: string; email: string; roleName: string }; types: Record<string, string>; prefs: Prefs; mustChange: boolean; emailConfigured: boolean }) {
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const change = useAction(changePasswordAction, { onSuccess: () => setPw({ current: "", next: "", confirm: "" }) });
  const [p, setP] = useState<Prefs>(() => Object.fromEntries(Object.keys(types).map((k) => [k, { inApp: prefs[k]?.inApp !== false, email: prefs[k]?.email !== false }])));
  const save = useAction(saveNotificationPrefsAction);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Profile" />
        <div className="space-y-1 p-5 text-sm">
          <p><span className="text-ink-500">Name:</span> {user.name}</p>
          <p><span className="text-ink-500">Email:</span> {user.email}</p>
          <p><span className="text-ink-500">Role:</span> {user.roleName}</p>
        </div>
      </Card>
      <Card>
        <CardHeader title="Change password" description={mustChange ? "Your administrator requires you to set a new password." : "At least 10 characters, with a letter and a number."} />
        <form className="space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); change.run(pw); }}>
          {mustChange && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Please replace your temporary password.</p>}
          <Field label="Current password" error={change.fieldErrors.current}>{(f) => <Input {...f} type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />}</Field>
          <Field label="New password" error={change.fieldErrors.next}>{(f) => <Input {...f} type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />}</Field>
          <Field label="Confirm new password" error={change.fieldErrors.confirm}>{(f) => <Input {...f} type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />}</Field>
          <div className="flex justify-end"><Button type="submit" loading={change.pending}>Update password</Button></div>
        </form>
      </Card>
      <Card className="lg:col-span-2" id="notifications">
        <CardHeader title="Notification preferences" description={emailConfigured ? "Email is delivered through the configured SMTP provider." : "Email delivery is not configured on this server — only in-app notifications are delivered."} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50/60"><tr><th className="th">Event</th><th className="th text-center">In-app</th><th className="th text-center">Email</th></tr></thead>
            <tbody className="divide-y divide-ink-100">
              {Object.entries(types).map(([k, label]) => (
                <tr key={k}>
                  <td className="td">{label}</td>
                  <td className="td text-center"><input type="checkbox" aria-label={`${label} in-app`} className="h-4 w-4 accent-brand-500" checked={p[k]!.inApp} onChange={(e) => setP({ ...p, [k]: { ...p[k]!, inApp: e.target.checked } })} /></td>
                  <td className="td text-center"><input type="checkbox" aria-label={`${label} email`} className="h-4 w-4 accent-brand-500" checked={p[k]!.email} onChange={(e) => setP({ ...p, [k]: { ...p[k]!, email: e.target.checked } })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end border-t border-ink-100 px-5 py-3"><Button loading={save.pending} onClick={() => save.run(p)}>Save preferences</Button></div>
      </Card>
    </div>
  );
}
