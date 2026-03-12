# Dev Agent

Autonomous agent that resolves GitLab and GitHub issues using Claude Code CLI. When a maintainer adds the `ai-fix` label to an issue, the system clones the repository, implements a solution through a Spec-Driven Development (SDD) pipeline, runs tests, and opens a Merge Request/Pull Request automatically.

## How It Works

1. A webhook fires when the `ai-fix` label is added to an issue
2. The server validates the request and enqueues the job
3. Claude Code executes 5 sequential SDD phases:
   - **Requirements** — generates `REQUIREMENTS.md`
   - **Design** — generates `DESIGN.md`
   - **Tasks** — generates `TASKS.md`
   - **Implementation** — executes tasks with atomic commits
   - **Finalize** — pushes the branch and opens a MR/PR
4. Each phase produces spec documents that feed the next phase
5. The agent comments on the issue with progress and results

> **Note:** Only users listed in `ALLOWED_USERS` can trigger the agent.

## Prerequisites

- Docker and Docker Compose
- Tailscale account with Funnel enabled
- Claude Code OAuth token (`claude setup-token`)
- Access tokens: GitLab (PRIVATE-TOKEN) and/or GitHub (PAT)

## Setup

### 1. Clone the repository

```bash
git clone <repo-url> dev-agent
cd dev-agent
```

### 2. Configure Tailscale

Tailscale Funnel exposes the webhook publicly without a static IP or port forwarding.

**2.1. Create an account** at [https://tailscale.com](https://tailscale.com) (login via Google, GitHub, Microsoft, etc.)

**2.2. Enable Funnel on your tailnet:**
- Go to [https://login.tailscale.com/admin/acls](https://login.tailscale.com/admin/acls)
- Add to the ACL policy (`nodeAttrs` section):

```json
"nodeAttrs": [
  {
    "target": ["autogroup:member"],
    "attr": ["funnel"]
  }
]
```

**2.3. Generate an Auth Key:**
- Go to [https://login.tailscale.com/admin/settings/keys](https://login.tailscale.com/admin/settings/keys)
- Click **Generate auth key**
- Options:
  - **Reusable**: yes (so the container can restart)
  - **Ephemeral**: no
  - **Tags**: optional
- Copy the generated key (format: `tskey-auth-xxxxx`)

**2.4. Copy the key to `.env`:**

```bash
cp .env.example .env
# Edit .env and paste the auth key in TS_AUTHKEY
```

### 3. Configure tokens

Edit `.env` with the remaining tokens:

- **GITLAB_SECRET / GITHUB_WEBHOOK_SECRET**: create a random secret (e.g., `openssl rand -hex 32`)
- **GITLAB_TOKEN**: generate at GitLab → Settings → Access Tokens (scopes: `api`)
- **GITHUB_TOKEN**: generate at GitHub → Settings → Developer settings → Personal access tokens (scopes: `repo`)
- **CLAUDE_CODE_OAUTH_TOKEN**: run `claude setup-token` and copy the generated token
- **ALLOWED_USERS**: your GitLab/GitHub usernames, comma-separated

### 4. Start the containers

```bash
docker compose up -d
```

### 5. Verify Tailscale Funnel

```bash
# Check that Tailscale connected and Funnel is active
docker compose logs tailscale

# The public domain will be something like:
# https://dev-agent.<your-tailnet>.ts.net
```

To test if the webhook is reachable:

```bash
curl -s https://dev-agent.<your-tailnet>.ts.net/webhook
# Should return: {"error":"Not found"} (because it's GET, not POST)
```

## Webhook Configuration

### GitLab

1. Go to **Settings → Webhooks** (project or group level)
2. URL: `https://dev-agent.<your-tailnet>.ts.net/webhook`
3. Secret token: same value as `GITLAB_SECRET` in `.env`
4. Trigger: **Issue events**

### GitHub

1. Go to **Settings → Webhooks** (repository or organization level)
2. Payload URL: `https://dev-agent.<your-tailnet>.ts.net/webhook`
3. Content type: `application/json`
4. Secret: same value as `GITHUB_WEBHOOK_SECRET` in `.env`
5. Events: select **Issues**

## Usage

1. Create or find an issue on GitLab/GitHub
2. Add the `ai-fix` label to the issue
3. The agent automatically:
   - Comments on the issue that work has started
   - Clones the repository
   - Creates branch `fix/issue-{id}`
   - Runs the SDD pipeline (Requirements → Design → Tasks → Implementation → Finalize)
   - Opens a MR/PR
   - Comments on the issue with the result

## Architecture

```
dev-agent/
├── automation/
│   ├── server.js       # HTTP server, job queue, webhook handling
│   ├── prompts.js      # SDD pipeline prompt builders (5 phases)
│   ├── jobStore.js     # JSON-based job persistence
│   └── Dockerfile      # Node.js 22+ Alpine container
├── tailscale-config/   # Funnel configuration
├── docker-compose.yml  # 2 services: automation + tailscale
└── .env.example        # Environment variables template
```

**Key design decisions:**
- **Sequential job queue** — issues are processed one at a time to avoid resource contention
- **Job persistence** — jobs are stored in `jobs.json` and survive container restarts
- **HMAC-SHA256 validation** (GitHub) and token validation (GitLab) for webhook security
- **30-minute timeout** per phase with retry mechanism

## Monitoring

Follow logs in real time:

```bash
docker compose logs -f automation
```

Logs include:
- Received webhooks and validation status
- Start and end of each SDD phase
- Duration and exit code of Claude Code
- API errors or timeouts

## Environment Variables

| Variable | Description |
|---|---|
| `TS_AUTHKEY` | Tailscale authentication key |
| `GITLAB_SECRET` | GitLab webhook secret |
| `GITLAB_TOKEN` | GitLab API access token |
| `GITHUB_WEBHOOK_SECRET` | GitHub webhook secret |
| `GITHUB_TOKEN` | GitHub API access token |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Code OAuth token |
| `ALLOWED_USERS` | Authorized users (comma-separated) |

## Notes

- The Claude Code OAuth token expires in ~1 year. Renew with `claude setup-token` and update `.env`.
- Timeout is 30 minutes per SDD phase. Complex issues may require manual intervention.
- Every generated MR/PR must be reviewed by a human before merging.

---

## Anexo — Documentação em Português (pt-BR)

### O que é o Dev Agent?

Agente autônomo que resolve issues do GitLab e GitHub usando Claude Code CLI. Quando um maintainer adiciona a label `ai-fix` a uma issue, o sistema clona o repositório, implementa a solução através de um pipeline de Desenvolvimento Orientado a Especificações (SDD), roda testes e abre um Merge Request/Pull Request automaticamente.

### Como Funciona

1. Um webhook é disparado quando a label `ai-fix` é adicionada a uma issue
2. O servidor valida a requisição e enfileira o job
3. O Claude Code executa 5 fases sequenciais do SDD:
   - **Requisitos** — gera `REQUIREMENTS.md`
   - **Design** — gera `DESIGN.md`
   - **Tarefas** — gera `TASKS.md`
   - **Implementação** — executa as tarefas com commits atômicos
   - **Finalização** — faz push da branch e abre MR/PR
4. Cada fase produz documentos de especificação que alimentam a próxima
5. O agente comenta na issue com progresso e resultados

### Pré-requisitos

- Docker e Docker Compose
- Conta Tailscale com Funnel habilitado
- Token OAuth do Claude Code (`claude setup-token`)
- Tokens de acesso: GitLab (PRIVATE-TOKEN) e/ou GitHub (PAT)

### Início Rápido

```bash
# 1. Clone o repositório
git clone <repo-url> dev-agent && cd dev-agent

# 2. Configure o ambiente
cp .env.example .env
# Edite .env com seus tokens

# 3. Suba os containers
docker compose up -d

# 4. Verifique os logs
docker compose logs -f automation
```

### Configuração do Webhook

**GitLab:** Settings → Webhooks → URL: `https://dev-agent.<seu-tailnet>.ts.net/webhook` → Trigger: Issue events

**GitHub:** Settings → Webhooks → Payload URL: `https://dev-agent.<seu-tailnet>.ts.net/webhook` → Content type: `application/json` → Events: Issues

### Uso

1. Crie ou encontre uma issue no GitLab/GitHub
2. Adicione a label `ai-fix`
3. O agente automaticamente clona, implementa, testa e abre um MR/PR
4. Revise o MR/PR antes de fazer merge

### Variáveis de Ambiente

| Variável | Descrição |
|---|---|
| `TS_AUTHKEY` | Chave de autenticação do Tailscale |
| `GITLAB_SECRET` | Secret do webhook do GitLab |
| `GITLAB_TOKEN` | Token de acesso à API do GitLab |
| `GITHUB_WEBHOOK_SECRET` | Secret do webhook do GitHub |
| `GITHUB_TOKEN` | Token de acesso à API do GitHub |
| `CLAUDE_CODE_OAUTH_TOKEN` | Token OAuth do Claude Code |
| `ALLOWED_USERS` | Usuários autorizados (separados por vírgula) |

### Observações

- O token OAuth do Claude Code expira em ~1 ano. Renove com `claude setup-token` e atualize o `.env`.
- Timeout de 30 minutos por fase do SDD. Issues complexas podem precisar de intervenção manual.
- Todo MR/PR gerado deve ser revisado por um humano antes do merge.
- Jobs são persistidos em `jobs.json` e sobrevivem a reinícios do container.
