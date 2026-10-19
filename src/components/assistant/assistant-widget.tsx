"use client";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Check, Loader2, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { confirmAssistantAction, cancelAssistantAction } from "@/server/actions/assistant";

type Proposal = { id: string; tool: string; summary: string; expiresAt: string; state?: "pending" | "confirming" | "done" | "failed" | "cancelled"; note?: string };
type Msg = { id: string; role: "user" | "assistant"; text: string; proposals?: Proposal[]; mode?: "ai" | "knowledge"; suggestions?: string[]; error?: boolean };

export type AssistantConfig = {
  userKey: string;
  aiConnected: boolean;
  canWrite: boolean;
  suggestions: string[];
};

let seq = 0;
const nid = () => `m${Date.now().toString(36)}${++seq}`;

/** Only links to screens inside this app are ever rendered as links (a path starting with a single "/"). */
const LINK = /^\[(.+)\]\((\/(?!\/)[^)\s]*)\)$/;

/** Tiny, safe Markdown subset (bold, italics, code, in-app links, bullets, numbered lists) — built from React nodes, never raw HTML. */
function inline(text: string, onNavigate?: () => void) {
  const parts = text.split(/(\[[^\]]+\]\(\/[^)\s]*\)|\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g);
  return parts.map((p, i) => {
    const link = LINK.exec(p);
    if (link) return <Link key={i} href={link[2]!} onClick={onNavigate} className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700">{inline(link[1]!)}</Link>;
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`") && p.length > 2) return <code key={i} className="rounded bg-ink-100 px-1 py-px font-mono text-[12.5px]">{p.slice(1, -1)}</code>;
    if (p.startsWith("_") && p.endsWith("_") && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}
function Markdown({ text, onNavigate }: { text: string; onNavigate?: () => void }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split("\n");
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(<Tag key={blocks.length} className={cn("my-1.5 space-y-0.5 pl-5", list.ordered ? "list-decimal" : "list-disc")}>{list.items.map((it, i) => <li key={i}>{inline(it, onNavigate)}</li>)}</Tag>);
    list = null;
  };
  for (const raw of lines) {
    const bullet = raw.match(/^\s*[-•*]\s+(.*)$/);
    const numbered = raw.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]!);
      continue;
    }
    flush();
    if (raw.trim() === "") continue;
    blocks.push(<p key={blocks.length} className="my-1.5">{inline(raw, onNavigate)}</p>);
  }
  flush();
  return <>{blocks}</>;
}

/** The assistant panel. The launcher lives in the page header (see AppShell) so it never covers page content. */
export function AssistantWidget({ config, open, onOpenChange }: { config: AssistantConfig; open: boolean; onOpenChange: (open: boolean) => void }) {
  const storeKey = `yadea.assistant.${config.userKey}`;
  const setOpen = onOpenChange;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Restore this tab's conversation (per user) — storage may be unavailable, so every access is guarded.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storeKey);
      if (raw) setMsgs(JSON.parse(raw) as Msg[]);
    } catch {}
  }, [storeKey]);
  useEffect(() => {
    try {
      sessionStorage.setItem(storeKey, JSON.stringify(msgs.slice(-40)));
    } catch {}
  }, [msgs, storeKey]);
  useEffect(() => { if (open) { endRef.current?.scrollIntoView({ block: "end" }); inputRef.current?.focus(); } }, [open, msgs, busy]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const patchProposal = useCallback((msgId: string, id: string, patch: Partial<Proposal>) => {
    setMsgs((ms) => ms.map((m) => (m.id === msgId ? { ...m, proposals: m.proposals?.map((p) => (p.id === id ? { ...p, ...patch } : p)) } : m)));
  }, []);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    const history = msgs.filter((m) => !m.error).slice(-16).map((m) => ({ role: m.role, text: m.text }));
    setMsgs((ms) => [...ms, { id: nid(), role: "user", text: message }]);
    setInput("");
    setBusy(true);
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, history }), signal: ctl.signal });
      const data = (await res.json().catch(() => ({}))) as { text?: string; proposals?: Proposal[]; mode?: "ai" | "knowledge"; suggestions?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "The assistant ran into a problem.");
      setMsgs((ms) => [...ms, { id: nid(), role: "assistant", text: data.text ?? "", mode: data.mode, suggestions: data.suggestions, proposals: (data.proposals ?? []).map((p) => ({ ...p, state: "pending" as const })) }]);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setMsgs((ms) => [...ms, { id: nid(), role: "assistant", text: (e as Error).message || "Something went wrong.", error: true }]);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const confirm = async (msgId: string, p: Proposal) => {
    patchProposal(msgId, p.id, { state: "confirming" });
    const r = await confirmAssistantAction(p.id);
    if (r.ok) {
      const note = (r.data as { message?: string } | undefined)?.message ?? r.message ?? "Done.";
      patchProposal(msgId, p.id, { state: "done", note });
      setMsgs((ms) => [...ms, { id: nid(), role: "assistant", text: `✓ Confirmed and saved: ${note}` }]);
      toast.success(note);
    } else {
      patchProposal(msgId, p.id, { state: "failed", note: r.error });
      toast.error(r.error);
    }
  };
  const cancel = async (msgId: string, p: Proposal) => {
    const r = await cancelAssistantAction(p.id);
    patchProposal(msgId, p.id, { state: "cancelled", note: r.ok ? "Cancelled — nothing was changed." : r.error });
  };

  const clear = () => { abortRef.current?.abort(); setMsgs([]); setBusy(false); };
  // On a phone the panel covers the page, so follow a link by getting out of its way.
  const onNavigate = () => { if (typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches) setOpen(false); };

  return (
    <>
      {open && (
        <section role="dialog" aria-label="YADEA assistant" className="fixed inset-x-2 bottom-2 z-50 flex h-[min(680px,calc(100dvh-1rem))] animate-pop-in flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-[var(--shadow-pop)] sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[430px]">
          <header className="flex shrink-0 items-center gap-3 bg-navy-900 px-4 py-3 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500"><Bot className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] leading-tight font-semibold">YADEA assistant</h2>
              <p className="flex items-center gap-1.5 text-xs text-slate-300"><span className={cn("h-1.5 w-1.5 rounded-full", config.aiConnected ? "bg-emerald-400" : "bg-amber-400")} />{config.aiConnected ? "AI connected" : "Built-in guide — AI not connected"}</p>
            </div>
            <button onClick={clear} className="rounded-md p-1.5 text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Clear conversation" title="Clear conversation"><Trash2 className="h-4 w-4" /></button>
            <button onClick={() => setOpen(false)} className="rounded-md p-1.5 text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Close assistant"><X className="h-5 w-5" /></button>
          </header>

          <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto bg-ink-50 p-4" aria-live="polite">
            {msgs.length === 0 && (
              <div className="space-y-3">
                <p className="rounded-xl bg-white p-3.5 text-sm text-ink-700 ring-1 ring-ink-200">
                  Hi! Ask me anything about YADEA CRM — what a screen contains, where to find something, how to do a task step by step, or for live numbers you&apos;re allowed to see{config.aiConnected && config.canWrite ? ". I can also prepare a change for you to confirm" : ""}.
                  {!config.aiConnected && <span className="mt-1.5 block text-xs text-amber-800">I&apos;m running in built-in guide mode: I know the whole platform and can look up live numbers, but I can&apos;t make changes or answer free-form questions until an administrator connects the AI key.</span>}
                </p>
                <div className="flex flex-wrap gap-2">
                  {config.suggestions.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-left text-[13px] text-ink-700 transition hover:border-brand-300 hover:bg-brand-50">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, idx) => (
              <div key={m.id} className={cn("flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
                <div className={cn("max-w-[92%] rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed", m.role === "user" ? "rounded-br-md bg-brand-500 text-white" : m.error ? "rounded-bl-md bg-red-50 text-red-800 ring-1 ring-red-200" : "rounded-bl-md bg-white text-ink-800 ring-1 ring-ink-200")}>
                  {m.role === "user" ? <p className="whitespace-pre-wrap">{m.text}</p> : <Markdown text={m.text} onNavigate={onNavigate} />}
                  {m.proposals?.map((p) => (
                    <div key={p.id} className="mt-2.5 rounded-xl border border-brand-200 bg-brand-50/60 p-3 text-ink-800">
                      <p className="text-[11px] font-semibold tracking-wide text-brand-700 uppercase">Proposed change — not saved yet</p>
                      <p className="mt-1 text-[13.5px] whitespace-pre-wrap">{p.summary}</p>
                      {(p.state === "pending" || p.state === "confirming" || p.state === undefined) && (
                        <div className="mt-2.5 flex gap-2">
                          <button disabled={p.state === "confirming"} onClick={() => confirm(m.id, p)} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand-500 px-3 text-[13px] font-medium text-white hover:bg-brand-600 disabled:opacity-60">
                            {p.state === "confirming" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Confirm
                          </button>
                          <button disabled={p.state === "confirming"} onClick={() => cancel(m.id, p)} className="inline-flex h-8 items-center rounded-md border border-ink-200 bg-white px-3 text-[13px] font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-60">Cancel</button>
                        </div>
                      )}
                      {p.state === "done" && <p className="mt-2 text-[13px] font-medium text-emerald-700">✓ {p.note}</p>}
                      {p.state === "cancelled" && <p className="mt-2 text-[13px] text-ink-500">{p.note}</p>}
                      {p.state === "failed" && <p className="mt-2 text-[13px] font-medium text-red-700">Not saved: {p.note}</p>}
                    </div>
                  ))}
                </div>
                {m.role === "assistant" && m.mode === "knowledge" && <p className="mt-1 px-1 text-[11px] text-ink-400">Built-in guide answer</p>}
                {m.role === "assistant" && !busy && idx === msgs.length - 1 && !!m.suggestions?.length && (
                  <div className="mt-2 flex max-w-[92%] flex-wrap gap-1.5" aria-label="Suggested follow-up questions">
                    {m.suggestions.map((s) => (
                      <button key={s} onClick={() => send(s)} className="rounded-full border border-ink-200 bg-white px-3 py-1 text-left text-[12.5px] text-ink-700 transition hover:border-brand-300 hover:bg-brand-50">{s}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="flex justify-start"><div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-sm text-ink-500 ring-1 ring-ink-200"><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</div></div>
            )}
            <div ref={endRef} />
          </div>

          <form className="shrink-0 border-t border-ink-200 bg-white p-3" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                aria-label="Message the assistant"
                rows={1}
                value={input}
                maxLength={4000}
                onChange={(e) => { setInput(e.target.value); e.currentTarget.style.height = "auto"; e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 120)}px`; }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
                placeholder="Ask a question…"
                className="input max-h-[120px] min-h-10 resize-none py-2"
              />
              <button type="submit" disabled={busy || !input.trim()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-500 text-white transition hover:bg-brand-600 disabled:opacity-50" aria-label="Send"><Send className="h-4 w-4" /></button>
            </div>
            <p className="mt-1.5 text-[11px] text-ink-400">AI can make mistakes — check important details. Changes are only saved when you press Confirm.</p>
          </form>
        </section>
      )}
    </>
  );
}
