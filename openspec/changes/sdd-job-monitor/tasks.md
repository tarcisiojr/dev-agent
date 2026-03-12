## 1. Persistência de jobs

- [x] 1.1 Criar módulo `automation/jobStore.js` com funções `loadJobs()`, `saveJobs()`, `getJob(id)`, `upsertJob(job)` usando escrita atômica (write-temp + rename) em `/workspace/jobs.json`
- [x] 1.2 Criar função `generateJobId(platform, repoIdentifier, issueId)` que retorna `{platform}-{slug}-{issueId}`
- [x] 1.3 Integrar `upsertJob()` no fluxo de enqueue — ao receber webhook, persistir job com status `queued`

## 2. Pipeline SDD — prompt builders

- [x] 2.1 Criar função `buildRequirementsPrompt(job)` que instrui o Claude a analisar a issue e gerar `docs/specs/REQUIREMENTS.md`
- [x] 2.2 Criar função `buildDesignPrompt(job)` que instrui o Claude a ler REQUIREMENTS.md e gerar `docs/specs/DESIGN.md`
- [x] 2.3 Criar função `buildTasksPrompt(job)` que instrui o Claude a ler REQUIREMENTS.md + DESIGN.md e gerar `docs/specs/TASKS.md` com checklist `- [ ]`
- [x] 2.4 Criar função `buildImplementationPrompt(job)` que instrui o Claude a ler todos os artefatos, implementar tasks pendentes, commitar por task, marcar `- [x]`, e no final fazer push + abrir PR/MR
- [x] 2.5 Garantir que todos os prompts incluam regra de autonomia (não pedir input, tomar decisões, respeitar CLAUDE.md do repo se existir)

## 3. Pipeline SDD — orquestração de fases

- [x] 3.1 Criar função `runPhase(job, phaseName, promptBuilder)` que: atualiza status para `running`, persiste, spawna Claude, verifica artefato de saída, atualiza fase como `done`
- [x] 3.2 Criar função `verifyPhaseArtifact(worktreePath, phaseName)` que verifica se o artefato esperado existe no worktree
- [x] 3.3 Criar função `ensureSpecsDir(worktreePath)` que cria `docs/specs/` no worktree se não existir
- [x] 3.4 Refatorar `executeJob()` para orquestrar as 4 fases sequencialmente, pulando fases já concluídas (retry/retomada)

## 4. Job Monitor — recovery e retry

- [x] 4.1 Criar função `recoverJobs()` que na inicialização lê jobs.json, re-enfileira jobs `running` (como interrupted) e `queued`
- [x] 4.2 Implementar lógica de retry em `runPhase()`: se fase falha e retryCount < 3, incrementar e re-enfileirar; se >= 3, marcar `needs_help`
- [x] 4.3 Chamar `recoverJobs()` no startup do servidor (antes de `server.listen`)

## 5. Progresso na issue

- [x] 5.1 Adicionar comentário de início ao processar job (`🤖 Analisando issue...`)
- [x] 5.2 Adicionar comentário a cada transição de fase (requirements, design, tasks)
- [x] 5.3 Adicionar comentário de conclusão (sucesso com PR, falha, timeout, needs_help)
- [x] 5.4 Para a fase implementation, contar tasks no TASKS.md após conclusão e comentar progresso

## 6. Atualização de CLAUDE.md e limpeza

- [x] 6.1 Atualizar `automation/CLAUDE.md` para documentar que artefatos SDD são gerados em `docs/specs/` e que o agente deve seguir o TASKS.md
- [x] 6.2 Remover o `buildPrompt()` antigo (substituído pelos 4 prompt builders)
- [x] 6.3 Remover criação do diretório `issue-{id}` antigo (substituído pelo worktree)
