# Evolution API para LeadFlow

Esta pasta sobe uma Evolution API com Postgres e Redis via Docker Compose. Ela serve para rodar localmente ou em uma VPS gratuita.

## 1. Subir local

```bash
cd infra/evolution
cp .env.example .env
docker compose up -d
docker compose logs -f evolution-api
```

Teste:

```bash
curl http://localhost:8080
curl -H "apikey: change-this-local-api-key" http://localhost:8080/instance/fetchInstances
```

No `.env` principal do CRM, use:

```env
EVOLUTION_API_URL="http://localhost:8080"
EVOLUTION_API_KEY="change-this-local-api-key"
EVOLUTION_INSTANCE="leadflow"
EVOLUTION_WEBHOOK_URL="http://host.docker.internal:5173/api/webhooks/evolution"
```

## 2. Subir em VPS gratuita

Recomendado: Oracle Cloud Always Free ou outra VPS que fique ligada 24/7.

Na VPS:

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg git
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Saia e entre de novo no SSH. Depois:

```bash
git clone https://github.com/AntonioJean/LeadFlow.git
cd LeadFlow/infra/evolution
cp .env.example .env
nano .env
docker compose up -d
```

Altere no `infra/evolution/.env`:

```env
SERVER_URL=https://evolution.seudominio.com
AUTHENTICATION_API_KEY=uma-chave-longa-e-secreta
POSTGRES_PASSWORD=uma-senha-forte
DATABASE_CONNECTION_URI=postgresql://evolution:uma-senha-forte@postgres:5432/evolution?schema=public
WEBHOOK_GLOBAL_URL=https://seu-crm.com/api/webhooks/evolution
```

Se o CRM ainda estiver local, use um tunnel HTTPS e coloque a URL pública do tunnel em `WEBHOOK_GLOBAL_URL`.

## 3. Configurar CRM

No `.env` principal do CRM:

```env
EVOLUTION_API_URL="https://evolution.seudominio.com"
EVOLUTION_API_KEY="mesma-chave-do-AUTHENTICATION_API_KEY"
EVOLUTION_INSTANCE="leadflow"
EVOLUTION_WEBHOOK_URL="https://seu-crm.com/api/webhooks/evolution"
EVOLUTION_WEBHOOK_SECRET="leadflow-local-webhook-secret"
```

Também preencha:

```env
SUPABASE_SERVICE_ROLE_KEY="sua-service-role-key"
```

Sem `SUPABASE_SERVICE_ROLE_KEY`, o webhook até responde, mas não consegue criar conversas/leads no banco.

## 4. QR Code

Com a Evolution online e o CRM rodando:

1. Entre no CRM.
2. Abra `WhatsApp`.
3. Clique em `QR Code`.
4. Escaneie com WhatsApp > Aparelhos conectados.

## 5. Observações

- O bot IA permanece desligado por padrão no CRM.
- Não exponha `AUTHENTICATION_API_KEY` em frontend.
- Se usar `WEBHOOK_GLOBAL_WEBHOOK_BY_EVENTS=true`, a Evolution chama URLs com o evento no final. O CRM já aceita `/api/webhooks/evolution/:event`.
- Se usar `WEBHOOK_GLOBAL_WEBHOOK_BY_EVENTS=false`, a Evolution chama apenas `/api/webhooks/evolution`. O CRM também aceita.
