type AiProvider = "openrouter" | "deepseek" | "openai" | "gemini" | "mock";

type GenerateParams = {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
};

type AiConfig = {
  provider: AiProvider;
  configured: boolean;
  mode: "real" | "mock";
  model: string;
  apiKeyMasked: string | null;
  baseUrl: string | null;
};

export type AiResponse = {
  text: string;
  provider: AiProvider;
  model: string;
  mode: "real" | "mock";
  fallbackReason?: string;
};

const DEFAULT_REFERER = "http://localhost:5173";
const DEFAULT_TITLE = "LeadFlow CRM";

export const SOFTCOM_SYSTEM_PROMPT = `
Você é um copiloto comercial da Softcom Tecnologia dentro do CRM LeadFlow.

A Softcom Tecnologia oferece soluções para automação comercial:
- PDV
- controle de estoque
- caixa
- financeiro
- emissão fiscal
- Pix
- vendas
- delivery
- loja online
- relatórios gerenciais
- controle de clientes
- controle de fornecedores
- gestão multiusuário

Segmentos prioritários:
farmácias, mercadinhos, supermercados, restaurantes, lanchonetes, pizzarias,
lojas de roupas, autopeças, oficinas, clínicas, pet shops, distribuidoras e contabilidades.

Regras:
- Seja consultivo, simples e natural para WhatsApp.
- Não invente preços, descontos, prazos ou funcionalidades.
- Não envie mensagem automaticamente; você apenas sugere textos para revisão do vendedor.
- Faça respostas objetivas, humanas e comerciais.
- Ajude a avançar para diagnóstico, demonstração, proposta ou follow-up.
`.trim();

export function maskSecret(value?: string | null) {
  if (!value) return null;
  if (value.length <= 6) return "******";
  return `${"*".repeat(Math.max(6, value.length - 4))}${value.slice(-4)}`;
}

export function getAiConfig(): AiConfig {
  const provider = ((process.env.AI_PROVIDER || "mock").toLowerCase() as AiProvider);

  if (provider === "openrouter" && process.env.OPENROUTER_API_KEY) {
    return {
      provider,
      configured: true,
      mode: "real",
      model: process.env.OPENROUTER_MODEL || "deepseek/deepseek-r1:free",
      apiKeyMasked: maskSecret(process.env.OPENROUTER_API_KEY),
      baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    };
  }

  if (provider === "deepseek" && process.env.DEEPSEEK_API_KEY) {
    return {
      provider,
      configured: true,
      mode: "real",
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      apiKeyMasked: maskSecret(process.env.DEEPSEEK_API_KEY),
      baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    };
  }

  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    return {
      provider,
      configured: true,
      mode: "real",
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      apiKeyMasked: maskSecret(process.env.OPENAI_API_KEY),
      baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    };
  }

  if (provider === "gemini" && process.env.GEMINI_API_KEY) {
    return {
      provider,
      configured: true,
      mode: "real",
      model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
      apiKeyMasked: maskSecret(process.env.GEMINI_API_KEY),
      baseUrl: process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com",
    };
  }

  return {
    provider: "mock",
    configured: false,
    mode: "mock",
    model: "local-commercial-heuristic",
    apiKeyMasked: null,
    baseUrl: null,
  };
}

export function isAiConfigured() {
  return getAiConfig().configured;
}

async function callOpenAiCompatible(params: GenerateParams, cfg: AiConfig, apiKey: string) {
  const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.AI_HTTP_REFERER || DEFAULT_REFERER,
      "X-Title": process.env.AI_APP_TITLE || DEFAULT_TITLE,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userPrompt },
      ],
      temperature: params.temperature ?? 0.6,
      max_tokens: params.maxTokens ?? 900,
    }),
  });

  const json: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = json?.error?.message || json?.message || `HTTP ${response.status}`;
    throw new Error(`IA ${cfg.provider}: ${response.status} - ${message}`);
  }

  if (json?.error) {
    const message = json.error.message || json.error.code || "Provider returned error";
    throw new Error(`IA ${cfg.provider}: ${message}`);
  }

  const content = String(json?.choices?.[0]?.message?.content || "").trim();
  if (!content) {
    throw new Error(`IA ${cfg.provider}: resposta vazia do provedor.`);
  }

  return content;
}

async function callGemini(params: GenerateParams, cfg: AiConfig, apiKey: string) {
  const response = await fetch(`${cfg.baseUrl}/v1beta/models/${cfg.model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: `${params.systemPrompt}\n\n${params.userPrompt}` }],
        },
      ],
      generationConfig: {
        temperature: params.temperature ?? 0.6,
        maxOutputTokens: params.maxTokens ?? 900,
      },
    }),
  });

  const json: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = json?.error?.message || `HTTP ${response.status}`;
    throw new Error(`IA gemini: ${response.status} - ${message}`);
  }

  const content = String(json?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  if (!content) {
    throw new Error("IA gemini: resposta vazia do provedor.");
  }

  return content;
}

export function buildMockCommercialReply(context: string) {
  const lower = context.toLowerCase();
  if (lower.includes("preço") || lower.includes("valor") || lower.includes("quanto")) {
    return "Perfeito. Para te passar valores certinhos, preciso entender rapidinho sua operação. Hoje vocês precisam mais de PDV, estoque, financeiro ou emissão fiscal?";
  }
  if (lower.includes("já tenho sistema") || lower.includes("ja tenho sistema")) {
    return "Entendi. E hoje o que você sente que mais falta no sistema atual: controle de estoque, financeiro, caixa, emissão fiscal ou relatórios?";
  }
  if (lower.includes("demonstra")) {
    return "Ótimo. Podemos marcar uma demonstração rápida para entender sua rotina e mostrar onde a Softcom pode ajudar. Qual melhor horário para você?";
  }
  return "Olá! Para eu te direcionar melhor, me conta rapidinho: qual é o segmento da sua empresa e como vocês controlam vendas, estoque e caixa hoje?";
}

function localFallback(params: GenerateParams, cfg: AiConfig, reason?: string): AiResponse {
  return {
    text: buildMockCommercialReply(`${params.systemPrompt}\n${params.userPrompt}`),
    provider: cfg.provider,
    model: cfg.model,
    mode: "mock",
    fallbackReason: reason,
  };
}

export async function generateAiResponse(params: GenerateParams): Promise<AiResponse> {
  const cfg = getAiConfig();

  if (!cfg.configured) {
    if (process.env.NODE_ENV === "production" && process.env.ENABLE_LOCAL_MOCKS !== "true") {
      throw new Error("IA não configurada. Defina AI_PROVIDER e a chave do provedor.");
    }
    return localFallback(params, cfg, "IA real nao configurada.");
  }

  const keyByProvider: Record<AiProvider, string | undefined> = {
    openrouter: process.env.OPENROUTER_API_KEY,
    deepseek: process.env.DEEPSEEK_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    mock: undefined,
  };
  const apiKey = keyByProvider[cfg.provider];
  if (!apiKey) throw new Error("Chave de IA ausente.");

  try {
    const text = cfg.provider === "gemini"
      ? await callGemini(params, cfg, apiKey)
      : await callOpenAiCompatible(params, cfg, apiKey);

    return {
      text,
      provider: cfg.provider,
      model: cfg.model,
      mode: "real",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido no provedor de IA.";
    if (process.env.ENABLE_LOCAL_MOCKS === "true") {
      console.warn(`[AI] Provedor real indisponivel; usando fallback local. ${message}`);
      return localFallback(params, cfg, message);
    }
    throw error;
  }
}
