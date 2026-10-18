"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, CheckCheck, ClipboardPen, ExternalLink, Mail, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { listMessagesAction, logMessageAction, sendMessageAction, type ChatMessage } from "@/server/actions/messages";
import { cn, fmtDate, fmtTime, isoDay } from "@/lib/utils";

export type ChannelFlags = { whatsapp: boolean; email: boolean };
type Channel = "WHATSAPP" | "EMAIL";

const WINDOW_MS = 24 * 60 * 60 * 1000;

/** WhatsApp / email conversation with the contact. Honest about what is connected: a message is "sent" only if the provider accepted it. */
export function ChatTab({
  contactId, leadId, phoneDigits, email, channels, initial,
}: { contactId: string; leadId: string | null; phoneDigits: string | null; email: string | null; channels: ChannelFlags; initial: ChatMessage[] }) {
  const [channel, setChannel] = useState<Channel>(phoneDigits || !email ? "WHATSAPP" : "EMAIL");
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [showLog, setShowLog] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(initial.length);

  const refresh = useCallback(async () => {
    const r = await listMessagesAction(contactId);
    if (r.ok && r.data) setMessages(r.data);
  }, [contactId]);

  // Poll while the tab is visible so inbound messages and delivery receipts appear without a reload.
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 10_000);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => {
    if (messages.length !== lastCount.current) {
      lastCount.current = messages.length;
      endRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages.length]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, []);

  const connected = channel === "WHATSAPP" ? channels.whatsapp : channels.email;
  const address = channel === "WHATSAPP" ? phoneDigits : email;
  const shown = messages.filter((m) => m.channel === channel);
  const lastInbound = [...messages].reverse().find((m) => m.channel === "WHATSAPP" && m.direction === "INBOUND" && m.status === "RECEIVED");
  const windowOpen = channel !== "WHATSAPP" || (!!lastInbound && Date.now() - new Date(lastInbound.at).getTime() < WINDOW_MS);

  const send = useAction(sendMessageAction, { refresh: false, onSuccess: () => { setBody(""); setSubject(""); void refresh(); } });
  const canSend = connected && !!address && windowOpen;

  const days = useMemo(() => {
    const out: { day: string; rows: ChatMessage[] }[] = [];
    for (const m of shown) {
      const d = isoDay(new Date(m.at));
      const last = out[out.length - 1];
      if (last?.day === d) last.rows.push(m);
      else out.push({ day: d, rows: [m] });
    }
    return out;
  }, [shown]);
  const today = isoDay(new Date());

  return (
    <div className="flex h-full min-h-[420px] flex-col">
      <div role="tablist" aria-label="Channel" className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-ink-100 p-1 text-sm font-medium">
        {([["WHATSAPP", "WhatsApp", MessageCircle, channels.whatsapp], ["EMAIL", "Email", Mail, channels.email]] as const).map(([k, label, Icon, on]) => (
          <button key={k} role="tab" aria-selected={channel === k} onClick={() => setChannel(k)} className={cn("flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 transition", channel === k ? "bg-white text-ink-900 shadow-sm" : "text-ink-600 hover:text-ink-900")}>
            <Icon className="h-4 w-4" /> {label}
            <span className={cn("h-2 w-2 rounded-full", on ? "bg-emerald-500" : "bg-ink-300")} title={on ? "Connected" : "Not connected"} />
          </button>
        ))}
      </div>

      {!connected && (
        <div role="note" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
          <p className="font-semibold">{channel === "WHATSAPP" ? "WhatsApp" : "Email"} isn&apos;t connected to the CRM yet.</p>
          <p className="mt-0.5">
            Messages can&apos;t be sent from here until an administrator adds the {channel === "WHATSAPP" ? "WhatsApp Business" : "SMTP"} credentials. Until then, {channel === "WHATSAPP" ? "open the chat on WhatsApp" : "write the email in your mail app"} and <b>log</b> it below so the history stays on the contact.
          </p>
        </div>
      )}

      <div className="scrollbar-thin min-h-[200px] flex-1 space-y-4 overflow-y-auto rounded-lg bg-ink-50 p-3" aria-live="polite" aria-label={`${channel === "WHATSAPP" ? "WhatsApp" : "Email"} conversation`}>
        {shown.length === 0 && (
          <p className="py-10 text-center text-sm text-ink-400">No {channel === "WHATSAPP" ? "WhatsApp messages" : "emails"} yet.{connected && address ? " Start the conversation below." : ""}</p>
        )}
        {days.map((d) => (
          <div key={d.day} className="space-y-2">
            <p className="text-center text-[11px] font-semibold tracking-wide text-ink-400 uppercase">{d.day === today ? "Today" : fmtDate(d.rows[0]!.at)}</p>
            {d.rows.map((m) => <Bubble key={m.id} m={m} />)}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="mt-3 space-y-2">
        {channel === "WHATSAPP" && connected && address && !windowOpen && (
          <p className="flex items-start gap-2 rounded-lg bg-ink-100 px-3 py-2 text-[13px] text-ink-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>WhatsApp only allows free-text messages within 24 hours of the customer&apos;s last message. {lastInbound ? "That window has closed." : "They haven't messaged you yet."} Use <b>Open WhatsApp</b> to contact them from your phone, then log it.</span>
          </p>
        )}
        {!address && <p className="rounded-lg bg-ink-100 px-3 py-2 text-[13px] text-ink-600">This contact has no {channel === "WHATSAPP" ? "phone number" : "email address"} on file.</p>}

        {canSend && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              send.run({ contactId, leadId, channel, body, subject: channel === "EMAIL" ? subject : null });
            }}
          >
            {channel === "EMAIL" && <Input aria-label="Email subject" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />}
            <div className="flex items-end gap-2">
              <Textarea
                aria-label="Message"
                rows={channel === "EMAIL" ? 4 : 2}
                placeholder={channel === "WHATSAPP" ? "Type a WhatsApp message…" : "Write your email…"}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && body.trim()) { e.preventDefault(); send.run({ contactId, leadId, channel, body, subject: channel === "EMAIL" ? subject : null }); } }}
              />
              <Button type="submit" size="icon" loading={send.pending} disabled={!body.trim() || (channel === "EMAIL" && !subject.trim())} aria-label="Send message"><Send className="h-4 w-4" /></Button>
            </div>
            <p className="text-[11px] text-ink-400">Ctrl + Enter to send</p>
          </form>
        )}

        <div className="flex flex-wrap gap-2">
          {channel === "WHATSAPP" && phoneDigits && (
            <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noreferrer noopener" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 text-[13px] font-medium text-ink-700 hover:bg-ink-50">
              <ExternalLink className="h-3.5 w-3.5" /> Open WhatsApp
            </a>
          )}
          {channel === "EMAIL" && email && (
            <a href={`mailto:${email}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 text-[13px] font-medium text-ink-700 hover:bg-ink-50">
              <ExternalLink className="h-3.5 w-3.5" /> Open mail app
            </a>
          )}
          <Button size="xs" variant={connected ? "secondary" : "primary"} onClick={() => setShowLog((s) => !s)} aria-expanded={showLog}>
            <ClipboardPen className="h-3.5 w-3.5" /> Log a conversation
          </Button>
        </div>

        {showLog && <LogForm key={channel} contactId={contactId} leadId={leadId} channel={channel} onDone={() => { setShowLog(false); void refresh(); }} />}
      </div>
    </div>
  );
}

function Bubble({ m }: { m: ChatMessage }) {
  const out = m.direction === "OUTBOUND";
  const logged = m.status === "LOGGED";
  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm", out ? "rounded-br-md bg-brand-500 text-white" : "rounded-bl-md bg-white text-ink-800 ring-1 ring-ink-200", m.status === "FAILED" && "bg-red-50 text-red-900 ring-1 ring-red-200")}>
        {m.subject && <p className={cn("mb-0.5 text-[13px] font-semibold", out && m.status !== "FAILED" ? "text-white" : "text-ink-900")}>{m.subject}</p>}
        <p className="break-words whitespace-pre-wrap">{m.body}</p>
        <p className={cn("mt-1 flex flex-wrap items-center justify-end gap-x-1.5 text-[11px]", out && m.status !== "FAILED" ? "text-white/80" : "text-ink-400")}>
          {logged && <span className={cn("rounded px-1 font-semibold", out ? "bg-white/20" : "bg-ink-100 text-ink-600")}>Logged manually</span>}
          {m.by && out && <span>{m.by}</span>}
          <span>{fmtTime(m.at)}</span>
          {out && !logged && <StatusTick status={m.status} />}
        </p>
        {m.status === "FAILED" && <p className="mt-1 text-[12px] font-medium">Not sent: {m.error ?? "the provider rejected the message."}</p>}
      </div>
    </div>
  );
}

function StatusTick({ status }: { status: string }) {
  if (status === "QUEUED") return <span>Sending…</span>;
  if (status === "SENT") return <span className="inline-flex items-center gap-0.5"><Check className="h-3 w-3" /> Sent</span>;
  if (status === "DELIVERED") return <span className="inline-flex items-center gap-0.5"><CheckCheck className="h-3 w-3" /> Delivered</span>;
  if (status === "READ") return <span className="inline-flex items-center gap-0.5 font-semibold"><CheckCheck className="h-3 w-3" /> Read</span>;
  return null;
}

function LogForm({ contactId, leadId, channel, onDone }: { contactId: string; leadId: string | null; channel: Channel; onDone: () => void }) {
  const [direction, setDirection] = useState<"OUTBOUND" | "INBOUND">("OUTBOUND");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const { run, pending, error, fieldErrors } = useAction(logMessageAction, { refresh: false, onSuccess: () => { setBody(""); setSubject(""); onDone(); } });
  return (
    <form
      className="space-y-2 rounded-lg border border-ink-200 bg-white p-3"
      onSubmit={(e) => { e.preventDefault(); run({ contactId, leadId, channel, direction, body, subject: channel === "EMAIL" ? subject : null }); }}
    >
      <p className="text-[13px] font-semibold text-ink-800">Log a {channel === "WHATSAPP" ? "WhatsApp" : "email"} conversation</p>
      <p className="text-xs text-ink-500">Saved on the contact as <b>logged manually</b> — it is not sent from here.</p>
      <Field label="Who wrote it?">
        {(p) => (
          <Select {...p} value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}>
            <option value="OUTBOUND">We sent it to the customer</option>
            <option value="INBOUND">The customer sent it to us</option>
          </Select>
        )}
      </Field>
      {channel === "EMAIL" && <Field label="Subject" error={fieldErrors.subject}>{(p) => <Input {...p} value={subject} onChange={(e) => setSubject(e.target.value)} />}</Field>}
      <Field label="Message">{(p) => <Textarea {...p} rows={3} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
      <FormError error={error} />
      <Button type="submit" size="sm" loading={pending} disabled={!body.trim()}>Save to contact</Button>
    </form>
  );
}
