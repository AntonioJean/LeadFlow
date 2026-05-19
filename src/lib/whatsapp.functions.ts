import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  evoConfig,
  evoFetch,
  getInstanceStatus,
  getQrCode,
  normalizePhone,
  saveOutboundMessage,
} from "@/lib/whatsapp.core";

// ---------------------------------------------------------------- status
export const whatsappStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => getInstanceStatus());

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
    if (error) throw new Error(error.message);
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
