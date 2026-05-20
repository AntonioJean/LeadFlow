# LeadFlow

CRM de prospecção comercial com Supabase, WhatsApp via Evolution API e Radar IA.

## Rodar o CRM

```bash
npm install
npm run dev
```

Variáveis principais do `.env`:

```env
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
VITE_SUPABASE_PROJECT_ID=
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=

EVOLUTION_API_URL=
EVOLUTION_API_KEY=
EVOLUTION_INSTANCE=leadflow
EVOLUTION_WEBHOOK_URL=
EVOLUTION_WEBHOOK_SECRET=
```

## Evolution API

A infraestrutura da Evolution fica em [infra/evolution](C:/Users/suporte/Documents/Codex/2026-05-15/quero-que-leve-o-tempo-que/_lovable_prospector_compass/prospector-s-compass-main/infra/evolution).

Para subir local:

```bash
cd infra/evolution
cp .env.example .env
docker compose up -d
```

Para testar do CRM:

```bash
npm run evolution:check
```

Com a Evolution online, abra `WhatsApp` no CRM e gere o QR Code.

## Webhook

O CRM aceita:

```txt
/api/webhooks/evolution
/api/webhooks/evolution/:event
```

Na Evolution, configure:

```env
WEBHOOK_GLOBAL_ENABLED=true
WEBHOOK_GLOBAL_URL=https://seu-crm.com/api/webhooks/evolution
WEBHOOK_GLOBAL_WEBHOOK_BY_EVENTS=true
WEBHOOK_EVENTS_MESSAGES_UPSERT=true
WEBHOOK_EVENTS_MESSAGES_UPDATE=true
WEBHOOK_EVENTS_CONNECTION_UPDATE=true
```

Se o CRM estiver local, exponha com tunnel HTTPS ou use `host.docker.internal` quando a Evolution também estiver local em Docker.
