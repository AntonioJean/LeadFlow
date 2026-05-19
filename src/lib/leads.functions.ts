import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LEAD_STATUSES = ["novo", "contato", "qualificado", "proposta", "negociacao", "ganho", "perdido"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

const SaveSchema = z.object({
  companyId: z.string().uuid(),
  notas: z.string().max(2000).optional(),
});

export const saveCompanyAsLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("leads")
      .select("id")
      .eq("owner_id", userId)
      .eq("company_id", data.companyId)
      .maybeSingle();
    if (existing) return { id: existing.id, created: false };

    const { data: inserted, error } = await supabase
      .from("leads")
      .insert({
        owner_id: userId,
        company_id: data.companyId,
        notas: data.notas ?? null,
        status: "novo",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id, created: true };
  });

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("leads")
      .select("*, company:companies(*)")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { leads: data ?? [] };
  });

const UpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(LEAD_STATUSES).optional(),
  notas: z.string().max(2000).nullable().optional(),
  proximo_followup: z.string().nullable().optional(),
});

export const updateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: Record<string, unknown> = {};
    if (data.status) patch.status = data.status;
    if (data.notas !== undefined) patch.notas = data.notas;
    if (data.proximo_followup !== undefined) patch.proximo_followup = data.proximo_followup;
    const { error } = await supabase
      .from("leads")
      .update(patch as never)
      .eq("id", data.id)
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const DeleteSchema = z.object({ id: z.string().uuid() });
export const deleteLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeleteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("leads").delete().eq("id", data.id).eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ----------------------------------------------------- dashboardStats
export const dashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const [allLeads, weekLeads, followups, recentCompanies] = await Promise.all([
      supabase.from("leads").select("status, company:companies(segmento)").eq("owner_id", userId),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("owner_id", userId).gte("created_at", weekAgo),
      supabase.from("leads")
        .select("id, proximo_followup, company:companies(nome_fantasia, razao_social, cnpj)")
        .eq("owner_id", userId)
        .gte("proximo_followup", todayStart.toISOString())
        .lte("proximo_followup", todayEnd.toISOString())
        .order("proximo_followup", { ascending: true }),
      supabase.from("companies").select("id, nome_fantasia, razao_social, cidade, uf, score, created_at")
        .order("created_at", { ascending: false }).limit(5),
    ]);

    const leads = allLeads.data ?? [];
    const byStatus: Record<string, number> = {};
    for (const s of LEAD_STATUSES) byStatus[s] = 0;
    const segCount: Record<string, number> = {};
    for (const l of leads) {
      byStatus[l.status as string] = (byStatus[l.status as string] ?? 0) + 1;
      const seg = (l.company as { segmento?: string } | null)?.segmento;
      if (seg) segCount[seg] = (segCount[seg] ?? 0) + 1;
    }
    const total = leads.length;
    const ganhos = byStatus["ganho"] ?? 0;
    const closed = ganhos + (byStatus["perdido"] ?? 0);
    const conversao = closed > 0 ? Math.round((ganhos / closed) * 100) : 0;
    const topSegmentos = Object.entries(segCount)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([nome, total]) => ({ nome, total }));

    return {
      totalLeads: total,
      novosSemana: weekLeads.count ?? 0,
      conversao,
      followupsHoje: followups.data ?? [],
      followupsHojeCount: (followups.data ?? []).length,
      byStatus: LEAD_STATUSES.map((s) => ({ status: s, total: byStatus[s] ?? 0 })),
      topSegmentos,
      recentCompanies: recentCompanies.data ?? [],
    };
  });

// ----------------------------------------------------- leadsByStatus (for Kanban)
export const leadsByStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("leads")
      .select("id, status, notas, proximo_followup, created_at, company:companies(id, cnpj, nome_fantasia, razao_social, cidade, uf, segmento, score, telefone)")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const grouped: Record<LeadStatus, typeof data> = {
      novo: [], contato: [], qualificado: [], proposta: [], negociacao: [], ganho: [], perdido: [],
    };
    for (const l of data ?? []) {
      const s = l.status as LeadStatus;
      if (grouped[s]) grouped[s].push(l);
    }
    return { grouped, total: data?.length ?? 0 };
  });
