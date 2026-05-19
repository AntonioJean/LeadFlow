import { createFileRoute } from "@tanstack/react-router";
import { parseEvolutionPayload, persistIncomingEvolutionMessage } from "@/lib/whatsapp.core";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function normalizeEvent(raw?: string) {
  return raw?.replace(/_/g, "-").replace(/\./g, "-").toLowerCase();
}

export const Route = createFileRoute("/api/webhooks/evolution/$")({
  server: {
    handlers: {
      GET: async ({ params }) => json({ ok: true, endpoint: "evolution-webhook", event: normalizeEvent(params._splat) }),
      POST: async ({ request, params }) => {
        let payload: any;
        try {
          payload = await request.json();
        } catch {
          return json({ ok: false, error: "Payload inválido." }, 400);
        }

        const event = normalizeEvent(params._splat);
        try {
          const messages = parseEvolutionPayload(payload, event);
          const results = [];
          for (const message of messages) {
            results.push(await persistIncomingEvolutionMessage(message));
          }
          return json({ ok: true, event, received: messages.length, results });
        } catch (error) {
          console.error("[EvolutionWebhook]", error instanceof Error ? error.message : error);
          return json({ ok: false, event, error: error instanceof Error ? error.message : "Erro ao processar webhook." }, 200);
        }
      },
    },
  },
});
