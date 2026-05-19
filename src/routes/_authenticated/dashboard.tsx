import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { dashboardStats } from "@/lib/leads.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Users, TrendingUp, CalendarClock, Radar,
  Trophy, Building2, ArrowRight, Loader2,
} from "lucide-react";
import { formatCnpj } from "@/lib/cnpj-utils";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: DashboardPage });

const STATUS_LABEL: Record<string, string> = {
  novo: "Novo", contato: "Contato", qualificado: "Qualificado",
  proposta: "Proposta", negociacao: "Negociação", ganho: "Ganho", perdido: "Perdido",
};
const STATUS_COLOR: Record<string, string> = {
  novo: "bg-primary/60", contato: "bg-accent/60", qualificado: "bg-warning/60",
  proposta: "bg-warning/80", negociacao: "bg-warning", ganho: "bg-success", perdido: "bg-destructive/70",
};

function DashboardPage() {
  const fn = useServerFn(dashboardStats);
  const { data, isLoading } = useQuery({ queryKey: ["dashboard-stats"], queryFn: () => fn() });

  if (isLoading) return (
    <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
  );
  const s = data!;
  const maxStatus = Math.max(1, ...s.byStatus.map((x) => x.total));

  const kpis = [
    { label: "Total de leads", value: s.totalLeads, icon: Users, color: "text-primary" },
    { label: "Novos esta semana", value: s.novosSemana, icon: TrendingUp, color: "text-accent" },
    { label: "Taxa de conversão", value: `${s.conversao}%`, icon: Trophy, color: "text-success" },
    { label: "Follow-ups hoje", value: s.followupsHojeCount, icon: CalendarClock, color: "text-warning" },
  ];

  return (
    <div className="min-h-screen">
      <div className="bg-radar-grad border-b border-border">
        <div className="px-6 py-6 max-w-[1600px] mx-auto">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm text-primary mb-1">
                <LayoutDashboard className="h-4 w-4" /> Visão Geral
              </div>
              <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-1">Pulse do seu pipeline comercial em tempo real.</p>
            </div>
            <Button asChild><Link to="/radar"><Radar className="h-4 w-4 mr-2" /> Prospectar agora</Link></Button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
            {kpis.map((k) => (
              <Card key={k.label} className="p-4 bg-card/60 backdrop-blur">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">{k.label}</div>
                  <k.icon className={cn("h-4 w-4", k.color)} />
                </div>
                <div className="text-3xl font-bold mt-2 tabular-nums">{k.value}</div>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <div className="px-6 py-6 max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Funil por status */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">Leads por status</h2>
              <p className="text-xs text-muted-foreground">Distribuição do seu funil</p>
            </div>
            <Button asChild size="sm" variant="ghost"><Link to="/funil">Abrir Kanban <ArrowRight className="h-3 w-3 ml-1" /></Link></Button>
          </div>
          <div className="space-y-2">
            {s.byStatus.map((row) => (
              <div key={row.status} className="flex items-center gap-3">
                <div className="w-28 text-xs text-muted-foreground">{STATUS_LABEL[row.status]}</div>
                <div className="flex-1 h-2.5 rounded-full bg-surface overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", STATUS_COLOR[row.status])}
                    style={{ width: `${(row.total / maxStatus) * 100}%` }} />
                </div>
                <div className="w-10 text-right text-sm font-semibold tabular-nums">{row.total}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Top segmentos */}
        <Card className="p-5">
          <h2 className="font-semibold mb-1">Top segmentos</h2>
          <p className="text-xs text-muted-foreground mb-4">Onde sua carteira concentra</p>
          {s.topSegmentos.length === 0 && (
            <p className="text-xs text-muted-foreground py-6 text-center">Sem dados ainda. Salve leads no Radar.</p>
          )}
          <ul className="space-y-2.5">
            {s.topSegmentos.map((seg, i) => (
              <li key={seg.nome} className="flex items-center gap-3 text-sm">
                <div className="h-7 w-7 rounded-md bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">{i + 1}</div>
                <span className="flex-1 truncate">{seg.nome}</span>
                <Badge variant="outline">{seg.total}</Badge>
              </li>
            ))}
          </ul>
        </Card>

        {/* Follow-ups hoje */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">Follow-ups de hoje</h2>
              <p className="text-xs text-muted-foreground">Quem você prometeu retornar</p>
            </div>
            <CalendarClock className="h-4 w-4 text-warning" />
          </div>
          {s.followupsHoje.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Nenhum follow-up agendado para hoje.</p>
          ) : (
            <ul className="divide-y divide-border">
              {s.followupsHoje.map((f) => {
                const c = f.company as { nome_fantasia?: string; razao_social?: string; cnpj?: string } | null;
                return (
                  <li key={f.id} className="py-2.5 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-md bg-warning/15 flex items-center justify-center">
                      <Building2 className="h-4 w-4 text-warning" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{c?.nome_fantasia || c?.razao_social || "—"}</div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">{c?.cnpj && formatCnpj(c.cnpj)}</div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {f.proximo_followup ? new Date(f.proximo_followup).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Últimas empresas no radar */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Últimas no radar</h2>
            <Button asChild size="sm" variant="ghost"><Link to="/radar"><Radar className="h-3 w-3" /></Link></Button>
          </div>
          {s.recentCompanies.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Consulte CNPJs no Radar para começar.</p>
          ) : (
            <ul className="space-y-2.5">
              {s.recentCompanies.map((c) => (
                <li key={c.id} className="flex items-center gap-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate text-xs">{c.nome_fantasia || c.razao_social}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{c.cidade}{c.uf && `/${c.uf}`}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px] tabular-nums">{c.score}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
