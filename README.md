# Dev Agent

Agente autônomo que resolve issues do GitLab e GitHub usando Claude Code CLI. Quando um maintainer adiciona a label `ai-fix` a uma issue, o sistema clona o repositório, implementa a solução, roda testes e abre um Merge Request/Pull Request automaticamente.

## Pré-requisitos

- Docker e Docker Compose
- Conta Tailscale com Funnel habilitado
- Token OAuth do Claude Code (`claude setup-token`)
- Tokens de acesso: GitLab (PRIVATE-TOKEN) e/ou GitHub (PAT)

## Setup

1. Clone o repositório:

```bash
git clone <repo-url> dev-agent
cd dev-agent
```

2. Copie e configure as variáveis de ambiente:

```bash
cp .env.example .env
# Edite .env com seus tokens e secrets
```

3. Suba os containers:

```bash
docker compose up -d
```

4. Verifique se o Tailscale Funnel está ativo:

```bash
docker compose logs tailscale
```

O domínio público será algo como `https://dev-agent.<seu-tailnet>.ts.net`.

## Configuração de Webhook

### GitLab

1. Vá em **Settings → Webhooks** do projeto ou grupo
2. URL: `https://dev-agent.<seu-tailnet>.ts.net/webhook`
3. Secret token: mesmo valor de `GITLAB_SECRET` no `.env`
4. Trigger: **Issue events**

### GitHub

1. Vá em **Settings → Webhooks** do repositório ou organização
2. Payload URL: `https://dev-agent.<seu-tailnet>.ts.net/webhook`
3. Content type: `application/json`
4. Secret: mesmo valor de `GITHUB_WEBHOOK_SECRET` no `.env`
5. Events: selecione **Issues**

## Uso

1. Crie ou encontre uma issue no GitLab/GitHub
2. Adicione a label `ai-fix` à issue
3. O agente automaticamente:
   - Comenta na issue que iniciou o trabalho
   - Clona o repositório
   - Cria branch `fix/issue-{id}`
   - Implementa a correção
   - Roda testes
   - Abre um MR/PR
   - Comenta na issue com o resultado

**Importante:** apenas usuários listados em `ALLOWED_USERS` podem acionar o agente.

## Monitoramento

Acompanhe os logs em tempo real:

```bash
docker compose logs -f automation
```

Os logs incluem:
- Webhooks recebidos e validação
- Início e fim de cada execução
- Duração e exit code do Claude Code
- Erros de API ou timeout

## Variáveis de Ambiente

| Variável | Descrição |
|---|---|
| `TS_AUTHKEY` | Chave de autenticação do Tailscale |
| `GITLAB_SECRET` | Secret do webhook do GitLab |
| `GITLAB_TOKEN` | Token de acesso à API do GitLab |
| `GITHUB_WEBHOOK_SECRET` | Secret do webhook do GitHub |
| `GITHUB_TOKEN` | Token de acesso à API do GitHub |
| `CLAUDE_CODE_OAUTH_TOKEN` | Token OAuth do Claude Code |
| `ALLOWED_USERS` | Usuários autorizados (separados por vírgula) |

## Notas

- O token OAuth do Claude Code expira em ~1 ano. Renove com `claude setup-token` e atualize o `.env`.
- A fila é em memória — se o container reiniciar, issues pendentes são perdidas. Re-adicione a label para re-acionar.
- Timeout de 30 minutos por execução. Issues complexas podem precisar de intervenção manual.
- Todo MR/PR gerado deve ser revisado por um humano antes do merge.
