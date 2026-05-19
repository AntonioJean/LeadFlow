import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  computeScore,
  isValidCnpj,
  onlyDigits,
  segmentFromCnae,
} from "./cnpj-utils";

const BRASILAPI = "https://brasilapi.com.br/api/cnpj/v1";
const CACHE_DAYS = 30;

interface BrasilApiCnpj {
  cnpj: string;
  razao_social?: string;
  nome_fantasia?: string;
  cnae_fiscal?: number | string;
  cnae_fiscal_descricao?: string;
  porte?: string;
  descricao_porte?: string;
  situacao_cadastral?: number | string;
  descricao_situacao_cadastral?: string;
  data_situacao_cadastral?: string;
  data_inicio_atividade?: string;
  ddd_telefone_1?: string;
  email?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cep?: string;
  municipio?: string;
  uf?: string;
  capital_social?: number;
}

function mapBrasilApi(raw: BrasilApiCnpj) {
  const cnae = raw.cnae_fiscal ? String(raw.cnae_fiscal) : null;
  const situacao = raw.descricao_situacao_cadastral || (String(raw.situacao_cadastral || "") === "2" ? "ATIVA" : null);
  const porte = raw.descricao_porte || raw.porte || null;
  const segmento = segmentFromCnae(cnae);
  const row = {
    cnpj: onlyDigits(raw.cnpj),
    razao_social: raw.razao_social ?? null,
    nome_fantasia: raw.nome_fantasia ?? null,
    cnae_principal: cnae,
    cnae_descricao: raw.cnae_fiscal_descricao ?? null,
    segmento,
    porte,
    situacao_cadastral: situacao,
    data_situacao: raw.data_situacao_cadastral ?? null,
    data_abertura: raw.data_inicio_atividade ?? null,
    telefone: raw.ddd_telefone_1 ?? null,
    email: raw.email ?? null,
    logradouro: raw.logradouro ?? null,
    numero: raw.numero ?? null,
    complemento: raw.complemento ?? null,
    bairro: raw.bairro ?? null,
    cep: raw.cep ?? null,
    cidade: raw.municipio ?? null,
    uf: raw.uf ?? null,
    capital_social: raw.capital_social ?? null,
    fonte: "brasilapi",
    raw: raw as unknown as never,
  };
  const score = computeScore(row);
  return { ...row, score };
}

async function fetchBrasilApi(cnpj: string): Promise<BrasilApiCnpj> {
  const r = await fetch(`${BRASILAPI}/${cnpj}`, {
    headers: { Accept: "application/json", "User-Agent": "LeadFlow/1.0" },
  });
  if (r.status === 404) throw new Error("not_found");
  if (!r.ok) throw new Error(`brasilapi_${r.status}`);
  return (await r.json()) as BrasilApiCnpj;
}

// CNPJ.ws — https://publica.cnpj.ws/cnpj/{cnpj}
async function fetchCnpjWs(cnpj: string): Promise<BrasilApiCnpj> {
  const r = await fetch(`https://publica.cnpj.ws/cnpj/${cnpj}`, {
    headers: { Accept: "application/json", "User-Agent": "LeadFlow/1.0" },
  });
  if (r.status === 404) throw new Error("not_found");
  if (!r.ok) throw new Error(`cnpjws_${r.status}`);
  const j: any = await r.json();
  const est = j.estabelecimento ?? {};
  const atividade = est.atividade_principal ?? {};
  const tel = est.ddd1 && est.telefone1 ? `${est.ddd1}${est.telefone1}` : undefined;
  return {
    cnpj: est.cnpj ?? cnpj,
    razao_social: j.razao_social,
    nome_fantasia: est.nome_fantasia,
    cnae_fiscal: atividade.id ?? atividade.subclasse,
    cnae_fiscal_descricao: atividade.descricao,
    porte: j.porte?.descricao,
    descricao_porte: j.porte?.descricao,
    descricao_situacao_cadastral: est.situacao_cadastral,
    data_situacao_cadastral: est.data_situacao_cadastral,
    data_inicio_atividade: est.data_inicio_atividade,
    ddd_telefone_1: tel,
    email: est.email,
    logradouro: est.logradouro,
    numero: est.numero,
    complemento: est.complemento,
    bairro: est.bairro,
    cep: est.cep,
    municipio: est.cidade?.nome,
    uf: est.estado?.sigla,
    capital_social: j.capital_social ? Number(j.capital_social) : undefined,
  };
}

// ReceitaWS — https://receitaws.com.br/v1/cnpj/{cnpj}
async function fetchReceitaWs(cnpj: string): Promise<BrasilApiCnpj> {
  const r = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpj}`, {
    headers: { Accept: "application/json", "User-Agent": "LeadFlow/1.0" },
  });
  if (!r.ok) throw new Error(`receitaws_${r.status}`);
  const j: any = await r.json();
  if (j.status === "ERROR") throw new Error(j.message || "receitaws_error");
  const atividade = (j.atividade_principal && j.atividade_principal[0]) || {};
  const cnae = atividade.code ? onlyDigits(atividade.code) : undefined;
  return {
    cnpj: onlyDigits(j.cnpj ?? cnpj),
    razao_social: j.nome,
    nome_fantasia: j.fantasia,
    cnae_fiscal: cnae,
    cnae_fiscal_descricao: atividade.text,
    porte: j.porte,
    descricao_porte: j.porte,
    descricao_situacao_cadastral: j.situacao,
    data_situacao_cadastral: j.data_situacao,
    data_inicio_atividade: j.abertura,
    ddd_telefone_1: j.telefone,
    email: j.email,
    logradouro: j.logradouro,
    numero: j.numero,
    complemento: j.complemento,
    bairro: j.bairro,
    cep: j.cep,
    municipio: j.municipio,
    uf: j.uf,
    capital_social: j.capital_social ? Number(j.capital_social) : undefined,
  };
}

async function fetchCnpjCascade(cnpj: string): Promise<{ data: BrasilApiCnpj; fonte: string }> {
  const providers: Array<{ name: string; fn: (c: string) => Promise<BrasilApiCnpj> }> = [
    { name: "brasilapi", fn: fetchBrasilApi },
    { name: "cnpjws", fn: fetchCnpjWs },
    { name: "receitaws", fn: fetchReceitaWs },
  ];
  const errors: string[] = [];
  for (const p of providers) {
    try {
      const data = await p.fn(cnpj);
      return { data, fonte: p.name };
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      if (msg === "not_found") errors.push(`${p.name}: não encontrado`);
      else errors.push(`${p.name}: ${msg}`);
    }
  }
  throw new Error(`Não foi possível consultar o CNPJ. ${errors.join(" | ")}`);
}

// ---------------------------------------------------------------- searchCompanies
const SearchSchema = z.object({
  cidade: z.string().trim().max(120).optional().default(""),
  uf: z.string().trim().max(2).optional().default(""),
  segmento: z.string().trim().max(60).optional().default("Todos"),
  cnae: z.string().trim().max(20).optional().default(""),
  porte: z.string().trim().max(60).optional().default("Todos"),
  apenasAtivas: z.boolean().optional().default(true),
  keyword: z.string().trim().max(120).optional().default(""),
  limit: z.number().int().min(1).max(200).optional().default(60),
});

export const searchCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SearchSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("companies")
      .select("*")
      .order("score", { ascending: false })
      .limit(data.limit);

    if (data.cidade) q = q.ilike("cidade", `%${data.cidade}%`);
    if (data.uf) q = q.eq("uf", data.uf.toUpperCase());
    if (data.segmento && data.segmento !== "Todos") q = q.eq("segmento", data.segmento);
    if (data.cnae) q = q.ilike("cnae_principal", `${onlyDigits(data.cnae)}%`);
    if (data.porte && data.porte !== "Todos") q = q.ilike("porte", `%${data.porte}%`);
    if (data.apenasAtivas) q = q.ilike("situacao_cadastral", "%ATIVA%");
    if (data.keyword) {
      const k = data.keyword;
      q = q.or(
        `nome_fantasia.ilike.%${k}%,razao_social.ilike.%${k}%,cnae_descricao.ilike.%${k}%`,
      );
    }

    const { data: companies, error } = await q;
    if (error) throw new Error(error.message);

    // mark which are already leads of the current user
    const { data: leads } = await supabase
      .from("leads")
      .select("company_id,status")
      .eq("owner_id", userId);
    const leadMap = new Map((leads ?? []).map((l) => [l.company_id, l.status]));

    return {
      companies: (companies ?? []).map((c) => ({
        ...c,
        leadStatus: leadMap.get(c.id) ?? null,
      })),
      totalCache: companies?.length ?? 0,
    };
  });

// ---------------------------------------------------------------- lookupCnpj
const LookupSchema = z.object({
  cnpj: z.string().min(11).max(20),
  saveCache: z.boolean().optional().default(true),
});

export const lookupCnpj = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => LookupSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const cnpj = onlyDigits(data.cnpj);
    if (!isValidCnpj(cnpj)) throw new Error("CNPJ inválido");

    // Check cache
    const { data: cached } = await supabase
      .from("companies")
      .select("*")
      .eq("cnpj", cnpj)
      .maybeSingle();
    const isFresh =
      cached &&
      Date.now() - new Date(cached.updated_at).getTime() < CACHE_DAYS * 86_400_000;
    if (isFresh) return { company: cached, fromCache: true };

    const { data: raw, fonte } = await fetchCnpjCascade(cnpj);
    const row = { ...mapBrasilApi(raw), fonte };

    if (!data.saveCache) return { company: { ...row, id: cached?.id }, fromCache: false };

    const { data: upserted, error } = await supabase
      .from("companies")
      .upsert(row, { onConflict: "cnpj" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { company: upserted, fromCache: false };
  });

// ---------------------------------------------------------------- importCnpjs (batch CSV)
const ImportSchema = z.object({
  cnpjs: z.array(z.string()).min(1).max(50),
});

export const importCnpjs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ImportSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const results = await Promise.allSettled(
      data.cnpjs.map(async (raw) => {
        const cnpj = onlyDigits(raw);
        if (!isValidCnpj(cnpj)) throw new Error(`CNPJ inválido: ${raw}`);
        const { data: cached } = await supabase
          .from("companies")
          .select("id,updated_at")
          .eq("cnpj", cnpj)
          .maybeSingle();
        const fresh =
          cached &&
          Date.now() - new Date(cached.updated_at).getTime() < CACHE_DAYS * 86_400_000;
        if (fresh) return { cnpj, status: "cached" as const };
        const { data: apiRow, fonte } = await fetchCnpjCascade(cnpj);
        const row = { ...mapBrasilApi(apiRow), fonte };
        const { error } = await supabase
          .from("companies")
          .upsert(row, { onConflict: "cnpj" });
        if (error) throw new Error(error.message);
        return { cnpj, status: "imported" as const };
      }),
    );
    let imported = 0;
    let cached = 0;
    const errors: string[] = [];
    results.forEach((r, idx) => {
      if (r.status === "fulfilled") {
        if (r.value.status === "imported") imported++;
        else cached++;
      } else {
        errors.push(`${data.cnpjs[idx]}: ${r.reason?.message || "erro"}`);
      }
    });
    return { imported, cached, errors, total: data.cnpjs.length };
  });

// ---------------------------------------------------------------- radarStats
export const radarStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ count: total }, { count: ativas }, { count: alta }, { count: leadsCount }] =
      await Promise.all([
        supabase.from("companies").select("*", { count: "exact", head: true }),
        supabase
          .from("companies")
          .select("*", { count: "exact", head: true })
          .ilike("situacao_cadastral", "%ATIVA%"),
        supabase
          .from("companies")
          .select("*", { count: "exact", head: true })
          .gte("score", 70),
        supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("owner_id", userId),
      ]);
    return {
      empresas: total ?? 0,
      ativas: ativas ?? 0,
      altaOportunidade: alta ?? 0,
      leadsSalvos: leadsCount ?? 0,
    };
  });
