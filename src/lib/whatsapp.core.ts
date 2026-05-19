import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type EvolutionStatus = {
  configured: boolean;
  state: string;
  instance?: string;
  error?: string;
};

export type ParsedEvolutionMessage = {
  instance: string;
  remoteJid: string;
  phone: string;
  pushName: string | null;
  messageId: string;
  fromMe: boolean;
  content: string;
  messageType: string;
  timestamp: string;
  isGroup: boolean;
  rawPayload: unknown;
};

type SupabaseAny = ReturnType<typeof getAdmin>;

function getAdmin() {
  return supabaseAdmin as any;
}

export function evoConfig() {
  const url = (process.env.EVOLUTION_API_URL || process.env.EVOLUTION_BASE_URL || "").replace(/\/+$/, "");
  const key = process.env.EVOLUTION_API_KEY || "";
  const instance = process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_DEFAULT_INSTANCE || "leadflow";
  if (!url || !key || !instance) {
    throw new Error("Evolution API não configurada. Defina EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE.");
  }
  return { url, key, instance };
}

export function getSafeEvolutionConfig() {
  try {
    const cfg = evoConfig();
    return { configured: true, ...cfg, key: undefined };
  } catch {
    return { configured: false, url: "", instance: process.env.EVOLUTION_INSTANCE || "leadflow" };
  }
}

export async function evoFetch(path: string, init: RequestInit = {}) {
  const { url, key } = evoConfig();
  const r = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      ...(init.headers ?? {}),
    },
  });
  const text = await r.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!r.ok) {
    const msg = typeof body === "string" ? body : body?.message || body?.error || `HTTP ${r.status}`;
    throw new Error(`Evolution: ${msg}`);
  }
  return body;
}

export function normalizePhone(input?: string | null) {
  const digits = String(input ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length >= 10) return `55${digits}`;
  return digits;
}

export function jidToPhone(remoteJid?: string | null) {
  return normalizePhone(String(remoteJid ?? "").split("@")[0]);
}

export async function getInstanceStatus(): Promise<EvolutionStatus> {
  try {
    const { instance } = evoConfig();
    const res = await evoFetch(`/instance/connectionState/${instance}`);
    const state = res?.instance?.state ?? res?.state ?? "unknown";
    return { configured: true, state, instance };
  } catch (e: any) {
    return { configured: false, state: "disconnected", error: e.message };
  }
}

export async function getQrCode() {
  const { instance } = evoConfig();
  const attempts = [
    () => evoFetch(`/instance/connect/${instance}`),
    () => evoFetch(`/instance/qrcode/${instance}?image=true`),
    () => evoFetch(`/instance/${instance}/qrcode`),
  ];
  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      const res = await attempt();
      const raw =
        res?.base64 ??
        res?.qrcode?.base64 ??
        res?.qrcode ??
        res?.qr ??
        res?.code ??
        null;
      const code = res?.code ?? res?.pairingCode ?? null;
      if (raw) return { base64: String(raw), code };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Não foi possível gerar QR Code na Evolution API.");
}

function extractContent(message: any, messageType: string) {
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
  if (message?.buttonsResponseMessage?.selectedDisplayText) return String(message.buttonsResponseMessage.selectedDisplayText);
  if (message?.listResponseMessage?.title) return String(message.listResponseMessage.title);
  return messageType === "text" ? "" : `[${messageType || "Mensagem"} recebida]`;
}

function getMessageType(message: any) {
  if (!message || typeof message !== "object") return "text";
  if (message.conversation || message.extendedTextMessage) return "text";
  const key = Object.keys(message).find((item) => item.endsWith("Message"));
  return key ? key.replace("Message", "") : "text";
}

function normalizeTimestamp(value: unknown) {
  if (!value) return new Date().toISOString();
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const millis = numeric > 10_000_000_000 ? numeric : numeric * 1000;
    return new Date(millis).toISOString();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export function parseEvolutionPayload(payload: any, pathEvent?: string): ParsedEvolutionMessage[] {
  const data = payload?.data ?? payload;
  const items = Array.isArray(data) ? data : [data];
  const instance = payload?.instance ?? data?.instance ?? evoConfig().instance;

  return items
    .map((item: any) => {
      const key = item?.key ?? item?.message?.key ?? {};
      const message = item?.message ?? item?.data?.message ?? item;
      const remoteJid = key?.remoteJid ?? item?.remoteJid ?? item?.chatId ?? item?.jid ?? "";
      const fromMe = Boolean(key?.fromMe ?? item?.fromMe ?? false);
      const messageId = String(key?.id ?? item?.messageId ?? item?.id ?? `${remoteJid}-${Date.now()}`);
      const messageType = item?.messageType ?? getMessageType(message);
      const content = extractContent(message, messageType);
      const pushName = item?.pushName ?? item?.senderName ?? item?.notifyName ?? null;
      return {
        instance,
        remoteJid,
        phone: jidToPhone(remoteJid),
        pushName,
        messageId,
        fromMe,
        content,
        messageType,
        timestamp: normalizeTimestamp(item?.messageTimestamp ?? item?.timestamp ?? item?.createdAt),
        isGroup: String(remoteJid).endsWith("@g.us"),
        rawPayload: { event: pathEvent ?? payload?.event ?? payload?.type ?? null, payload: item },
      };
    })
    .filter((item) => item.remoteJid && item.content);
}

async function findDefaultOwner(admin: SupabaseAny) {
  const { data: roleUser } = await admin
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["admin", "consultor"])
    .limit(1)
    .maybeSingle();
  if (roleUser?.user_id) return roleUser.user_id as string;

  const { data: profile } = await admin.from("profiles").select("id").limit(1).maybeSingle();
  return profile?.id as string | undefined;
}

async function findOrCreateLead(admin: SupabaseAny, ownerId: string, msg: ParsedEvolutionMessage) {
  const { data: byPhone } = await admin
    .from("leads")
    .select("id, company_id")
    .eq("owner_id", ownerId)
    .eq("whatsapp_phone", msg.phone)
    .maybeSingle();
  if (byPhone?.id) return byPhone.id as string;

  const syntheticCnpj = `whatsapp:${msg.phone}`;
  const companyName = msg.pushName || `Contato WhatsApp ${msg.phone}`;
  const { data: company, error: companyError } = await admin
    .from("companies")
    .upsert({
      cnpj: syntheticCnpj,
      razao_social: companyName,
      nome_fantasia: companyName,
      telefone: msg.phone,
      fonte: "whatsapp",
      score: 35,
      raw: { source: "whatsapp", remoteJid: msg.remoteJid },
    }, { onConflict: "cnpj" })
    .select("id")
    .single();
  if (companyError) throw new Error(companyError.message);

  const { data: existingLead } = await admin
    .from("leads")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("company_id", company.id)
    .maybeSingle();
  if (existingLead?.id) return existingLead.id as string;

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .insert({
      owner_id: ownerId,
      company_id: company.id,
      source: "whatsapp",
      whatsapp_phone: msg.phone,
      contact_name: msg.pushName,
      notas: `Lead criado automaticamente por mensagem recebida no WhatsApp (${msg.instance}).`,
      status: "novo",
    })
    .select("id")
    .single();
  if (leadError) throw new Error(leadError.message);
  return lead.id as string;
}

export async function persistIncomingEvolutionMessage(msg: ParsedEvolutionMessage, preferredOwnerId?: string) {
  if (msg.isGroup) return { skipped: true, reason: "group_ignored" };

  const admin = getAdmin();
  const ownerId = preferredOwnerId || await findDefaultOwner(admin);
  if (!ownerId) return { skipped: true, reason: "no_owner_user" };

  const leadId = await findOrCreateLead(admin, ownerId, msg);
  const displayName = msg.pushName || msg.phone || msg.remoteJid;

  const { data: existingConversation } = await admin
    .from("whatsapp_conversations")
    .select("id, unread_count")
    .eq("owner_id", ownerId)
    .eq("instance", msg.instance)
    .eq("remote_jid", msg.remoteJid)
    .maybeSingle();

  const nextUnread = msg.fromMe ? 0 : Number(existingConversation?.unread_count ?? 0) + 1;
  const { data: conversation, error: convError } = await admin
    .from("whatsapp_conversations")
    .upsert({
      owner_id: ownerId,
      lead_id: leadId,
      instance: msg.instance,
      remote_jid: msg.remoteJid,
      phone: msg.phone,
      push_name: msg.pushName,
      display_name: displayName,
      source: "whatsapp_direct",
      last_message: msg.content,
      last_message_at: msg.timestamp,
      last_message_from_me: msg.fromMe,
      unread_count: nextUnread,
    }, { onConflict: "owner_id,instance,remote_jid" })
    .select("id, unread_count")
    .single();
  if (convError) throw new Error(convError.message);

  const { data: existing } = await admin
    .from("whatsapp_messages")
    .select("id")
    .eq("instance", msg.instance)
    .eq("message_id", msg.messageId)
    .maybeSingle();
  if (existing?.id) return { conversationId: conversation.id, messageId: existing.id, duplicated: true };

  const { data: message, error: messageError } = await admin
    .from("whatsapp_messages")
    .insert({
      owner_id: ownerId,
      conversation_id: conversation.id,
      lead_id: leadId,
      instance: msg.instance,
      remote_jid: msg.remoteJid,
      message_id: msg.messageId,
      from_me: msg.fromMe,
      direction: msg.fromMe ? "outbound" : "inbound",
      content: msg.content,
      message_type: msg.messageType,
      timestamp: msg.timestamp,
      status: msg.fromMe ? "sent" : "received",
      raw_payload: msg.rawPayload,
    })
    .select("id")
    .single();
  if (messageError) throw new Error(messageError.message);

  return { conversationId: conversation.id, messageId: message.id, duplicated: false };
}

export async function saveOutboundMessage(params: {
  ownerId: string;
  phone: string;
  message: string;
  messageId: string;
  leadId?: string | null;
  conversationId?: string | null;
}) {
  const admin = getAdmin();
  const { instance } = evoConfig();
  const phone = normalizePhone(params.phone);
  const remoteJid = `${phone}@s.whatsapp.net`;
  const timestamp = new Date().toISOString();

  const leadId = params.leadId ?? null;
  const { data: conversation, error: convError } = await admin
    .from("whatsapp_conversations")
    .upsert({
      owner_id: params.ownerId,
      lead_id: leadId,
      instance,
      remote_jid: remoteJid,
      phone,
      display_name: phone,
      source: "manual",
      last_message: params.message,
      last_message_at: timestamp,
      last_message_from_me: true,
    }, { onConflict: "owner_id,instance,remote_jid" })
    .select("id")
    .single();
  if (convError) throw new Error(convError.message);

  const { data: inserted, error } = await admin
    .from("whatsapp_messages")
    .upsert({
      owner_id: params.ownerId,
      conversation_id: params.conversationId || conversation.id,
      lead_id: leadId,
      instance,
      remote_jid: remoteJid,
      message_id: params.messageId,
      from_me: true,
      direction: "outbound",
      content: params.message,
      message_type: "text",
      timestamp,
      status: "sent",
    }, { onConflict: "instance,message_id" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { conversationId: params.conversationId || conversation.id, messageId: inserted.id };
}
