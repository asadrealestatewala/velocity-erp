"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { AlarmClock, Building2, GripVertical, User } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn, fmtMoney, fmtRelative, fullName } from "@/lib/utils";
import { changeStageAction } from "@/server/actions/leads";
import { StageOutcomeDialog, type Stage } from "./lead-dialogs";
import type { BoardColumn } from "@/server/queries/pipeline";

type Card = BoardColumn["leads"][number];

export function PipelineBoard({
  columns: initial,
  base,
  canMove,
  lossReasons,
  models,
}: {
  columns: BoardColumn[];
  base: string;
  canMove: boolean;
  lossReasons: { id: string; name: string }[];
  models: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [columns, setColumns] = useState(initial);
  const [active, setActive] = useState<Card | null>(null);
  const [pending, setPending] = useState<{ lead: Card; to: Stage } | null>(null);
  useEffect(() => setColumns(initial), [initial]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  const move = (leadId: string, toStageId: string) => {
    setColumns((cols) => {
      const lead = cols.flatMap((c) => c.leads).find((l) => l.id === leadId);
      if (!lead) return cols;
      return cols.map((c) =>
        c.stage.id === toStageId
          ? { ...c, count: c.count + 1, leads: [lead, ...c.leads] }
          : c.leads.some((l) => l.id === leadId)
            ? { ...c, count: c.count - 1, leads: c.leads.filter((l) => l.id !== leadId) }
            : c,
      );
    });
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setActive(null);
    const leadId = String(e.active.id);
    const to = e.over ? String(e.over.id) : null;
    if (!to) return;
    const from = columns.find((c) => c.leads.some((l) => l.id === leadId));
    if (!from || from.stage.id === to) return;
    const target = columns.find((c) => c.stage.id === to)!.stage as Stage;
    const lead = from.leads.find((l) => l.id === leadId)!;
    if (target.kind !== "OPEN") {
      setPending({ lead, to: target });
      return;
    }
    const snapshot = columns;
    move(leadId, to); // optimistic
    const res = await changeStageAction({ leadId, stageId: to });
    if (!res.ok) {
      setColumns(snapshot);
      toast.error(res.error);
    } else {
      toast.success(`Moved to ${target.name}`);
      router.refresh();
    }
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setActive(columns.flatMap((c) => c.leads).find((l) => l.id === e.active.id) ?? null)}
      onDragCancel={() => setActive(null)}
      onDragEnd={onDragEnd}
    >
      <div className="scrollbar-thin -mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex min-h-[60dvh] gap-3">
          {columns.map((col) => (
            <Column key={col.stage.id} col={col} base={base} canMove={canMove} />
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>{active ? <LeadCard lead={active} base={base} overlay /> : null}</DragOverlay>
      <StageOutcomeDialog
        leadId={pending?.lead.id ?? null}
        target={pending?.to ?? null}
        onClose={() => setPending(null)}
        onDone={() => router.refresh()}
        lossReasons={lossReasons}
        models={models}
      />
    </DndContext>
  );
}

function Column({ col, base, canMove }: { col: BoardColumn; base: string; canMove: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.stage.id, disabled: !canMove });
  const total = col.leads.reduce((a, l) => a + (l.conversionValue ?? 0), 0);
  return (
    <section
      ref={setNodeRef}
      aria-label={`${col.stage.name}: ${col.count} leads`}
      className={cn("flex w-[280px] shrink-0 flex-col rounded-2xl border bg-ink-100/60 transition-colors", isOver ? "border-brand-400 bg-brand-50" : "border-transparent")}
    >
      <header className="sticky top-0 flex items-center gap-2 px-3 pt-3 pb-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: col.stage.color }} />
        <h2 className="truncate text-sm font-semibold text-ink-900">{col.stage.name}</h2>
        <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-ink-600 tabular-nums">{col.count}</span>
      </header>
      {col.stage.kind === "WON" && total > 0 && <p className="px-3 pb-1 text-xs text-emerald-700">{fmtMoney(total)} recognised</p>}
      {col.stage.kind !== "OPEN" && <p className="px-3 pb-1 text-[11px] text-ink-400">Closed in the last 30 days</p>}
      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-3">
        {col.leads.map((l) => (
          <Draggable key={l.id} lead={l} base={base} canMove={canMove} />
        ))}
        {col.count > col.leads.length && <p className="py-2 text-center text-xs text-ink-400">+{col.count - col.leads.length} more — refine filters or use table view</p>}
        {col.count === 0 && <p className="rounded-xl border border-dashed border-ink-300 py-6 text-center text-xs text-ink-400">Drop leads here</p>}
      </div>
    </section>
  );
}

function Draggable({ lead, base, canMove }: { lead: Card; base: string; canMove: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id, disabled: !canMove });
  return (
    <div ref={setNodeRef} className={cn(isDragging && "opacity-30")}>
      <LeadCard lead={lead} base={base} handle={canMove ? { ...attributes, ...listeners } : undefined} />
    </div>
  );
}

function LeadCard({ lead, base, overlay, handle }: { lead: Card; base: string; overlay?: boolean; handle?: Record<string, unknown> }) {
  const overdue = lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < new Date();
  return (
    <article className={cn("group rounded-xl border border-ink-200/80 bg-white p-3 shadow-[var(--shadow-card)]", overlay && "rotate-2 shadow-[var(--shadow-pop)]")}>
      <div className="flex items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <Link href={`${base}/contacts/${lead.contact.id}?lead=${lead.id}`} className="link block truncate text-sm">{fullName(lead.contact)}</Link>
          <p className="truncate text-xs text-ink-500">#{lead.number} · {lead.interestedModel?.name ?? "No model"} · {lead.source?.name ?? "—"}</p>
        </div>
        {handle && (
          <button {...handle} className="cursor-grab touch-none rounded p-0.5 text-ink-300 hover:bg-ink-100 hover:text-ink-600 active:cursor-grabbing" aria-label={`Move ${fullName(lead.contact)} to another stage`}>
            <GripVertical className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="mt-2 space-y-1 text-xs text-ink-500">
        <p className="flex items-center gap-1.5 truncate"><Building2 className="h-3.5 w-3.5 shrink-0" />{lead.dealership?.name ?? <span className="text-red-600">Unassigned</span>}</p>
        {lead.assignedUser && <p className="flex items-center gap-1.5 truncate"><User className="h-3.5 w-3.5 shrink-0" />{lead.assignedUser.name}</p>}
        {lead.nextFollowUpAt && (
          <p suppressHydrationWarning className={cn("flex items-center gap-1.5", overdue && "font-semibold text-red-600")}><AlarmClock className="h-3.5 w-3.5" />{overdue ? "Overdue " : "Follow-up "}{fmtRelative(lead.nextFollowUpAt)}</p>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", lead.origin === "COMPANY" ? "bg-blue-50 text-blue-700" : "bg-brand-50 text-brand-700")}>
          {lead.origin === "COMPANY" ? "Company" : "Walk-in"}
        </span>
        <span suppressHydrationWarning className="text-[11px] text-ink-400">in stage {fmtRelative(lead.stageChangedAt)}</span>
      </div>
    </article>
  );
}
