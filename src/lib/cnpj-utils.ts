// Utilities for CNPJ formatting and opportunity scoring (client + server safe)

export function onlyDigits(input: string): string {
  return (input || "").replace(/\D+/g, "");
}

export function formatCnpj(cnpj: string): string {
  const d = onlyDigits(cnpj);
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function formatPhone(phone?: string | null): string {
  if (!phone) return "";
  const d = onlyDigits(phone);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

export function isValidCnpj(cnpj: string): boolean {
  const d = onlyDigits(cnpj);
  if (d.length !== 14) return false;
  if (/^(\d)\1+$/.test(d)) return false;
  const calc = (base: string, weights: number[]) => {
    const sum = base.split("").reduce((acc, n, i) => acc + Number(n) * weights[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const dv1 = calc(d.slice(0, 12), w1);
  const dv2 = calc(d.slice(0, 12) + dv1, w2);
  return dv1 === Number(d[12]) && dv2 === Number(d[13]);
}

// Map CNAE → segmento legível
const SEGMENT_RULES: Array<{ test: RegExp; label: string }> = [
  { test: /^47(11|12|13)/, label: "Mercados" },
  { test: /^477[12]/, label: "Farmácias" },
  { test: /^561/, label: "Restaurantes" },
  { test: /^4721[12]/, label: "Padarias" },
  { test: /^471/, label: "Lojas" },
  { test: /^692/, label: "Contabilidades" },
  { test: /^46/, label: "Distribuidoras" },
  { test: /^453/, label: "Autopeças" },
  { test: /^4729/, label: "Conveniências" },
];

export function segmentFromCnae(cnae?: string | null): string {
  if (!cnae) return "Empresas em geral";
  const c = onlyDigits(String(cnae));
  for (const rule of SEGMENT_RULES) if (rule.test.test(c)) return rule.label;
  return "Empresas em geral";
}

export const SEGMENT_OPTIONS = [
  "Todos",
  "Mercados",
  "Farmácias",
  "Restaurantes",
  "Lojas",
  "Contabilidades",
  "Padarias",
  "Distribuidoras",
  "Autopeças",
  "Conveniências",
  "Empresas em geral",
] as const;

export const APPROACH_SUGGESTIONS: Record<string, string> = {
  Mercados:
    "Foque em fluxo de caixa, antecipação de recebíveis e maquininha. Mercados valorizam taxas competitivas e suporte ágil para horários de pico.",
  Farmácias:
    "Destaque compliance com PBM, parcelamento de medicamentos de alto valor e integração com sistemas de gestão farmacêutica.",
  Restaurantes:
    "Aborde pedidos via QR Code, controle de mesas, integração com iFood/Rappi e antecipação para girar capital de giro.",
  Lojas:
    "Apresente parcelamento sem juros, link de pagamento para vendas externas e crédito rápido para reposição de estoque.",
  Contabilidades:
    "Foque em parcerias para indicação, automação fiscal e ferramentas que beneficiem a carteira de clientes do escritório.",
  Padarias:
    "Mostre maquininha de baixa taxa, vendas no débito e crédito sem fila e antecipação para compras diárias de insumos.",
  Distribuidoras:
    "Destaque tickets altos, parcelamento B2B, cobrança recorrente e crédito para giro de estoque.",
  Autopeças:
    "Foque em parcelamento de peças caras, link de pagamento para revendedores e cobrança via boleto/Pix recorrente.",
  Conveniências:
    "Aborde maquininha 4G, tickets pequenos com alta frequência e taxas competitivas para Pix presencial.",
  "Empresas em geral":
    "Comece entendendo o ticket médio, ciclo de venda e meio de pagamento atual antes de propor solução.",
};

export interface ScoreInput {
  porte?: string | null;
  situacao_cadastral?: string | null;
  segmento?: string | null;
  data_abertura?: string | null;
  telefone?: string | null;
  email?: string | null;
  capital_social?: number | null;
}

export function computeScore(c: ScoreInput): number {
  let s = 0;
  const sit = (c.situacao_cadastral || "").toUpperCase();
  if (sit.includes("ATIVA")) s += 30;
  const porte = (c.porte || "").toUpperCase();
  if (porte.includes("GRANDE")) s += 22;
  else if (porte.includes("MÉDIO") || porte.includes("MEDIO")) s += 18;
  else if (porte.includes("PEQUENO") || porte.includes("EPP")) s += 14;
  else if (porte.includes("MICRO") || porte.includes("ME") || porte.includes("MEI")) s += 8;
  else s += 5;
  if (c.segmento && c.segmento !== "Empresas em geral") s += 12;
  if (c.telefone) s += 10;
  if (c.email) s += 6;
  if (c.capital_social && c.capital_social > 100_000) s += 8;
  if (c.data_abertura) {
    const years = (Date.now() - new Date(c.data_abertura).getTime()) / (365.25 * 86400_000);
    if (years >= 3) s += 12;
    else if (years >= 1) s += 8;
    else s += 4;
  }
  return Math.max(0, Math.min(100, Math.round(s)));
}

export function scoreClassification(score: number): {
  label: "Alta" | "Média" | "Baixa";
  color: "success" | "warning" | "muted";
} {
  if (score >= 70) return { label: "Alta", color: "success" };
  if (score >= 45) return { label: "Média", color: "warning" };
  return { label: "Baixa", color: "muted" };
}
