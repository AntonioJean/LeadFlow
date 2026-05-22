import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateAiResponse, getAiConfig, SOFTCOM_SYSTEM_PROMPT } from "@/lib/ai.core";

export const aiStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({ ai: getAiConfig() }));

const ConversationAiSchema = z.object({
  conversationId: z.string().uuid(),
  objective: z.string().trim().max(120).optional().default("Responder de forma consultiva"),
});

async function getConversationAiContext(supabase: any, userId: string, conversationId: string, limit = 18) {
  const { data: conversation, error: convError } = await supabase
    .from("whatsapp_conversations")
    .select("*, lead:leads(id,status,contact_name,whatsapp_phone,notas,company:companies(nome_fantasia,razao_social,segmento,cidade,uf,telefone,score))")
    .eq("id", conversationId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (convError) throw new Error(convError.message);
  if (!conversation) throw new Error("Conversa nao encontrada.");

  const { data: messages, error: msgError } = await supabase
    .from("whatsapp_messages")
    .select("from_me,content,timestamp,message_type")
    .eq("conversation_id", conversationId)
    .eq("owner_id", userId)
    .order("timestamp", { ascending: false })
    .limit(limit);

  if (msgError) throw new Error(msgError.message);

  const orderedMessages = [...(messages ?? [])].reverse();
  const transcript = orderedMessages
    .map((item: any) => `${item.from_me ? "Vendedor" : "Cliente"}: ${item.content}`)
    .join("\n");

  const lead = conversation.lead;
  const company = lead?.company;
  const leadContext = {
    nomeContato: lead?.contact_name ?? conversation.push_name ?? conversation.display_name,
    telefone: conversation.phone,
    status: lead?.status,
    empresa: company?.nome_fantasia ?? company?.razao_social,
    segmento: company?.segmento,
    cidade: company?.cidade,
    uf: company?.uf,
    score: company?.score,
    notas: lead?.notas,
  };

  return { transcript, leadContext };
}

export const suggestWhatsappReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ConversationAiSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { transcript, leadContext } = await getConversationAiContext(supabase as any, userId, data.conversationId, 12);

    const result = await generateAiResponse({
      systemPrompt: SOFTCOM_SYSTEM_PROMPT,
      userPrompt: `
Objetivo da resposta: ${data.objective}

Dados do lead:
${JSON.stringify(leadContext, null, 2)}

Historico recente da conversa:
${transcript || "Sem mensagens anteriores."}

Crie UMA resposta curta para WhatsApp, em portugues do Brasil.
Nao envie preco. Nao diga que a mensagem foi enviada. Nao use markdown pesado.
Use quebras de linha apenas se melhorar a leitura.
      `.trim(),
      temperature: 0.65,
      maxTokens: 500,
    });

    return {
      reply: result.text,
      provider: result.provider,
      model: result.model,
      mode: result.mode,
      fallbackReason: result.fallbackReason,
    };
  });

export const analyzeWhatsappConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ConversationAiSchema.pick({ conversationId: true }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { transcript, leadContext } = await getConversationAiContext(supabase as any, userId, data.conversationId, 24);

    const result = await generateAiResponse({
      systemPrompt: SOFTCOM_SYSTEM_PROMPT,
      userPrompt: `
Analise a conversa de WhatsApp abaixo como copiloto comercial da Softcom.

Dados do lead:
${JSON.stringify(leadContext, null, 2)}

Historico recente:
${transcript || "Sem mensagens anteriores."}

Responda em portugues do Brasil com quebras de linha claras e exatamente neste formato:

Resumo:
<2 a 3 linhas sobre o que aconteceu>

Temperatura:
<frio, morno ou quente, com motivo>

Intencao detectada:
<preco, demonstracao, duvida, objecao, retorno futuro, sem interesse ou outro>

Dores provaveis:
- <dor 1>
- <dor 2>

Proxima melhor acao:
<acao objetiva para o vendedor>

Resposta sugerida para WhatsApp:
<mensagem curta, natural e pronta para revisar antes de enviar>

Regras:
- Nao invente preco.
- Nao diga que a mensagem foi enviada.
- Nao coloque tudo em uma linha so.
- Se faltarem dados, diga o que perguntar em seguida.
      `.trim(),
      temperature: 0.45,
      maxTokens: 900,
    });

    return {
      analysis: result.text,
      provider: result.provider,
      model: result.model,
      mode: result.mode,
      fallbackReason: result.fallbackReason,
    };
  });

const ChatSchema = z.object({
  message: z.string().trim().min(1).max(3000),
});

export const chatWithAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ChatSchema.parse(input))
  .handler(async ({ data }) => {
    const isAnalyzeCommand = data.message.trim().toLowerCase() === "analisar";
    const userPrompt = isAnalyzeCommand
      ? "Explique que para analisar uma conversa real o vendedor deve abrir o WhatsApp Chat e usar o botao Analisar na conversa desejada. Em seguida, mostre um checklist curto do que voce analisa: temperatura, intencao, dores, proxima melhor acao e resposta sugerida."
      : data.message;

    const result = await generateAiResponse({
      systemPrompt: SOFTCOM_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.6,
      maxTokens: 900,
    });

    return {
      answer: result.text,
      provider: result.provider,
      model: result.model,
      mode: result.mode,
      fallbackReason: result.fallbackReason,
    };
  });
