## Fase 4 — IA com DeepSeek (via OpenRouter)

### Passo 0 — Segurança (você faz)
1. **Revogue agora** qualquer chave OpenRouter que tenha sido exposta em chat ou logs.
2. Gere uma **chave nova** em https://openrouter.ai/keys.
3. Quando eu pedir, cole no formulário de secret seguro (`OPENROUTER_API_KEY`). Nunca mais cole chave direto no chat.

### Passo 1 — Infra de IA

**Secret:** `OPENROUTER_API_KEY` (via `add_secret` — formulário seguro).

**Helper `src/lib/ai.server.ts`:**
- Cliente OpenAI-compatible apontando para `https://openrouter.ai/api/v1`.
- Função `callDeepSeek({ system, user, json? })` usando modelo `deepseek/deepseek-chat` (rápido/barato) por padrão.
- Suporte a resposta JSON estruturada (`response_format: { type: "json_object" }`).
- Headers `HTTP-Referer` e `X-Title` recomendados pela OpenRouter.
- Tratamento de erros 429 (rate limit) e 402 (créditos).

### Passo 2 — Server functions (`src/lib/ai.functions.ts`)

Todas com `requireSupabaseAuth` + Zod + ownership check no `lead_id`.

1. **`generateWhatsappMessage({ leadId, objetivo? })`**
   - Carrega lead + empresa (nome, segmento, cidade, porte, CNAE).
   - Prompt monta abordagem comercial personalizada em PT-BR, tom consultivo, máx 4 linhas, com gancho específico do segmento.
   - Retorna `{ message: string }`.

2. **`fillTemplate({ leadId, template })`**
   - Recebe template livre com variáveis `{{empresa}}`, `{{cidade}}`, `{{segmento}}`, `{{nome_contato}}` etc.
   - IA preenche variáveis usando dados da empresa + adapta tom ao contexto (não só substitui — refina a frase).
   - Retorna `{ message: string }`.

3. **`analyzeLead({ leadId })`**
   - IA avalia: porte + segmento + situação cadastral + score + notas atuais.
   - Retorna JSON estruturado: `{ scoreQualitativo: 0-100, classificacao: "quente"|"morno"|"frio", proximaAcao: string, justificativa: string, sinaisDeAlerta: string[] }`.
   - Salva resultado em coluna nova `leads.ai_analysis` (JSONB) + `ai_analyzed_at` (timestamp) para cache.

4. **`summarizeConversation({ leadId })`**
   - Stub funcional agora (lê `leads.notas` + futuras mensagens WhatsApp da Fase 3).
   - Retorna `{ resumo, statusNegociacao, proximosPassos }`.
   - Fica pronto para quando o histórico de WhatsApp existir.

### Passo 3 — Migração mínima

```sql
ALTER TABLE leads
  ADD COLUMN ai_analysis JSONB,
  ADD COLUMN ai_analyzed_at TIMESTAMPTZ;
```

### Passo 4 — UI (apenas integração nos lugares certos)

**a) No drawer/detalhe do lead (Funil + Leads):**
- Botão **"Analisar com IA"** → chama `analyzeLead`, mostra card com score qualitativo, classificação (badge colorido), próxima ação, justificativa e alertas. Cache visível ("Analisado há X min").
- Botão **"Gerar mensagem WhatsApp"** → chama `generateWhatsappMessage`, abre modal com mensagem editável + botão "Copiar" e "Enviar via WhatsApp" (usa `sendWhatsappMessage` já existente se telefone disponível).

**b) Nova página `/templates` (substitui o placeholder Soon):**
- Lista de templates simples (estado local + localStorage por enquanto — sem nova tabela ainda).
- Editor de template com variáveis.
- Botão **"Testar com lead..."** → seleciona um lead, chama `fillTemplate`, mostra preview.

**c) Indicador de IA na lista de leads:**
- Coluna/badge mostrando classificação IA quando já analisado (🔥 quente / 🌡️ morno / ❄️ frio).

### Passo 5 — Validação
- Testar cada server function via UI logada.
- Conferir logs server-side com `server-function-logs` se algo falhar.
- Confirmar que `OPENROUTER_API_KEY` não vaza para o client (só `process.env` dentro de `.handler`).

### O que NÃO entra nesta fase
- Tabela `message_templates` persistente no DB (fica em localStorage agora, vira tabela na Fase 3 WhatsApp).
- Histórico real de conversas WhatsApp (Fase 3).
- Streaming de respostas (resposta única é suficiente para esses casos).
- Automações ("ao mudar status, gerar mensagem") — Fase 5.

### Detalhes técnicos
- Modelo padrão: `deepseek/deepseek-chat` (rápido, barato, ótimo PT-BR).
- Modelo para `analyzeLead`: `deepseek/deepseek-chat` com `response_format: json_object` + validação Zod do retorno.
- Timeout de 30s nas chamadas IA; fallback de erro amigável na UI.
- Toast de erro específico para 429/402 (sugerir rever créditos OpenRouter).

---

**Confirma para eu implementar?** Logo no início, vou pedir o `OPENROUTER_API_KEY` via formulário seguro (depois que você gerar a nova chave).
