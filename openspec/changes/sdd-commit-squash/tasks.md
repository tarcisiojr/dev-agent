## 1. Função slugify e paths dinâmicos

- [x] 1.1 Criar função `slugify(title)` em `server.js` — converte título para slug ASCII lowercase, trunca em 50 chars
- [x] 1.2 Criar função `specsDir(job)` em `server.js` — retorna `docs/specs/{issueId}-{slug}/`
- [x] 1.3 Substituir `PHASE_ARTIFACTS` estático por função `getPhaseArtifact(phaseName, job)` que usa `specsDir(job)`
- [x] 1.4 Atualizar `verifyPhaseArtifact()` e `readPhaseArtifact()` para receber `job` e usar `getPhaseArtifact()`
- [x] 1.5 Atualizar `countTasks()` para receber `job` e usar path dinâmico

## 2. Atualizar prompts com paths dinâmicos

- [x] 2.1 Alterar `buildRequirementsPrompt(job)` para instruir uso de `docs/specs/{issueId}-{slug}/REQUIREMENTS.md`
- [x] 2.2 Alterar `buildDesignPrompt(job)` para referenciar e gerar em `docs/specs/{issueId}-{slug}/`
- [x] 2.3 Alterar `buildTasksPrompt(job)` para referenciar e gerar em `docs/specs/{issueId}-{slug}/`
- [x] 2.4 Alterar `buildImplementationPrompt(job)` para ler artefatos de `docs/specs/{issueId}-{slug}/`

## 3. Squash de commits

- [x] 3.1 Criar função `squashSddCommits(worktreePath, job)` — executa `git reset --soft origin/main && git commit` após fase 3
- [x] 3.2 Criar função `squashImplCommits(worktreePath, job)` — identifica hash do commit SDD, executa `git reset --soft {hash} && git commit` após fase 4
- [x] 3.3 Integrar chamada de `squashSddCommits()` no loop de fases em `executeJob()` após fase `tasks` completar
- [x] 3.4 Integrar chamada de `squashImplCommits()` no loop de fases em `executeJob()` após fase `implementation` completar

## 4. Atualizar CLAUDE.md

- [x] 4.1 Atualizar `automation/CLAUDE.md` com referência aos novos paths dinâmicos `docs/specs/{issueId}-{slug}/`
