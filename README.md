# Dev Agent

Autonomous agent that resolves GitLab and GitHub issues using Claude Code CLI. When a maintainer adds the `ai-fix` label to an issue, the system clones the repository, implements a solution through a Spec-Driven Development (SDD) pipeline, runs tests, and opens a Merge Request/Pull Request automatically.

It also performs **automated code reviews** on Pull Requests/Merge Requests when the `ai-review` label is added — analyzing the diff for bugs, security issues, breaking changes, and impact on consumers, then posting inline review comments.

## Features

| Feature | Trigger | Description |
|---|---|---|
| **Auto-fix** | `ai-fix` label on issue | Full SDD pipeline: Requirements → Design → Tasks → Implementation → MR/PR |
| **Code Review** | `ai-review` label on PR/MR | Inline review comments with severity, impact analysis, and verdict |
| **Auto-deploy** | `git push` to main | Server updates automatically within 1 minute |

## How It Works

### Auto-fix (ai-fix)

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

### Code Review (ai-review)

1. A webhook fires when the `ai-review` label is added to a PR/MR
2. The server clones the repository and checks out the PR branch
3. Claude Code analyzes the diff with full repository context:
   - **Bugs** — logic errors, unhandled edge cases
   - **Security** — OWASP top 10 vulnerabilities
   - **Breaking changes** — altered function signatures, API contracts; searches for all consumers that would be affected
   - **Performance** — N+1 queries, unnecessary loops
   - **Quality** — code duplication, naming, readability
4. Claude returns a structured JSON with inline comments
5. The server posts review comments directly on the PR/MR (inline, per file/line)
6. A verdict is included: Approved or Changes Requested
7. Re-triggering: remove and re-add the `ai-review` label for a fresh review that considers existing comments (won't repeat already-discussed issues)

> **Note:** Only users listed in `ALLOWED_USERS` can trigger both features.

## Quick Install

For a fresh VM (Debian/Ubuntu):

```bash
git clone https://github.com/tarcisiojr/dev-agent.git /opt/dev-agent
sudo /opt/dev-agent/install.sh
```

The install script handles everything: Docker, cron, `.env` setup, and container startup.

## Manual Setup

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
4. Trigger: **Issue events** and **Merge request events**

### GitHub

1. Go to **Settings → Webhooks** (repository or organization level)
2. Payload URL: `https://dev-agent.<your-tailnet>.ts.net/webhook`
3. Content type: `application/json`
4. Secret: same value as `GITHUB_WEBHOOK_SECRET` in `.env`
5. Events: select **Issues** and **Pull requests**

## Usage

### Auto-fix

1. Create or find an issue on GitLab/GitHub
2. Add the `ai-fix` label to the issue
3. The agent automatically:
   - Comments on the issue that work has started
   - Clones the repository
   - Creates branch `fix/issue-{id}`
   - Runs the SDD pipeline (Requirements → Design → Tasks → Implementation → Finalize)
   - Opens a MR/PR
   - Comments on the issue with the result

### Code Review

1. Open or find a Pull Request/Merge Request
2. Add the `ai-review` label
3. The agent automatically:
   - Comments that the review has started
   - Analyzes the diff and searches for impact on consumers
   - Posts inline comments with severity (🔴 critical, 🟠 high, 🟡 medium, 🔵 low) and category
   - Posts a summary with the verdict
4. To request a new review after changes: remove and re-add the `ai-review` label

## Auto-deploy

The server can update itself automatically when changes are pushed to `main`.

**How it works:**
- A cron job runs every minute, checking for new commits on `origin/main`
- If code in `automation/` changed: restarts the container (no rebuild needed — code is mounted via volume)
- If `Dockerfile` or `entrypoint.sh` changed: full rebuild of the automation container only
- Other changes (docs, openspec): just `git pull`, no restart

**Setup** (already included in `install.sh`):

```bash
chmod +x /opt/dev-agent/auto-deploy.sh
crontab -e
# Add: * * * * * /opt/dev-agent/auto-deploy.sh
```

Deploy log: `tail -f /var/log/dev-agent-deploy.log`

## Architecture

```
dev-agent/
├── automation/
│   ├── server.js       # HTTP server, job queue, webhook handling, review posting
│   ├── prompts.js      # SDD pipeline + code review prompt builders
│   ├── jobStore.js     # JSON-based job persistence
│   ├── entrypoint.sh   # Container entrypoint
│   └── Dockerfile      # Node.js 22+ Alpine container
├── tailscale-config/   # Funnel configuration
├── install.sh          # One-command setup for new VMs
├── auto-deploy.sh      # Auto-update script (cron)
├── docker-compose.yml  # 2 services: automation + tailscale
└── .env.example        # Environment variables template
```

**Key design decisions:**
- **Sequential job queue** — jobs are processed one at a time to avoid resource contention
- **Job persistence** — jobs are stored in `jobs.json` and survive container restarts
- **HMAC-SHA256 validation** (GitHub) and token validation (GitLab) for webhook security
- **30-minute timeout** per phase with retry mechanism (max 3 retries)
- **Structured JSON output** for code reviews — Claude returns JSON, server posts via API
- **Volume-mounted code** — source changes don't require Docker rebuild

## Monitoring

Follow logs in real time:

```bash
docker compose logs -f automation
```

Logs include:
- Received webhooks and validation status
- Start and end of each SDD phase / review
- Duration and exit code of Claude Code
- API errors or timeouts
- Review verdicts and comment counts

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
- Code reviews use `COMMENT` event (not `APPROVE`/`REQUEST_CHANGES`) to avoid GitHub's self-review restriction.

---

## Anexo — Documentação em Português (pt-BR)

### O que é o Dev Agent?

Agente autônomo que resolve issues do GitLab e GitHub usando Claude Code CLI. Quando um maintainer adiciona a label `ai-fix` a uma issue, o sistema clona o repositório, implementa a solução através de um pipeline de Desenvolvimento Orientado a Especificações (SDD), roda testes e abre um Merge Request/Pull Request automaticamente.

Também realiza **code reviews automatizados** em Pull Requests/Merge Requests quando a label `ai-review` é adicionada — analisando o diff em busca de bugs, problemas de segurança, breaking changes e impacto em consumidores, postando comentários inline diretamente no PR/MR.

### Funcionalidades

| Funcionalidade | Trigger | Descrição |
|---|---|---|
| **Auto-fix** | Label `ai-fix` em issue | Pipeline SDD completo: Requisitos → Design → Tarefas → Implementação → MR/PR |
| **Code Review** | Label `ai-review` em PR/MR | Comentários inline com severidade, análise de impacto e veredito |
| **Auto-deploy** | `git push` na main | Servidor atualiza automaticamente em até 1 minuto |

### Instalação Rápida

Para uma VM nova (Debian/Ubuntu):

```bash
git clone https://github.com/tarcisiojr/dev-agent.git /opt/dev-agent
sudo /opt/dev-agent/install.sh
```

O script de instalação cuida de tudo: Docker, cron, configuração do `.env` e inicialização dos containers.

### Como Funciona

**Auto-fix:**
1. Um webhook é disparado quando a label `ai-fix` é adicionada a uma issue
2. O servidor valida a requisição e enfileira o job
3. O Claude Code executa 5 fases sequenciais do SDD
4. O agente comenta na issue com progresso e resultados

**Code Review:**
1. Um webhook é disparado quando a label `ai-review` é adicionada a um PR/MR
2. O Claude analisa o diff com contexto completo do repositório
3. Busca consumidores de contratos alterados (funções, APIs, interfaces)
4. Considera comentários existentes para não repetir problemas já discutidos
5. Posta comentários inline com severidade (🔴 crítico, 🟠 alto, 🟡 médio, 🔵 baixo)
6. Para re-review: remova e re-adicione a label `ai-review`

### Configuração do Webhook

**GitLab:** Settings → Webhooks → URL: `https://dev-agent.<seu-tailnet>.ts.net/webhook` → Trigger: Issue events + Merge request events

**GitHub:** Settings → Webhooks → Payload URL: `https://dev-agent.<seu-tailnet>.ts.net/webhook` → Content type: `application/json` → Events: Issues + Pull requests

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
- Code reviews usam evento `COMMENT` (não `APPROVE`/`REQUEST_CHANGES`) para evitar restrição de self-review do GitHub.
