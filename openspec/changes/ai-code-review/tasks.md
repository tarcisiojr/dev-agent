## 1. Detecção e extração de eventos PR/MR

- [x] 1.1 Adicionar função `isPullRequestEvent(platform, headers, payload)` em server.js para detectar eventos de PR (GitHub: header `x-github-event: pull_request`, GitLab: `object_kind: merge_request`)
- [x] 1.2 Adicionar função `isReviewLabelAdded(platform, payload)` em server.js para verificar se label `ai-review` foi adicionada (GitHub: action `labeled` + label.name, GitLab: changes.labels)
- [x] 1.3 Adicionar função `extractPullRequestData(platform, payload)` em server.js para extrair dados do PR/MR (número, título, branches source/target, repo URL, projectId, user)
- [x] 1.4 Atualizar `handleWebhook` em server.js para tratar eventos de PR/MR além de issues — após verificar issue event, verificar PR event com label `ai-review` e enfileirar job com `type: 'review'`

## 2. Busca de contexto externo (diff e comentários)

- [x] 2.1 Adicionar função `fetchPRDiff(job)` em server.js que clona o repo, faz checkout na branch source, e retorna o diff via `git diff {target}...HEAD` (truncando em 500KB se necessário)
- [x] 2.2 Adicionar função `fetchExistingComments(job)` em server.js que busca comentários de review existentes via API (GitHub: `GET /pulls/{number}/comments`, GitLab: `GET /merge_requests/{iid}/discussions`) e formata como texto
- [x] 2.3 Adicionar função `fetchDiffFileList(job, worktreePath)` em server.js que retorna a lista de arquivos modificados via `git diff --name-only {target}...HEAD`

## 3. Prompt de code review

- [x] 3.1 Adicionar função `buildCodeReviewPrompt(job, diff, existingComments)` em prompts.js com instruções para o Claude analisar o diff, buscar impacto em consumidores, considerar comentários existentes, e retornar JSON estruturado com `verdict`, `summary` e `comments[]` (cada comment com path, line, severity, category, body)
- [x] 3.2 Exportar `buildCodeReviewPrompt` no module.exports de prompts.js

## 4. Execução do job de review

- [x] 4.1 Adicionar função `executeReviewJob(job)` em server.js com o fluxo: comentar início no PR → clonar/checkout → obter diff → buscar comentários existentes → spawnar Claude com prompt de review → parsear JSON do stdout → postar comments → comentar conclusão
- [x] 4.2 Atualizar `executeJob` em server.js para despachar para `executeReviewJob` quando `job.type === 'review'`, mantendo o fluxo SDD para jobs sem type ou com type diferente
- [x] 4.3 Adicionar função `parseReviewOutput(stdout)` em server.js que extrai e valida o JSON do stdout do Claude (busca bloco JSON, parseia, valida campos obrigatórios)

## 5. Postagem de review comments

- [x] 5.1 Adicionar função `postGitHubReview(job, reviewData)` em server.js que posta review batch via `POST /repos/{owner}/{repo}/pulls/{number}/reviews` com event, body e comments[]
- [x] 5.2 Adicionar função `postGitLabReview(job, reviewData)` em server.js que posta cada comment como discussion inline via `POST /projects/{id}/merge_requests/{iid}/discussions` com position, e ao final posta nota geral com summary e veredito
- [x] 5.3 Adicionar função `formatCommentBody(comment)` em server.js que formata o body do comment com emoji de severidade (🔴 critical, 🟠 high, 🟡 medium, 🔵 low), severidade, categoria e corpo
- [x] 5.4 Adicionar função `postReviewComments(job, reviewData)` em server.js que despacha para `postGitHubReview` ou `postGitLabReview` conforme a plataforma

## 6. Comentários de status no PR

- [x] 6.1 Adicionar função `commentOnPR(job, message)` em server.js (similar a `commentOnIssue`) que posta comentário geral no PR/MR (GitHub: `POST /issues/{number}/comments`, GitLab: `POST /merge_requests/{iid}/notes`)
- [x] 6.2 Usar `commentOnPR` em `executeReviewJob` para comentar início ("🤖 Claude Code está revisando..."), conclusão (resumo com veredito e contagem por severidade) e falha ("🆘 Não consegui completar o review")
