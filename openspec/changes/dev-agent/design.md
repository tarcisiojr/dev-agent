## Context

Homelab com Proxmox rodando uma VM dedicada para Docker. Sem IP fixo público — exposição via Tailscale Funnel. O objetivo é ter um agente autônomo que resolve issues automaticamente quando um maintainer marca com a label `ai-fix`.

Decisões já tomadas na exploração:
- Container único (Node.js + Claude Code + git + glab + gh) em vez de separar webhook e worker
- Sem docker.sock — Claude Code roda via `spawn` no mesmo processo
- Prompt via stdin para evitar injeção de comandos
- Fila sequencial para evitar conflitos e sobrecarga no homelab
- Suporte a GitLab e GitHub no mesmo endpoint

## Goals / Non-Goals

**Goals:**
- Receber webhooks do GitLab e GitHub e acionar Claude Code automaticamente
- Garantir que apenas usuários autorizados possam disparar execuções
- Dar feedback visível na issue (comentários de início e resultado)
- Funcionar de forma autônoma no homelab sem manutenção constante

**Non-Goals:**
- Interface web de gerenciamento ou dashboard
- Suporte a outros provedores (Bitbucket, Azure DevOps)
- Processamento paralelo de múltiplas issues
- Retry automático de execuções falhadas
- Monitoramento avançado (métricas, alertas)

## Decisions

### 1. Container único vs separação webhook/worker

**Decisão**: Container único com Node.js + Claude Code + git + CLIs.

**Alternativa descartada**: Dois containers (webhook-receiver + claude-worker) comunicando via `docker exec`.

**Racional**: A separação exigia montar `/var/run/docker.sock` no container do webhook, criando superfície de ataque desnecessária. Com container único, a comunicação é via `child_process.spawn` — mais simples, mais seguro, sem dependência do Docker socket.

### 2. Prompt via stdin vs argumento de linha de comando

**Decisão**: Passar o prompt via stdin usando `spawn` com `proc.stdin.write(prompt)`.

**Alternativa descartada**: Passar o prompt como argumento em `sh -c "claude -p '...'"`.

**Racional**: Argumentos de linha de comando são vulneráveis a injeção de shell se o título/descrição da issue contiver caracteres especiais (`'`, `` ` ``, `$()`). O stdin é imune a isso.

### 3. Fila sequencial vs paralelismo

**Decisão**: Fila em memória (array), processamento um por vez.

**Alternativa descartada**: Containers efêmeros por issue (paralelismo real).

**Racional**: No homelab, recursos são limitados. Claude Code consome bastante memória e CPU. Fila sequencial é previsível e evita que a VM fique sem recursos. Evolução futura para paralelismo é possível sem mudança arquitetural.

### 4. Detecção de plataforma via headers HTTP

**Decisão**: Detectar GitLab vs GitHub pelos headers do request:
- `x-gitlab-token` → GitLab
- `x-github-event` → GitHub

**Racional**: Cada plataforma envia headers distintos. Isso permite usar um único endpoint `/webhook` para ambas, sem necessidade de rotas separadas.

### 5. Validação de segurança em camadas

**Decisão**: Três camadas de validação antes de processar:
1. Token/assinatura do webhook (GitLab: header simples, GitHub: HMAC SHA256)
2. Label `ai-fix` foi adicionada neste evento (não já existia)
3. Usuário que adicionou está em `ALLOWED_USERS`

**Racional**: Qualquer colaborador pode adicionar labels. Sem a verificação de usuário, qualquer pessoa com acesso ao repositório poderia acionar execuções do Claude Code.

### 6. GitLab CLI (glab) para MRs, GitHub CLI (gh) para PRs

**Decisão**: Instalar ambas as CLIs no container. O CLAUDE.md instrui o Claude a usar `glab` ou `gh` conforme a plataforma.

**Alternativa descartada**: Usar a API REST diretamente via curl.

**Racional**: As CLIs abstraem autenticação e formatação. São mais simples de usar no prompt do Claude Code.

## Risks / Trade-offs

- **[Fila perde estado no restart]** → Se o container reiniciar, issues na fila são perdidas. Aceitável para homelab — issues podem ser re-triggeradas removendo e re-adicionando a label.
- **[Token OAuth expira em ~1 ano]** → Requer renovação manual com `claude setup-token`. Documentar no README.
- **[Claude pode não resolver o issue]** → O comentário de falha na issue avisa o maintainer. O `--max-turns 50` e `timeout 30m` evitam loops infinitos.
- **[Tailscale Funnel pode cair]** → Depende do Tailscale estar rodando. O container `tailscale` reinicia automaticamente via `restart: unless-stopped`.
- **[Issue com descrição vaga]** → Claude pode implementar algo errado. Mitigação: o MR precisa de review humano antes do merge.
