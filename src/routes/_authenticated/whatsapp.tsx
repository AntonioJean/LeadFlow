import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  MessageSquare, QrCode, Send, RefreshCw, CheckCircle2, AlertCircle,
  Search, UserPlus, Bot, Clock, Phone, Building2, Loader2, Inbox,
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
} from "@/lib/whatsapp.functions";

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
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
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

  const readMut = useMutation({
    mutationFn: (conversationId: string) => readFn({ data: { conversationId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-conversations"] }),
  });

  const state = status.data?.state;
  const connected = state === "open" || state === "connected";
  const conversations = conversationsQ.data?.conversations ?? [];
  const filtered = conversations.filter((item: any) => {
    const text = `${item.display_name ?? ""} ${item.phone ?? ""} ${item.last_message ?? ""}`.toLowerCase();
    return text.includes(query.toLowerCase());
  });
  const messages = messagesQ.data?.messages ?? [];

  function selectConversation(id: string) {
    setSelectedId(id);
    readMut.mutate(id);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-radar-grad border-b border-border">
        <div className="px-6 py-6 max-w-[1800px] mx-auto">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-sm text-primary mb-1">
                <MessageSquare className="h-4 w-4" /> Central WhatsApp
              </div>
              <h1 className="text-3xl font-bold tracking-tight">WhatsApp Chat</h1>
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
            </div>
          </div>
        </div>
      </div>

      {status.data?.configured === false && (
        <div className="px-6 pt-4 max-w-[1800px] mx-auto w-full">
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

      <div className="flex-1 p-4 max-w-[1800px] mx-auto w-full grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)_340px] gap-4 min-h-0">
        <Card className="overflow-hidden flex flex-col min-h-[680px]">
          <CardHeader className="border-b border-border">
            <CardTitle className="text-base flex items-center gap-2">
              <Inbox className="h-4 w-4 text-primary" /> Conversas
            </CardTitle>
            <div className="relative mt-2">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar conversa..." className="pl-9" />
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-y-auto flex-1">
            {conversationsQ.isLoading && (
              <div className="py-16 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            )}
            {!conversationsQ.isLoading && filtered.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-60" />
                Nenhuma conversa recebida ainda. Envie uma mensagem para o número conectado ou configure o webhook da Evolution.
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
                    {(item.display_name?.[0] ?? item.phone?.[0] ?? "?").toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium truncate">{item.display_name || item.phone || "Contato WhatsApp"}</div>
                      {item.unread_count > 0 && <Badge className="text-[10px]">{item.unread_count}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">{item.last_message || "Sem mensagens"}</div>
                    <div className="flex items-center gap-1.5 mt-2">
                      {item.handoff_required && <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">Aguardando humano</Badge>}
                      {item.bot_enabled && !item.bot_paused && <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">IA atendendo</Badge>}
                      {!item.lead_id && <Badge variant="outline" className="text-[10px]">Sem lead</Badge>}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="overflow-hidden flex flex-col min-h-[680px]">
          {selected ? (
            <>
              <CardHeader className="border-b border-border">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{selected.display_name || selected.phone}</CardTitle>
                    <CardDescription>{selected.phone || selected.remote_jid}</CardDescription>
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

              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-background/40">
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
                      <div className="whitespace-pre-wrap break-words">{item.content}</div>
                      <div className={cn("text-[10px] mt-1", item.from_me ? "text-primary-foreground/70" : "text-muted-foreground")}>
                        {new Date(item.timestamp).toLocaleString("pt-BR")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-border p-4 space-y-3">
                <Textarea
                  rows={3}
                  placeholder="Digite sua mensagem..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">Envio manual. A IA nunca envia sem sua confirmação.</p>
                  <Button onClick={() => sendMut.mutate()} disabled={!message.trim() || sendMut.isPending || !connected}>
                    <Send className="h-4 w-4 mr-2" /> {sendMut.isPending ? "Enviando..." : "Enviar"}
                  </Button>
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

        <div className="space-y-4">
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
              <StatusRow label="Handoff" value={selected?.handoff_required ? "Aguardando humano" : "Normal"} />
              <p className="text-xs text-muted-foreground pt-2">
                Copiloto IA e handoff automático entram na próxima etapa mantendo este mesmo painel.
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
