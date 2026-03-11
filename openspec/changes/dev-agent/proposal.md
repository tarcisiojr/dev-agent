## Why

Automatizar a resolução de issues do GitLab e GitHub usando Claude Code CLI. Quando um maintainer adiciona a label `ai-fix` a um issue, o sistema clona o repositório, implementa a solução, roda testes e abre um Merge Request/Pull Request automaticamente. Isso acelera a resolução de bugs e tarefas simples sem intervenção humana.

## What Changes

- Servidor webhook Node.js puro que recebe eventos de issues do GitLab e GitHub
- Validação de segurança: token do webhook, verificação de label adicionada, usuário autorizado (ALLOWED_USERS)
- Detecção automática da plataforma (GitLab vs GitHub) pelo header do request
- Execução do Claude Code CLI via `spawn` com prompt via stdin (anti-injeção)
- Fila sequencial para processar issues uma por vez (evita conflitos e sobrecarga)
- Feedback na issue: comentário ao iniciar e ao concluir (sucesso ou falha)
- Timeout de 30 minutos por execução
- Diretórios isolados por issue (`/workspace/issue-{id}/`)
- Container Docker único com Node.js + Claude Code + git + glab + gh
- Exposição pública via Tailscale Funnel (sem IP fixo necessário)

## Capabilities

### New Capabilities
- `webhook-receiver`: Servidor HTTP que recebe webhooks do GitLab/GitHub, valida segurança, filtra por label e usuário autorizado, e enfileira execuções
- `claude-executor`: Execução do Claude Code CLI com prompt via stdin, fila sequencial, timeout, diretórios isolados e feedback na issue
- `infra-docker`: Dockerfile, docker-compose e configuração do Tailscale Funnel para deploy no homelab

### Modified Capabilities

## Impact

- **Infraestrutura**: VM no Proxmox com Docker, container único (`automation`), Tailscale Funnel
- **Dependências externas**: Claude Code CLI (licença Max via OAuth token), GitLab API, GitHub API, Tailscale
- **APIs consumidas**: GitLab Webhooks + REST API, GitHub Webhooks + REST API
- **CLIs necessárias**: `glab` (GitLab CLI), `gh` (GitHub CLI), `claude` (Claude Code CLI)
- **Segurança**: sem docker.sock exposto, prompt via stdin, validação de usuário autorizado
