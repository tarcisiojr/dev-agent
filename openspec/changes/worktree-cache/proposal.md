## Why

Cada vez que uma issue é processada, o Claude Code clona o repositório inteiro do zero. Para repos grandes, isso desperdiça minutos em download de histórico git que já foi baixado antes. Usar `git worktree` com um bare clone cacheado elimina essa repetição — o primeiro clone é inevitável, mas issues seguintes do mesmo repo levam segundos.

## What Changes

- Manter bare clones cacheados em `/workspace/repos/<slug>/` (um por repositório)
- Criar worktrees isolados em `/workspace/worktrees/issue-{id}/` a partir do bare clone
- Antes de criar worktree, fazer `git fetch origin` para atualizar o cache
- Após conclusão (sucesso ou falha), remover a worktree com `git worktree remove`
- Alterar o prompt do Claude Code para indicar que o código já está presente (não precisa clonar)
- Mover lógica de clone/worktree para o `server.js` (antes de invocar Claude Code)

## Capabilities

### New Capabilities
- `repo-cache`: Gerenciamento de bare clones cacheados por repositório, com fetch incremental e criação/remoção de worktrees

### Modified Capabilities

## Impact

- `automation/server.js`: refatorar `executeJob()` e `buildPrompt()` para usar worktree em vez de clone
- Volume `workspace` no Docker: agora conterá `/workspace/repos/` (permanente) e `/workspace/worktrees/` (efêmero)
- `automation/CLAUDE.md`: atualizar instruções para refletir que o código já está clonado
