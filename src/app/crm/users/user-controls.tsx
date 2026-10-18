"use client";
import { Fragment, useState } from "react";
import { Copy, KeyRound, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { ConfirmButton } from "@/components/ui/confirm";
import { useAction } from "@/components/ui/use-action";
import { createDepartmentAction, resetUserPasswordAction, saveUserAction, setRolePermissionsAction } from "@/server/actions/users";

type Opt = { id: string; name: string };

function SecretDialog({ pw, onClose }: { pw: string | null; onClose: () => void }) {
  return (
    <Dialog open={!!pw} onOpenChange={(o) => !o && onClose()} title="Temporary password" description="Shown only once. The user must change it at first sign-in." size="sm">
      <div className="flex items-center gap-2 rounded-lg bg-ink-900 px-3 py-2 font-mono text-sm text-white">
        <span className="flex-1 select-all">{pw}</span>
        <button aria-label="Copy password" onClick={() => { void navigator.clipboard.writeText(pw ?? ""); toast.success("Copied"); }}><Copy className="h-4 w-4" /></button>
      </div>
    </Dialog>
  );
}

export function UserDialog({ user, roles, departments, isSelf }: { user?: { id: string; name: string; email: string; phone: string | null; roleId: string; departmentId: string | null; isActive: boolean }; roles: Opt[]; departments: Opt[]; isSelf?: boolean }) {
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [v, setV] = useState({ name: user?.name ?? "", email: user?.email ?? "", phone: user?.phone ?? "", roleId: user?.roleId ?? roles[0]?.id ?? "", departmentId: user?.departmentId ?? "", isActive: user?.isActive ?? true });
  const save = useAction(saveUserAction, { onSuccess: (d) => { setOpen(false); if (d?.tempPassword) setSecret(d.tempPassword); } });
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        trigger={user ? <Button size="iconSm" variant="ghost" aria-label={`Edit ${user.name}`}><Pencil className="h-4 w-4" /></Button> : <Button><Plus className="h-4 w-4" /> New user</Button>}
        title={user ? "Edit user" : "New central user"}
        description="Central (head-office) accounts. Dealership staff are added from a dealership's Team panel."
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={save.pending} onClick={() => save.run(user?.id ?? null, v)}>Save</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={save.fieldErrors.name}>{(p) => <Input {...p} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}</Field>
          <Field label="Email" required error={save.fieldErrors.email}>{(p) => <Input {...p} type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />}</Field>
          <Field label="Mobile number" help="Can also be used to sign in. Each number belongs to one account." error={save.fieldErrors.phone}>{(p) => <Input {...p} inputMode="tel" placeholder="03xx xxxxxxx" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />}</Field>
          <Field label="Role" help={isSelf ? "You can't change your own role." : undefined}>{(p) => <Select {...p} disabled={isSelf} value={v.roleId} onChange={(e) => setV({ ...v, roleId: e.target.value })}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>}</Field>
          <Field label="Department">{(p) => <Select {...p} value={v.departmentId} onChange={(e) => setV({ ...v, departmentId: e.target.value })}><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>}</Field>
          <div className="pt-6"><Checkbox label="Active" disabled={isSelf} checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} /></div>
        </div>
      </Dialog>
      <SecretDialog pw={secret} onClose={() => setSecret(null)} />
    </>
  );
}

export function ResetPasswordButton({ id, name }: { id: string; name: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const reset = useAction(resetUserPasswordAction, { onSuccess: (d) => d && setSecret(d.tempPassword) });
  return (
    <>
      <ConfirmButton
        trigger={<Button size="iconSm" variant="ghost" aria-label={`Reset password for ${name}`}><KeyRound className="h-4 w-4" /></Button>}
        title={`Reset password for ${name}?`}
        description="All of their sessions will be signed out and a temporary password generated."
        confirmLabel="Reset password"
        danger={false}
        onConfirm={() => reset.run(id)}
      />
      <SecretDialog pw={secret} onClose={() => setSecret(null)} />
    </>
  );
}

export function PermissionMatrix({ roles, permissions, myRoleKey, isSuper, myPerms }: {
  roles: { id: string; key: string; name: string; scope: string; perms: string[] }[];
  permissions: { key: string; group: string; description: string }[];
  myRoleKey: string; isSuper: boolean; myPerms: string[];
}) {
  const [state, setState] = useState<Record<string, Set<string>>>(() => Object.fromEntries(roles.map((r) => [r.id, new Set(r.perms)])));
  const save = useAction(setRolePermissionsAction);
  const groups = [...new Set(permissions.map((p) => p.group))];
  const locked = (r: (typeof roles)[number]) => r.key === "SUPER_ADMIN" || r.key === myRoleKey;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="sticky top-0 bg-white">
          <tr className="border-b border-ink-200">
            <th className="th">Permission</th>
            {roles.map((r) => (
              <th key={r.id} className="th text-center normal-case">
                <span className="block text-ink-800">{r.name}</span>
                <span className="text-[10px] font-normal text-ink-400">{r.scope === "CENTRAL" ? "central" : "dealership"}{locked(r) ? " · locked" : ""}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g}>
              <tr className="bg-ink-50"><td colSpan={roles.length + 1} className="px-4 py-1.5 text-xs font-semibold text-ink-500 uppercase">{g}</td></tr>
              {permissions.filter((p) => p.group === g).map((p) => (
                <tr key={p.key} className="border-b border-ink-100">
                  <td className="td"><p className="font-mono text-xs text-ink-800">{p.key}</p><p className="text-xs text-ink-500">{p.description}</p></td>
                  {roles.map((r) => {
                    const on = r.key === "SUPER_ADMIN" ? true : state[r.id]!.has(p.key);
                    const disabled = locked(r) || (!isSuper && !myPerms.includes(p.key));
                    return (
                      <td key={r.id} className="td text-center">
                        <input
                          type="checkbox"
                          aria-label={`${r.name}: ${p.key}`}
                          className="h-4 w-4 accent-brand-500 disabled:opacity-40"
                          checked={on}
                          disabled={disabled}
                          onChange={(e) => setState((s) => { const n = new Set(s[r.id]); if (e.target.checked) n.add(p.key); else n.delete(p.key); return { ...s, [r.id]: n }; })}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
          <tr>
            <td className="td text-xs text-ink-400">Save changes per role →</td>
            {roles.map((r) => (
              <td key={r.id} className="td text-center">
                {!locked(r) && <Button size="xs" loading={save.pending} onClick={() => save.run(r.id, [...state[r.id]!])}>Save</Button>}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function NewDepartment() {
  const [name, setName] = useState("");
  const { run, pending } = useAction(createDepartmentAction, { onSuccess: () => setName("") });
  return (
    <div className="flex gap-2">
      <Input aria-label="Department name" placeholder="New department" value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
      <Button size="sm" loading={pending} disabled={!name.trim()} onClick={() => run(name)}>Add</Button>
    </div>
  );
}
