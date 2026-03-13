## Why

O dev-agent hoje só automatiza implementação via pipeline SDD (label `ai-fix` em issues). Não há suporte para code review automatizado. Devs precisam revisar PRs/MRs manualmente, o que consome tempo e pode deixar passar problemas de contrato, segurança e impacto em consumidores. Adicionar review automatizado via Claude com a label `ai-review` em PRs/MRs complementa o fluxo existente — o agente não só implementa, mas também revisa código.

## What Changes

- Novo trigger via webhook: detecta evento de PR/MR com label `ai-review` adicionada
- Novo tipo de job (`review`) com fluxo simplificado de fase única
- Claude analisa o diff do PR, lê arquivos completos para contexto e busca consumidores de contratos alterados
- Leitura de comentários existentes no PR via API para evitar repetir problemas já discutidos
- Claude retorna JSON estruturado com inline comments (path, line, severity, body)
- Server posta inline review comments via API do GitHub/GitLab
- Claude emite veredito: approve ou request_changes
- Reutiliza infraestrutura existente: fila, jobs, retry, validação de usuário, `spawnClaude`

## Capabilities

### New Capabilities

- `pr-review-trigger`: Detecção de eventos de PR/MR com label `ai-review`, extração de dados do PR e enfileiramento de job de review
- `code-review-analysis`: Prompt e lógica para Claude analisar diff, contexto de arquivos, impacto em consumidores e comentários existentes, retornando JSON estruturado
- `review-comment-posting`: Postagem de inline review comments e veredito via API do GitHub/GitLab

### Modified Capabilities

_(nenhuma — o fluxo ai-fix permanece inalterado)_

## Impact

- **server.js**: Novas funções de detecção de evento PR, extração de dados, execução de review job e postagem de comments
- **prompts.js**: Novo prompt builder `buildCodeReviewPrompt` com instruções para output JSON estruturado
- **Webhook**: Mesmo endpoint `/webhook`, mas agora aceita eventos `pull_request` (GitHub) e `merge_request` (GitLab) além de issues
- **APIs externas**: Novos endpoints consumidos — PR review comments (GitHub: `POST /pulls/{pr}/reviews`, GitLab: `POST /merge_requests/{mr}/discussions`)
- **Variáveis de ambiente**: Nenhuma nova — reutiliza `GITHUB_TOKEN`, `GITLAB_TOKEN`, `ALLOWED_USERS`
