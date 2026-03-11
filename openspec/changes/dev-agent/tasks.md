## 1. Infraestrutura base

- [x] 1.1 Criar `.gitignore` com exclusões (.env, workspace/, node_modules/, tailscale-config/state/)
- [x] 1.2 Criar `.env.example` com todas as variáveis documentadas (TS_AUTHKEY, GITLAB_SECRET, GITLAB_TOKEN, GITHUB_WEBHOOK_SECRET, GITHUB_TOKEN, CLAUDE_CODE_OAUTH_TOKEN, ALLOWED_USERS)
- [x] 1.3 Criar `automation/package.json` (sem dependências externas)
- [x] 1.4 Criar `automation/Dockerfile` (node:22-alpine + git + bash + curl + glab + gh + claude-code)

## 2. Webhook receiver

- [x] 2.1 Criar servidor HTTP em `automation/server.js` — rota POST /webhook, porta 9000, retorno 404 para demais rotas
- [x] 2.2 Implementar detecção de plataforma via headers (x-gitlab-token → GitLab, x-github-event → GitHub)
- [x] 2.3 Implementar validação de token GitLab (x-gitlab-token vs GITLAB_SECRET)
- [x] 2.4 Implementar validação HMAC SHA256 do GitHub (x-hub-signature-256 vs GITHUB_WEBHOOK_SECRET)
- [x] 2.5 Implementar filtro por evento de issue (GitLab: object_kind, GitHub: x-github-event)
- [x] 2.6 Implementar filtro por label `ai-fix` adicionada (não já existente)
- [x] 2.7 Implementar validação de usuário autorizado (ALLOWED_USERS)
- [x] 2.8 Implementar extração de dados do issue (id, título, descrição, URL repo, project id) para ambas plataformas

## 3. Claude executor

- [x] 3.1 Implementar fila sequencial em memória (array + flag de processamento)
- [x] 3.2 Implementar criação de diretório isolado `/workspace/issue-{id}/`
- [x] 3.3 Implementar montagem do prompt com dados do issue e instruções (branch, testes, commit, MR/PR)
- [x] 3.4 Implementar execução do Claude Code via spawn com prompt via stdin
- [x] 3.5 Implementar timeout de 30 minutos (SIGTERM no processo)

## 4. Feedback na issue

- [x] 4.1 Implementar função de comentário na issue do GitLab (API REST: POST /projects/:id/issues/:iid/notes)
- [x] 4.2 Implementar função de comentário na issue do GitHub (API REST: POST /repos/:owner/:repo/issues/:number/comments)
- [x] 4.3 Comentar na issue ao iniciar processamento
- [x] 4.4 Comentar na issue ao terminar (sucesso, falha ou timeout)
- [x] 4.5 Implementar logging no console (início, fim, duração, exit code)

## 5. Configuração Docker e Tailscale

- [x] 5.1 Criar `tailscale-config/funnel.json` (HTTPS 443 → automation:9000)
- [x] 5.2 Criar `docker-compose.yml` com serviços automation e tailscale
- [x] 5.3 Criar `automation/CLAUDE.md` com instruções de contexto para execução autônoma

## 6. Documentação

- [x] 6.1 Criar `README.md` com pré-requisitos, setup, configuração de webhook, uso e monitoramento
