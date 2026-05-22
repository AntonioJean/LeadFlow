import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  MessageSquare, QrCode, Send, RefreshCw, CheckCircle2, AlertCircle,
  Search, UserPlus, Bot, Clock, Building2, Loader2, Inbox, WandSparkles, Brain, Mic2, PlayCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  whatsappStatus,
  whatsappQrCode,
  sendWhatsappMessage,
  listWhatsappConversations,
  listWhatsappMessages,
  markWhatsappConversationRead,
  syncWhatsappChats,
  getWhatsappMedia,
} from "@/lib/whatsapp.functions";
import { aiStatus, analyzeWhatsappConversation, suggestWhatsappReply } from "@/lib/ai.functions";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  component: WhatsAppPage,
});

function WhatsAppPage() {
  const statusFn = useServerFn(whatsappStatus);
  const qrFn = useServerFn(whatsappQrCode);
  const sendFn = useServerFn(sendWhatsappMessage);
  const conversationsFn = useServerFn(listWhatsappConversations);
  const messagesFn = useServerFn(listWhatsappMessages);
  const readFn = useServerFn(markWhatsappConversationRead);
  const syncFn = useServerFn(syncWhatsappChats);
  const aiStatusFn = useServerFn(aiStatus);
  const suggestReplyFn = useServerFn(suggestWhatsappReply);
  const analyzeConversationFn = useServerFn(analyzeWhatsappConversation);
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [qr, setQr] = useState<{ base64: string | null; code: string | null } | null>(null);

  const status = useQuery({
    queryKey: ["wa-status"],
    queryFn: () => statusFn(),
    refetchInterval: 8000,
  });

  const conversationsQ = useQuery({
    queryKey: ["wa-conversations"],
    queryFn: () => conversationsFn(),
    refetchInterval: 5000,
  });

  const aiStatusQ = useQuery({
    queryKey: ["ai-status"],
    queryFn: () => aiStatusFn(),
  });

  const selected = useMemo(() => {
    const conversations = conversationsQ.data?.conversations ?? [];
    return conversations.find((item: any) => item.id === selectedId) ?? conversations[0] ?? null;
  }, [conversationsQ.data, selectedId]);

  const messagesQ = useQuery({
    queryKey: ["wa-messages", selected?.id],
    queryFn: () => messagesFn({ data: { conversationId: selected.id } }),
    enabled: !!selected?.id,
    refetchInterval: 5000,
  });

  const qrMut = useMutation({
    mutationFn: () => qrFn(),
    onSuccess: (d) => {
      setQr(d);
      qc.invalidateQueries({ queryKey: ["wa-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendMut = useMutation({
    mutationFn: () => sendFn({ data: { conversationId: selected?.id, message } }),
    onSuccess: () => {
      toast.success("Mensagem enviada!");
      setMessage("");
      qc.invalidateQueries({ queryKey: ["wa-conversations"] });
      qc.invalidateQueries({ queryKey: ["wa-messages", selected?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const analyzeMut = useMutation({
    mutationFn: () => analyzeConversationFn({ data: { conversationId: selected?.id } }),
    onSuccess: (result) => {
      setAiAnalysis(result.analysis);
      if (result.fallbackReason) {
        toast.warning("IA real indisponivel no momento. Analise local gerada.");
      } else {
        toast.success("Conversa analisada pela IA.");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const suggestMut = useMutation({
    mutationFn: () => suggestReplyFn({
      data: {
        conversationId: selected?.id,
        objective: "Responder a última mensagem do cliente com abordagem consultiva",
      },
    }),
    onSuccess: (result) => {
      setMessage(result.reply);
      if (result.fallbackReason) {
        toast.warning("Provedor de IA indisponivel no momento. Sugestao local gerada.");
      } else {
        toast.success(result.mode === "real" ? "Sugestão gerada com IA." : "Sugestão local gerada.");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const readMut = useMutation({
    mutationFn: (conversationId: string) => readFn({ data: { conversationId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-conversations"] }),
  });

  const syncMut = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (result) => {
      toast.success(`Sincronização concluída: ${result.chatsImported} conversas e ${result.messagesImported} mensagens.`);
      if (result.ignoredGroups) toast.info(`${result.ignoredGroups} grupos foram ignorados.`);
      if (result.warning) toast.warning(result.warning);
      qc.invalidateQueries({ queryKey: ["wa-conversations"] });
      if (selected?.id) qc.invalidateQueries({ queryKey: ["wa-messages", selected.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const state = status.data?.state;
  const connected = state === "open" || state === "connected";
  const conversations = conversationsQ.data?.conversations ?? [];
  const setupError = conversationsQ.data?.setupError;
  const filtered = conversations.filter((item: any) => {
    const text = `${getConversationName(item)} ${item.phone ?? ""} ${item.last_message ?? ""}`.toLowerCase();
    return text.includes(query.toLowerCase());
  });
  const messages = messagesQ.data?.messages ?? [];
  const currentMessageIsAnalyze = message.trim().toLowerCase() === "analisar";

  function selectConversation(id: string) {
    setSelectedId(id);
    setAiAnalysis("");
    readMut.mutate(id);
  }

  function handleSend() {
    if (message.trim().toLowerCase() === "analisar") {
      setMessage("");
      analyzeMut.mutate();
      return;
    }
    sendMut.mutate();
  }

  return (
    <div className="h-[100dvh] max-h-[100dvh] overflow-hidden flex flex-col">
      <div className="bg-radar-grad border-b border-border">
        <div className="px-5 py-4 max-w-[1680px] mx-auto">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-sm text-primary mb-1">
                <MessageSquare className="h-4 w-4" /> Central WhatsApp
              </div>
              <h1 className="text-2xl font-bold tracking-tight">WhatsApp Chat</h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                Converse pelo número conectado, visualize mensagens reais da Evolution API e acompanhe leads criados pelo webhook.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={connected ? "default" : "secondary"} className="gap-1">
                {connected ? <CheckCircle2 className="size-3" /> : <AlertCircle className="size-3" />}
                {status.data?.configured === false ? "Não configurado" : state ?? "..."}
              </Badge>
              <Button variant="outline" onClick={() => {
                qc.invalidateQueries({ queryKey: ["wa-conversations"] });
                if (selected?.id) qc.invalidateQueries({ queryKey: ["wa-messages", selected.id] });
              }}>
                <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
              </Button>
              <Button variant="outline" onClick={() => syncMut.mutate()} disabled={!connected || syncMut.isPending}>
                {syncMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Inbox className="h-4 w-4 mr-2" />}
                Sincronizar chats
              </Button>
            </div>
          </div>
        </div>
      </div>

      {status.data?.configured === false && (
        <div className="px-5 pt-3 max-w-[1680px] mx-auto w-full shrink-0">
          <Card className="border-warning/50 bg-warning/5">
            <CardHeader className="py-4">
              <CardTitle className="text-base">Evolution API não configurada</CardTitle>
              <CardDescription>
                Defina EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE nos secrets. Conversas reais aparecem aqui após o webhook receber mensagens.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      )}

      {setupError && (
        <div className="px-5 pt-3 max-w-[1680px] mx-auto w-full shrink-0">
          <Card className="border-warning/50 bg-warning/5">
            <CardHeader className="py-4">
              <CardTitle className="text-base">Banco do WhatsApp ainda não preparado</CardTitle>
              <CardDescription>{setupError}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      )}

      {status.data?.configured !== false && status.data?.webhookReady === false && (
        <div className="px-5 pt-3 max-w-[1680px] mx-auto w-full shrink-0">
          <Card className="border-warning/50 bg-warning/5">
            <CardHeader className="py-4">
              <CardTitle className="text-base">Webhook sem permissão de escrita</CardTitle>
              <CardDescription>
                Configure SUPABASE_SERVICE_ROLE_KEY nos secrets para o webhook criar leads e conversas automaticamente.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden p-4 max-w-[1680px] mx-auto w-full grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)_340px] gap-4">
        <Card className="overflow-hidden flex flex-col h-full min-h-0">
          <CardHeader className="border-b border-border">
            <CardTitle className="text-base flex items-center gap-2">
              <Inbox className="h-4 w-4 text-primary" /> Conversas
            </CardTitle>
            <div className="relative mt-2">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar conversa..." className="pl-9" />
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-y-auto flex-1 min-h-0 overscroll-contain">
            {conversationsQ.isLoading && (
              <div className="py-16 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            )}
            {!conversationsQ.isLoading && filtered.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-60" />
                Nenhuma conversa recebida ainda. Clique em Sincronizar chats para importar o histórico da Evolution, ou envie uma mensagem para o número conectado.
              </div>
            )}
            {filtered.map((item: any) => (
              <button
                key={item.id}
                onClick={() => selectConversation(item.id)}
                className={cn(
                  "w-full text-left p-4 border-b border-border hover:bg-surface/60 transition-colors",
                  selected?.id === item.id && "bg-primary/10",
                  item.handoff_required && "bg-warning/10",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/15 ring-1 ring-primary/25 flex items-center justify-center text-primary font-semibold">
                    {(getConversationName(item)?.[0] ?? item.phone?.[0] ?? "?").toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium truncate">{getConversationName(item)}</div>
                      {item.unread_count > 0 && <Badge className="text-[10px]">{item.unread_count}</Badge>}
                    </div>
                    {item.push_name && item.push_name !== item.display_name && (
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">Nome WhatsApp: {item.push_name}</div>
                    )}
                    <div className="text-xs text-muted-foreground truncate mt-0.5">{formatConversationPreview(item.last_message)}</div>
                    <div className="flex items-center gap-1.5 mt-2">
                      {item.handoff_required && <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">Aguardando humano</Badge>}
                      {item.bot_enabled && !item.bot_paused && <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">IA atendendo</Badge>}
                      {!item.lead_id && <Badge variant="outline" className="text-[10px]">Sem lead</Badge>}
                      {isAudioText(item.last_message) && <Badge variant="outline" className="text-[10px] gap-1"><Mic2 className="h-3 w-3" /> Audio</Badge>}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="overflow-hidden flex flex-col h-full min-h-0">
          {selected ? (
            <>
              <CardHeader className="border-b border-border">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">{getConversationName(selected)}</CardTitle>
                    <CardDescription className="space-y-0.5">
                      <div>{selected.phone || selected.remote_jid}</div>
                      {selected.push_name && (
                        <div className="text-[11px]">Nome cadastrado no WhatsApp: {selected.push_name}</div>
                      )}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="gap-1">
                    <Clock className="h-3 w-3" /> {selected.last_message_at ? new Date(selected.last_message_at).toLocaleString("pt-BR") : "Agora"}
                  </Badge>
                </div>
              </CardHeader>

              {selected.handoff_required && (
                <div className="mx-4 mt-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                  <div className="font-medium text-warning">Lead aguardando atendimento humano</div>
                  <div className="text-muted-foreground">{selected.handoff_reason || "A conversa precisa de um consultor."}</div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-background/40 min-h-0 overscroll-contain">
                {messagesQ.isLoading && (
                  <div className="py-16 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                )}
                {!messagesQ.isLoading && messages.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-16">Nenhuma mensagem nesta conversa.</div>
                )}
                {messages.map((item: any) => (
                  <div key={item.id} className={cn("flex", item.from_me ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[78%] rounded-2xl px-4 py-2 text-sm shadow-sm",
                      item.from_me
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-surface border border-border rounded-bl-md",
                    )}>
                      <MessageBody item={item} />
                      <div className={cn("text-[10px] mt-1", item.from_me ? "text-primary-foreground/70" : "text-muted-foreground")}>
                        {new Date(item.timestamp).toLocaleString("pt-BR")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-border p-4 space-y-3">
                {aiAnalysis && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                    <div className="mb-2 flex items-center gap-2 font-medium text-primary">
                      <Brain className="h-4 w-4" /> Analise da conversa
                    </div>
                    <div className="whitespace-pre-wrap break-words leading-relaxed text-foreground">{aiAnalysis}</div>
                  </div>
                )}
                <Textarea
                  rows={3}
                  placeholder="Digite sua mensagem... ou escreva Analisar para a IA avaliar a conversa."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">Envio manual. A IA nunca envia sem sua confirmação.</p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => analyzeMut.mutate()}
                      disabled={!selected?.id || analyzeMut.isPending}
                    >
                      {analyzeMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Brain className="h-4 w-4 mr-2" />}
                      Analisar
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => suggestMut.mutate()}
                      disabled={!selected?.id || suggestMut.isPending}
                    >
                      {suggestMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <WandSparkles className="h-4 w-4 mr-2" />}
                      Sugerir IA
                    </Button>
                    <Button onClick={handleSend} disabled={!message.trim() || sendMut.isPending || analyzeMut.isPending || (!connected && !currentMessageIsAnalyze)}>
                      <Send className="h-4 w-4 mr-2" /> {currentMessageIsAnalyze ? "Analisar" : sendMut.isPending ? "Enviando..." : "Enviar"}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-10 text-center text-muted-foreground">
              <div>
                <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-60" />
                Selecione uma conversa para atender.
              </div>
            </div>
          )}
        </Card>

        <div className="space-y-4 h-full overflow-y-auto min-h-0 pr-1 overscroll-contain">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <QrCode className="size-4" /> Conexão
              </CardTitle>
              <CardDescription>Escaneie o QR Code no WhatsApp &gt; Aparelhos conectados.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Button size="sm" onClick={() => qrMut.mutate()} disabled={qrMut.isPending || status.data?.configured === false}>
                  <RefreshCw className={cn("size-4 mr-2", qrMut.isPending && "animate-spin")} /> QR Code
                </Button>
                <Button size="sm" variant="outline" onClick={() => status.refetch()}>Status</Button>
              </div>
              {qr?.base64 && (
                <div className="flex flex-col items-center gap-2 p-3 border rounded-lg bg-muted/30">
                  <img
                    src={qr.base64.startsWith("data:") ? qr.base64 : `data:image/png;base64,${qr.base64}`}
                    alt="QR Code WhatsApp"
                    className="w-48 h-48"
                  />
                  {qr.code && <p className="text-[10px] text-muted-foreground font-mono break-all">{qr.code}</p>}
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                Webhook esperado: <span className="font-mono">/api/webhooks/evolution</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-primary" /> Lead vinculado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {selected?.lead ? (
                <>
                  <Info label="Contato WhatsApp" value={selected.push_name || selected.lead.contact_name || selected.display_name || "—"} />
                  <div>
                    <div className="text-xs text-muted-foreground">Empresa</div>
                    <div className="font-medium">{selected.lead.company?.nome_fantasia || selected.lead.company?.razao_social || selected.display_name}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Info label="Status" value={selected.lead.status} />
                    <Info label="Score" value={String(selected.lead.company?.score ?? "—")} />
                    <Info label="Segmento" value={selected.lead.company?.segmento ?? "—"} />
                    <Info label="Cidade" value={selected.lead.company?.cidade ? `${selected.lead.company.cidade}/${selected.lead.company.uf}` : "—"} />
                  </div>
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link to="/leads"><UserPlus className="h-4 w-4 mr-2" /> Abrir leads</Link>
                  </Button>
                </>
              ) : (
                <div className="text-muted-foreground">Esta conversa ainda não tem lead vinculado.</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="h-4 w-4 text-accent" /> IA e Bot
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <StatusRow label="Bot" value={selected?.bot_enabled ? "Ativo" : "Desligado"} />
              <StatusRow label="Modo" value={selected?.bot_mode ?? "off"} />
              <StatusRow label="IA" value={aiStatusQ.data?.ai?.mode === "real" ? aiStatusQ.data.ai.provider : "mock"} />
              <StatusRow label="Modelo" value={aiStatusQ.data?.ai?.model ?? "local"} />
              <StatusRow label="Handoff" value={selected?.handoff_required ? "Aguardando humano" : "Normal"} />
              <p className="text-xs text-muted-foreground pt-2">
                O copiloto sugere respostas no campo de mensagem. O vendedor revisa e envia manualmente.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="truncate">{value}</div>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <Badge variant="outline" className="capitalize">{value}</Badge>
    </div>
  );
}

function getConversationName(item: any) {
  return (
    item?.push_name ||
    item?.display_name ||
    item?.lead?.contact_name ||
    item?.lead?.company?.nome_fantasia ||
    item?.lead?.company?.razao_social ||
    item?.phone ||
    "Contato WhatsApp"
  );
}

function isAudioText(value?: string | null) {
  return String(value ?? "").toLowerCase().includes("audio") || String(value ?? "").toLowerCase().includes("áudio");
}

function formatConversationPreview(value?: string | null) {
  if (!value) return "Sem mensagens";
  return isAudioText(value) ? "Audio recebido" : value;
}

function getAudioUrl(item: any) {
  const payload = item?.raw_payload?.payload ?? item?.raw_payload;
  const message = payload?.message ?? payload?.payload?.message ?? payload?.data?.message;
  const audio = message?.audioMessage ?? payload?.audioMessage;
  const base64 = audio?.base64 ?? payload?.base64 ?? payload?.message?.base64;
  const mimetype = audio?.mimetype ?? payload?.mimetype ?? "audio/ogg";
  if (typeof base64 === "string" && base64.length > 80) {
    return base64.startsWith("data:") ? base64 : `data:${mimetype};base64,${base64}`;
  }
  const candidates = [
    item?.media_url,
    payload?.mediaUrl,
    payload?.media_url,
    payload?.url,
    audio?.mediaUrl,
    audio?.media_url,
    audio?.url,
  ];
  const url = candidates.find((candidate) => typeof candidate === "string" && /^https?:\/\//i.test(candidate));
  return typeof url === "string" ? url : null;
}

function MessageBody({ item }: { item: any }) {
  const mediaFn = useServerFn(getWhatsappMedia);
  const [loadedAudioUrl, setLoadedAudioUrl] = useState<string | null>(null);
  const isAudio = String(item?.message_type ?? "").toLowerCase().includes("audio") || isAudioText(item?.content);
  const audioUrl = loadedAudioUrl || (isAudio ? getAudioUrl(item) : null);
  const mediaMut = useMutation({
    mutationFn: () => mediaFn({ data: { messageId: item.id } }),
    onSuccess: (result) => {
      setLoadedAudioUrl(result.dataUrl);
      toast.success("Audio carregado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isAudio) {
    return (
      <div className="min-w-[220px] space-y-2">
        <div className="flex items-center gap-2 font-medium">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-background/70 text-foreground">
            {audioUrl ? <PlayCircle className="h-4 w-4" /> : <Mic2 className="h-4 w-4" />}
          </span>
          <span>Audio recebido</span>
        </div>
        {audioUrl ? (
          <audio controls src={audioUrl} className="w-full max-w-[280px]" />
        ) : (
          <>
            <Button
              size="sm"
              variant={item.from_me ? "secondary" : "outline"}
              className="h-8"
              onClick={() => mediaMut.mutate()}
              disabled={mediaMut.isPending}
            >
              {mediaMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5 mr-2" />}
              Carregar audio
            </Button>
            <div className={cn("text-xs", item.from_me ? "text-primary-foreground/75" : "text-muted-foreground")}>
              O audio fica protegido na Evolution. Clique para baixar e ouvir no CRM.
            </div>
          </>
        )}
      </div>
    );
  }

  return <div className="whitespace-pre-wrap break-words">{item.content}</div>;
}
