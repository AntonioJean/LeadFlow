import { createFileRoute } from "@tanstack/react-router";
import { parseEvolutionPayload, persistIncomingEvolutionMessage } from "@/lib/whatsapp.core";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleEvolutionWebhook(request: Request, event?: string) {
  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "Payload inválido." }, 400);
  }

  try {
    const messages = parseEvolutionPayload(payload, event);
    const results = [];
    for (const message of messages) {
      results.push(await persistIncomingEvolutionMessage(message));
    }
    return json({ ok: true, event: event ?? payload?.event ?? payload?.type ?? null, received: messages.length, results });
  } catch (error) {
    console.error("[EvolutionWebhook]", error instanceof Error ? error.message : error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Erro ao processar webhook." }, 200);
  }
}

export const Route = createFileRoute("/api/webhooks/evolution")({
  server: {
    handlers: {
      GET: async () => json({ ok: true, endpoint: "evolution-webhook" }),
      POST: async ({ request }) => handleEvolutionWebhook(request),
    },
  },
});
