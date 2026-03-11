# Dev Agent

Agente autônomo que resolve issues do GitLab e GitHub usando Claude Code CLI. Quando um maintainer adiciona a label `ai-fix` a uma issue, o sistema clona o repositório, implementa a solução, roda testes e abre um Merge Request/Pull Request automaticamente.

## Pré-requisitos

- Docker e Docker Compose
- Conta Tailscale com Funnel habilitado
- Token OAuth do Claude Code (`claude setup-token`)
- Tokens de acesso: GitLab (PRIVATE-TOKEN) e/ou GitHub (PAT)

## Setup

### 1. Clone o repositório

```bash
git clone <repo-url> dev-agent
cd dev-agent
```

### 2. Configure o Tailscale

O Tailscale Funnel expõe o webhook publicamente sem precisar de IP fixo ou port forwarding.

**2.1. Crie uma conta** em [https://tailscale.com](https://tailscale.com) (login via Google, GitHub, Microsoft, etc.)

**2.2. Habilite o Funnel no tailnet:**
- Acesse [https://login.tailscale.com/admin/acls](https://login.tailscale.com/admin/acls)
- Adicione no ACL policy (seção `nodeAttrs`):

```json
"nodeAttrs": [
  {
    "target": ["autogroup:member"],
    "attr": ["funnel"]
  }
]
```

**2.3. Gere uma Auth Key:**
- Acesse [https://login.tailscale.com/admin/settings/keys](https://login.tailscale.com/admin/settings/keys)
- Clique em **Generate auth key**
- Marque as opções:
  - **Reusable**: sim (para que o container possa reiniciar)
  - **Ephemeral**: não
  - **Tags**: opcional
- Copie a chave gerada (formato `tskey-auth-xxxxx`)

**2.4. Copie a chave para o `.env`:**

```bash
cp .env.example .env
# Edite .env e cole a auth key em TS_AUTHKEY
```

### 3. Configure os tokens

Edite o `.env` com os demais tokens necessários:

- **GITLAB_SECRET / GITHUB_WEBHOOK_SECRET**: crie um secret aleatório (ex: `openssl rand -hex 32`)
- **GITLAB_TOKEN**: gere em GitLab → Settings → Access Tokens (scopes: `api`)
- **GITHUB_TOKEN**: gere em GitHub → Settings → Developer settings → Personal access tokens (scopes: `repo`)
- **CLAUDE_CODE_OAUTH_TOKEN**: execute `claude setup-token` e copie o token gerado
- **ALLOWED_USERS**: seus usernames do GitLab/GitHub separados por vírgula

### 4. Suba os containers

```bash
docker compose up -d
```

### 5. Verifique o Tailscale Funnel

```bash
# Verifique se o Tailscale conectou e o Funnel está ativo
docker compose logs tailscale

# O domínio público será algo como:
# https://dev-agent.<seu-tailnet>.ts.net
```

Para testar se o webhook está acessível:

```bash
curl -s https://dev-agent.<seu-tailnet>.ts.net/webhook
# Deve retornar: {"error":"Not found"} (porque é GET, não POST)
```

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
