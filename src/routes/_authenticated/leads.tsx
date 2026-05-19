import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listLeads } from "@/lib/leads.functions";
import { formatCnpj, formatPhone } from "@/lib/cnpj-utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Radar, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/leads")({ component: LeadsPage });

function LeadsPage() {
  const fn = useServerFn(listLeads);
  const { data, isLoading } = useQuery({ queryKey: ["leads"], queryFn: () => fn() });
  const leads = data?.leads ?? [];

  return (
    <div className="px-6 py-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-primary mb-1">
            <Users className="h-4 w-4" /> Pipeline
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">Empresas que você salvou do Radar.</p>
        </div>
        <Button asChild><Link to="/radar"><Radar className="h-4 w-4 mr-2" /> Ir ao Radar</Link></Button>
      </div>

      {isLoading && <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
      {!isLoading && leads.length === 0 && (
        <Card className="p-12 text-center">
          <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h2 className="font-semibold">Nenhum lead ainda</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Encontre empresas no Radar e salve-as como leads.</p>
          <Button asChild><Link to="/radar">Abrir Radar</Link></Button>
        </Card>
      )}
      {!isLoading && leads.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5">Empresa</th>
                <th className="text-left px-4 py-2.5">CNPJ</th>
                <th className="text-left px-4 py-2.5">Cidade</th>
                <th className="text-left px-4 py-2.5">Telefone</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-right px-4 py-2.5">Score</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l: any) => (
                <tr key={l.id} className="border-t border-border hover:bg-surface/50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{l.company?.nome_fantasia || l.company?.razao_social}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-xs">{l.company?.segmento}</div>
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums">{l.company?.cnpj && formatCnpj(l.company.cnpj)}</td>
                  <td className="px-4 py-3 text-xs">{l.company?.cidade ? `${l.company.cidade}/${l.company.uf}` : "—"}</td>
                  <td className="px-4 py-3 text-xs">{formatPhone(l.company?.telefone) || "—"}</td>
                  <td className="px-4 py-3"><Badge variant="outline" className="capitalize">{l.status}</Badge></td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">{l.company?.score ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
