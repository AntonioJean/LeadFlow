import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  evoConfig,
  evoFetch,
  getSafeEvolutionConfig,
  getInstanceStatus,
  getQrCode,
  normalizePhone,
  saveOutboundMessage,
} from "@/lib/whatsapp.core";

function jidToPhone(remoteJid?: string | null) {
  return normalizePhone(String(remoteJid ?? "").split("@")[0]);
}

function isGroupJid(remoteJid?: string | null) {
  return String(remoteJid ?? "").endsWith("@g.us");
}

function getEvolutionMessageText(message: any, messageType?: string) {
  if (message?.conversation) return String(message.conversation);
  if (message?.extendedTextMessage?.text) return String(message.extendedTextMessage.text);
  if (message?.imageMessage?.caption) return String(message.imageMessage.caption);
  if (message?.documentMessage?.caption) return String(message.documentMessage.caption);
  if (message?.videoMessage?.caption) return String(message.videoMessage.caption);
  if (message?.audioMessage) return "[Áudio recebido]";
  if (message?.imageMessage) return "[Imagem recebida]";
  if (message?.documentMessage) return "[Documento recebido]";
  if (message?.videoMessage) return "[Vídeo recebido]";
  if (message?.stickerMessage) return "[Figurinha recebida]";
  if (message?.reactionMessage) return "[Reação recebida]";
  return messageType && messageType !== "conversation" ? `[${messageType} recebido]` : "";
}

function normalizeEvolutionTimestamp(value: unknown) {
  if (!value) return new Date().toISOString();
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return new Date(numeric > 10_000_000_000 ? numeric : numeric * 1000).toISOString();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

// ---------------------------------------------------------------- status
export const whatsappStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const status = await getInstanceStatus();
    return {
      ...status,
      config: getSafeEvolutionConfig(),
      webhookReady: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      webhookUrl: process.env.EVOLUTION_WEBHOOK_URL || "/api/webhooks/evolution",
    };
  });

// ---------------------------------------------------------------- QR Code (connect)
export const whatsappQrCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => getQrCode());

// ---------------------------------------------------------------- conversations
export const listWhatsappConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await (supabase as any)
      .from("whatsapp_conversations")
      .select("*, lead:leads(id,status,contact_name,whatsapp_phone,company:companies(id,nome_fantasia,razao_social,segmento,cidade,uf,telefone,score))")
      .eq("owner_id", userId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(80);
    if (error) {
      const message = String(error.message ?? "");
      if (message.includes("whatsapp_conversations") || message.includes("companies") || message.includes("leads")) {
        return {
          conversations: [],
          setupError: "As tabelas do WhatsApp ainda não existem no Supabase. Rode o SQL de produção em supabase/migrations/20260521000000_whatsapp_production_schema.sql.",
        };
      }
      throw new Error(error.message);
    }
    return { conversations: data ?? [] };
  });

const ConversationMessagesSchema = z.object({
  conversationId: z.string().uuid(),
});

export const listWhatsappMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ConversationMessagesSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: conversation, error: convError } = await (supabase as any)
      .from("whatsapp_conversations")
      .select("id")
      .eq("id", data.conversationId)
      .eq("owner_id", userId)
      .maybeSingle();
    if (convError) throw new Error(convError.message);
    if (!conversation) throw new Error("Conversa não encontrada.");

    const { data: messages, error } = await (supabase as any)
      .from("whatsapp_messages")
      .select("*")
      .eq("conversation_id", data.conversationId)
      .eq("owner_id", userId)
      .order("timestamp", { ascending: true })
      .limit(250);
    if (error) throw new Error(error.message);
    return { messages: messages ?? [] };
  });

export const markWhatsappConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ConversationMessagesSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await (supabase as any)
      .from("whatsapp_conversations")
      .update({ unread_count: 0, last_read_at: new Date().toISOString() })
      .eq("id", data.conversationId)
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------- sync chats from Evolution
export const syncWhatsappChats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { instance } = evoConfig();

    const chats = await evoFetch(`/chat/findChats/${instance}`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const list = Array.isArray(chats) ? chats : chats?.chats ?? chats?.records ?? [];
    const nonGroupChats = list.filter((chat: any) => !isGroupJid(chat?.remoteJid));
    const rows = nonGroupChats.slice(0, 250).map((chat: any) => {
      const last = chat?.lastMessage ?? {};
      const remoteJid = chat.remoteJid ?? chat.id ?? chat.jid ?? last?.key?.remoteJid ?? "";
      const messageText = getEvolutionMessageText(last?.message, last?.messageType);
      const whatsappName =
        chat.pushName ??
        chat.name ??
        chat.contactName ??
        chat.notifyName ??
        chat.verifiedName ??
        chat?.contact?.pushName ??
        chat?.contact?.name ??
        last?.pushName ??
        null;
      return {
        owner_id: userId,
        lead_id: null,
        instance,
        remote_jid: remoteJid,
        phone: jidToPhone(remoteJid),
        push_name: whatsappName,
        display_name: whatsappName ?? jidToPhone(remoteJid) ?? remoteJid,
        avatar_url: chat.profilePicUrl ?? chat.profilePictureUrl ?? chat.picture ?? null,
        source: "evolution_sync",
        last_message: messageText || "Conversa sincronizada da Evolution",
        last_message_at: normalizeEvolutionTimestamp(last?.messageTimestamp ?? chat.updatedAt),
        last_message_from_me: Boolean(last?.key?.fromMe ?? false),
        unread_count: 0,
      };
    }).filter((row: any) => row.remote_jid && row.phone);

    let insertedConversations = 0;
    if (rows.length) {
      const { data, error } = await (supabase as any)
        .from("whatsapp_conversations")
        .upsert(rows, { onConflict: "owner_id,instance,remote_jid" })
        .select("id");
      if (error) throw new Error(error.message);
      insertedConversations = data?.length ?? rows.length;
    }

    let insertedMessages = 0;
    let messagesWarning: string | null = null;
    try {
      const messageResult = await evoFetch(`/chat/findMessages/${instance}`, {
        method: "POST",
        body: JSON.stringify({ page: 1, offset: 120 }),
      });
      const records = messageResult?.messages?.records ?? messageResult?.records ?? [];
      const remoteJids = Array.from(new Set(records.map((item: any) => item?.key?.remoteJid).filter(Boolean)));
      const { data: conversations } = await (supabase as any)
        .from("whatsapp_conversations")
        .select("id, remote_jid")
        .eq("owner_id", userId)
        .eq("instance", instance)
        .in("remote_jid", remoteJids);
      const conversationMap = new Map((conversations ?? []).map((c: any) => [c.remote_jid, c.id]));
      const messageRows = records
        .filter((item: any) => item?.key?.remoteJid && !isGroupJid(item.key.remoteJid))
        .map((item: any) => {
          const remoteJid = item.key.remoteJid;
          const conversationId = conversationMap.get(remoteJid);
          if (!conversationId) return null;
          const text = getEvolutionMessageText(item.message, item.messageType);
          return {
            owner_id: userId,
            conversation_id: conversationId,
            lead_id: null,
            instance,
            remote_jid: remoteJid,
            message_id: String(item.key.id ?? item.id),
            from_me: Boolean(item.key.fromMe),
            direction: item.key.fromMe ? "outbound" : "inbound",
            content: text || "[Mensagem sincronizada]",
            message_type: item.messageType ?? "text",
            timestamp: normalizeEvolutionTimestamp(item.messageTimestamp ?? item.createdAt),
            status: item.key.fromMe ? "sent" : "received",
            raw_payload: { source: "evolution_sync", payload: item },
          };
        })
        .filter(Boolean);

      if (messageRows.length) {
        const { data, error } = await (supabase as any)
          .from("whatsapp_messages")
          .upsert(messageRows, { onConflict: "instance,message_id" })
          .select("id");
        if (error) throw new Error(error.message);
        insertedMessages = data?.length ?? messageRows.length;
      }
    } catch (error) {
      messagesWarning = error instanceof Error ? error.message : "Não foi possível sincronizar mensagens.";
    }

    return {
      ok: true,
      chatsFound: list.length,
      chatsImported: insertedConversations,
      messagesImported: insertedMessages,
      ignoredGroups: list.length - nonGroupChats.length,
      warning: messagesWarning,
    };
  });

// ---------------------------------------------------------------- media from Evolution
const MediaSchema = z.object({
  messageId: z.string().uuid(),
});

function pickEvolutionRawMessage(rawPayload: any) {
  const raw = rawPayload?.payload ?? rawPayload;
  const payload = raw?.payload ?? raw;
  if (payload?.key) return payload;
  if (payload?.data?.key) return payload.data;
  if (payload?.message?.key) return payload.message;
  return payload;
}

function normalizeMediaDataUrl(result: any) {
  const base64 =
    result?.base64 ??
    result?.data?.base64 ??
    result?.media?.base64 ??
    result?.file?.base64 ??
    null;
  const mimetype =
    result?.mimetype ??
    result?.data?.mimetype ??
    result?.media?.mimetype ??
    result?.file?.mimetype ??
    "audio/ogg";
  if (!base64 || typeof base64 !== "string") return null;
  if (base64.startsWith("data:")) return base64;
  return `data:${mimetype};base64,${base64}`;
}

export const getWhatsappMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => MediaSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { instance } = evoConfig();

    const { data: message, error } = await (supabase as any)
      .from("whatsapp_messages")
      .select("id, owner_id, instance, message_id, message_type, raw_payload")
      .eq("id", data.messageId)
      .eq("owner_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!message) throw new Error("Mensagem nao encontrada.");

    const rawMessage = pickEvolutionRawMessage(message.raw_payload);
    const key = rawMessage?.key ?? {
      id: message.message_id,
      remoteJid: rawMessage?.remoteJid,
      fromMe: rawMessage?.fromMe,
    };

    const attempts = [
      { message: rawMessage, convertToMp4: false },
      { message: { key, message: rawMessage?.message }, convertToMp4: false },
      { message: { key }, convertToMp4: false },
    ];

    let lastError: unknown;
    for (const body of attempts) {
      try {
        const result = await evoFetch(`/chat/getBase64FromMediaMessage/${message.instance || instance}`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        const dataUrl = normalizeMediaDataUrl(result);
        if (dataUrl) return { ok: true, dataUrl, mimetype: dataUrl.slice(5, dataUrl.indexOf(";")) };
        lastError = new Error("A Evolution respondeu sem base64 da midia.");
      } catch (attemptError) {
        lastError = attemptError;
      }
    }

    const details = lastError instanceof Error ? lastError.message : "Erro desconhecido.";
    throw new Error(`Nao foi possivel carregar o audio pela Evolution. ${details}`);
  });

// ---------------------------------------------------------------- send message
const SendSchema = z.object({
  phone: z.string().min(8).max(24).optional(),
  message: z.string().min(1).max(4096),
  leadId: z.string().uuid().nullable().optional(),
  conversationId: z.string().uuid().nullable().optional(),
});

export const sendWhatsappMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SendSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { instance } = evoConfig();
    let phone = data.phone ? normalizePhone(data.phone) : "";
    let leadId = data.leadId ?? null;

    if (data.conversationId) {
      const { data: conversation, error } = await (supabase as any)
        .from("whatsapp_conversations")
        .select("id, phone, lead_id")
        .eq("id", data.conversationId)
        .eq("owner_id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!conversation) throw new Error("Conversa não encontrada.");
      phone = normalizePhone(conversation.phone);
      leadId = leadId ?? conversation.lead_id ?? null;
    }

    if (!phone) throw new Error("Telefone inválido para envio.");
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada. Por segurança, a mensagem não foi enviada porque não seria possível salvar o histórico.");
    }

    const res = await evoFetch(`/message/sendText/${instance}`, {
      method: "POST",
      body: JSON.stringify({
        number: phone,
        text: data.message,
      }),
    });

    const messageId = res?.key?.id ?? res?.messageId ?? `manual-${Date.now()}`;
    const saved = await saveOutboundMessage({
      ownerId: userId,
      phone,
      message: data.message,
      messageId,
      leadId,
      conversationId: data.conversationId,
    });

    return {
      ok: true,
      messageId,
      saved,
      sentAt: new Date().toISOString(),
      to: phone,
    };
  });
