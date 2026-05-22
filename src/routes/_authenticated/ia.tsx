import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bot, Loader2, Send, Sparkles, MessageSquareText, Flame,
  FileText, CalendarPlus, ShieldCheck, WandSparkles,
} from "lucide-react";
import { aiStatus, chatWithAi } from "@/lib/ai.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ia")({ component: AiAgentPage });

type ChatItem = {
  role: "user" | "assistant";
  content: string;
};

const QUICK_ACTIONS = [
  {
    title: "Primeiro contato",
    icon: MessageSquareText,
    prompt: "Crie uma mensagem curta de primeiro contato para WhatsApp para um lead comercial da Softcom.",
  },
  {
    title: "Lead quente?",
    icon: Flame,
    prompt: "Explique como avaliar se um lead da Softcom esta quente e quais sinais procurar na conversa.",
  },
  {
    title: "Objeção de preço",
    icon: ShieldCheck,
    prompt: "Crie uma resposta consultiva para cliente que perguntou preco, sem informar valores e conduzindo para diagnostico.",
  },
  {
    title: "Follow-up",
    icon: CalendarPlus,
    prompt: "Crie um follow-up leve para um cliente que nao respondeu depois do primeiro contato.",
  },
  {
    title: "Texto de proposta",
    icon: FileText,
    prompt: "Crie um resumo comercial de proposta da Softcom para um mercadinho interessado em PDV, estoque e emissao fiscal.",
  },
  {
    title: "Mais persuasiva",
    icon: WandSparkles,
    prompt: "Reescreva uma abordagem comercial da Softcom em tom mais persuasivo, natural e curto para WhatsApp.",
  },
] as const;

function AiAgentPage() {
  const statusFn = useServerFn(aiStatus);
  const chatFn = useServerFn(chatWithAi);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<ChatItem[]>([
    {
      role: "assistant",
      content: "Oi! Sou o copiloto comercial da Softcom. Posso criar mensagens, contornar objecoes, sugerir proximos passos e ajudar com propostas. A decisao e o envio continuam sempre com o vendedor.",
    },
  ]);

  const statusQ = useQuery({ queryKey: ["ai-status"], queryFn: () => statusFn() });

  const modeLabel = useMemo(() => {
    const ai = statusQ.data?.ai;
    if (!ai) return "Carregando";
    return ai.mode === "real" ? "Real" : "Local";
  }, [statusQ.data]);

  const chatMut = useMutation({
    mutationFn: async (text: string) => chatFn({ data: { message: text } }),
    onSuccess: (result) => {
      setChat((items) => [...items, { role: "assistant", content: result.answer }]);
      if (result.fallbackReason) {
        toast.warning("Provedor de IA indisponivel no momento. Usei fallback local para nao travar o teste.");
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const send = (text = message) => {
    const trimmed = text.trim();
    if (!trimmed || chatMut.isPending) return;
    setChat((items) => [...items, { role: "user", content: trimmed }]);
    setMessage("");
    chatMut.mutate(trimmed);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-radar-grad border-b border-border">
        <div className="px-6 py-6 max-w-[1600px] mx-auto">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm text-primary mb-1">
                <Bot className="h-4 w-4" /> Copiloto comercial
              </div>
              <h1 className="text-3xl font-bold tracking-tight">Agente IA</h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                Gere respostas, analise abordagens e prepare proximas acoes para vender melhor com a Softcom.
              </p>
            </div>
            <Card className="px-4 py-3 bg-card/70 backdrop-blur min-w-72">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Status da IA</div>
                  <div className="text-sm font-semibold">
                    {statusQ.data?.ai?.provider ?? "mock"} · {statusQ.data?.ai?.model ?? "local"}
                  </div>
                </div>
                <Badge className={cn(statusQ.data?.ai?.mode === "real" ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground")}>
                  {modeLabel}
                </Badge>
              </div>
            </Card>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 max-w-[1600px] mx-auto grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-4">
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">Acoes rapidas</h2>
            </div>
            <div className="grid gap-2">
              {QUICK_ACTIONS.map((action) => (
                <Button
                  key={action.title}
                  variant="outline"
                  className="justify-start h-auto py-3"
                  onClick={() => send(action.prompt)}
                  disabled={chatMut.isPending}
                >
                  <action.icon className="h-4 w-4 mr-2 text-primary" />
                  {action.title}
                </Button>
              ))}
            </div>
          </Card>

          <Card className="p-4 border-primary/20">
            <h2 className="font-semibold mb-2">Seguranca comercial</h2>
            <p className="text-sm text-muted-foreground">
              A IA apenas sugere textos e analises. Ela nao envia mensagens, nao informa precos e nao fecha venda automaticamente.
            </p>
          </Card>
        </div>

        <Card className="flex min-h-[620px] flex-col overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-semibold">Conversa com o copiloto</h2>
            <p className="text-xs text-muted-foreground">Use contexto real de leads ou cole trechos da conversa para pedir ajuda.</p>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-5 bg-surface/30">
            {chat.map((item, index) => (
              <div key={index} className={cn("flex", item.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
                    item.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-card border border-border rounded-bl-sm",
                  )}
                >
                  <div className="whitespace-pre-wrap break-words">{item.content}</div>
                </div>
              </div>
            ))}
            {chatMut.isPending && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-card border border-border px-4 py-3 text-sm flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Pensando na melhor abordagem...
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border p-4">
            <div className="flex gap-2">
              <Textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Ex: Como respondo um cliente que disse que ja tem sistema?"
                className="min-h-20 resize-none"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) send();
                }}
              />
              <Button className="h-20 px-5" onClick={() => send()} disabled={!message.trim() || chatMut.isPending}>
                {chatMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Dica: Ctrl+Enter envia para a IA.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
