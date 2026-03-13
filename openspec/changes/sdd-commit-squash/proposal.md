## Why

O pipeline SDD atual salva artefatos (REQUIREMENTS.md, DESIGN.md, TASKS.md) sempre no mesmo caminho fixo `docs/specs/`, causando conflitos quando múltiplas issues são processadas — um commit substitui o outro. Além disso, o PR resultante contém múltiplos commits granulares (um por fase/tarefa), quando o ideal seria ter apenas 2 commits limpos: um para os artefatos SDD e outro para a implementação.

## What Changes

- Adicionar função `slugify()` em `server.js` para gerar slug a partir do título da issue
- Alterar caminhos dos artefatos SDD de `docs/specs/` para `docs/specs/{issueId}-{slug}/` (ex: `docs/specs/42-corrige-erro-login/`)
- Atualizar `PHASE_ARTIFACTS` para gerar paths dinâmicos baseados no job
- Atualizar prompts em `prompts.js` para instruir o Claude a usar os paths dinâmicos
- Adicionar lógica de squash no `server.js`: após fase 3 (tasks), squash commits SDD em 1; após fase 4 (implementation), squash commits de implementação em 1
- Resultado: PR com exatamente 2 commits

## Capabilities

### New Capabilities
- `commit-squash`: Lógica de squash de commits após grupos de fases do pipeline SDD
- `dynamic-artifact-paths`: Geração de caminhos dinâmicos para artefatos SDD baseados em issueId e slug do título

### Modified Capabilities

## Impact

- `automation/server.js` — nova função slugify, squash de commits, paths dinâmicos no PHASE_ARTIFACTS
- `automation/prompts.js` — paths dos artefatos atualizados nos prompts de cada fase
- `automation/CLAUDE.md` — atualizar referência aos paths dos artefatos
