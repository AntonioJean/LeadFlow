import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent, useDroppable, useDraggable,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { KanbanSquare, Loader2, Building2, MapPin, Target, Radar } from "lucide-react";
import { leadsByStatus, updateLead, type LeadStatus } from "@/lib/leads.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/funil")({ component: FunilPage });

const COLUMNS: { id: LeadStatus; label: string; tint: string }[] = [
  { id: "novo", label: "Novo", tint: "bg-primary/10 border-primary/30" },
  { id: "contato", label: "Contato", tint: "bg-accent/10 border-accent/30" },
  { id: "qualificado", label: "Qualificado", tint: "bg-warning/5 border-warning/20" },
  { id: "proposta", label: "Proposta", tint: "bg-warning/10 border-warning/30" },
  { id: "negociacao", label: "Negociação", tint: "bg-warning/15 border-warning/40" },
  { id: "ganho", label: "Ganho", tint: "bg-success/10 border-success/40" },
  { id: "perdido", label: "Perdido", tint: "bg-destructive/10 border-destructive/30" },
];

type Lead = {
  id: string; status: string; notas: string | null; proximo_followup: string | null;
  company: { id: string; nome_fantasia: string | null; razao_social: string | null;
    cidade: string | null; uf: string | null; segmento: string | null; score: number;
    telefone: string | null; cnpj: string; } | null;
};

function FunilPage() {
  const qc = useQueryClient();
  const fn = useServerFn(leadsByStatus);
  const upd = useServerFn(updateLead);
  const { data, isLoading } = useQuery({ queryKey: ["leads-kanban"], queryFn: () => fn() });
  const [activeId, setActiveId] = useState<string | null>(null);

  const updateMut = useMutation({
    mutationFn: async (vars: { id: string; status: LeadStatus }) => upd({ data: vars }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["leads-kanban"] });
      const prev = qc.getQueryData<{ grouped: Record<LeadStatus, Lead[]>; total: number }>(["leads-kanban"]);
      if (prev) {
        const grouped = { ...prev.grouped };
        let moved: Lead | undefined;
        for (const s of Object.keys(grouped) as LeadStatus[]) {
          const idx = grouped[s].findIndex((l) => l.id === vars.id);
          if (idx >= 0) { moved = grouped[s][idx]; grouped[s] = grouped[s].filter((l) => l.id !== vars.id); break; }
        }
        if (moved) grouped[vars.status] = [{ ...moved, status: vars.status }, ...grouped[vars.status]];
        qc.setQueryData(["leads-kanban"], { ...prev, grouped });
      }
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["leads-kanban"], ctx.prev);
      toast.error(e.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const grouped = data?.grouped;
  const activeLead = useMemo(() => {
    if (!activeId || !grouped) return null;
    for (const s of Object.keys(grouped) as LeadStatus[]) {
      const f = grouped[s].find((l) => l.id === activeId);
      if (f) return f;
    }
    return null;
  }, [activeId, grouped]);

  function handleDragStart(e: DragStartEvent) { setActiveId(String(e.active.id)); }
  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const overId = e.over?.id;
    if (!overId) return;
    const status = String(overId) as LeadStatus;
    const id = String(e.active.id);
    if (!grouped) return;
    const currentStatus = (Object.keys(grouped) as LeadStatus[]).find((s) => grouped[s].some((l) => l.id === id));
    if (currentStatus === status) return;
    updateMut.mutate({ id, status });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="px-6 py-6 border-b border-border">
        <div className="max-w-[1600px] mx-auto flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-primary mb-1">
              <KanbanSquare className="h-4 w-4" /> Funil Comercial
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Funil de Vendas</h1>
            <p className="text-sm text-muted-foreground mt-1">Arraste leads entre colunas para atualizar o status.</p>
          </div>
          <Button asChild variant="outline"><Link to="/radar"><Radar className="h-4 w-4 mr-2" /> Buscar novos</Link></Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="flex-1 overflow-x-auto p-4">
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex gap-3 min-w-max pb-4">
              {COLUMNS.map((col) => (
                <Column key={col.id} {...col} leads={grouped?.[col.id] ?? []} />
              ))}
            </div>
            <DragOverlay>
              {activeLead && <LeadCard lead={activeLead} dragging />}
            </DragOverlay>
          </DndContext>
        </div>
      )}
    </div>
  );
}

function Column({ id, label, tint, leads }: { id: LeadStatus; label: string; tint: string; leads: Lead[] }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const total = leads.length;
  return (
    <div ref={setNodeRef} className={cn(
      "w-72 shrink-0 rounded-xl border p-3 flex flex-col transition-colors",
      tint, isOver && "ring-2 ring-primary/60",
    )}>
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="font-semibold text-sm">{label}</div>
        <Badge variant="outline" className="tabular-nums">{total}</Badge>
      </div>
      <div className="flex-1 space-y-2 min-h-[200px]">
        {leads.length === 0 && (
          <div className="text-[11px] text-muted-foreground text-center py-8 border border-dashed border-border rounded-lg">
            Solte leads aqui
          </div>
        )}
        {leads.map((l) => <LeadCard key={l.id} lead={l} />)}
      </div>
    </div>
  );
}

function LeadCard({ lead, dragging }: { lead: Lead; dragging?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  const c = lead.company;
  return (
    <Card
      ref={setNodeRef} {...listeners} {...attributes}
      className={cn(
        "p-3 cursor-grab active:cursor-grabbing transition-all",
        (isDragging || dragging) && "opacity-50 ring-1 ring-primary/60 shadow-lg",
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="text-sm font-semibold truncate flex-1">
          {c?.nome_fantasia || c?.razao_social || "Sem nome"}
        </div>
        <Badge variant="outline" className="text-[10px] tabular-nums shrink-0">{c?.score ?? 0}</Badge>
      </div>
      <div className="space-y-1 text-[11px] text-muted-foreground">
        {c?.segmento && <div className="flex items-center gap-1.5"><Target className="h-3 w-3" />{c.segmento}</div>}
        {c?.cidade && <div className="flex items-center gap-1.5"><MapPin className="h-3 w-3" />{c.cidade}/{c.uf}</div>}
        {!c && <div className="flex items-center gap-1.5"><Building2 className="h-3 w-3" />Empresa removida</div>}
      </div>
      {lead.proximo_followup && (
        <div className="mt-2 pt-2 border-t border-border text-[10px] text-warning">
          Follow-up: {new Date(lead.proximo_followup).toLocaleDateString("pt-BR")}
        </div>
      )}
    </Card>
  );
}
