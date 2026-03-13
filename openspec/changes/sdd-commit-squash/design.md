## Context

O pipeline SDD em `automation/server.js` executa 5 fases sequenciais (requirements, design, tasks, implementation, finalize). Cada fase spawna o Claude Code que gera artefatos e faz commits. Atualmente os artefatos vão para `docs/specs/` com nomes fixos e os commits ficam granulares no PR.

## Goals / Non-Goals

**Goals:**
- Artefatos SDD salvos em `docs/specs/{issueId}-{slug}/` com nomes únicos por issue
- PR final com exatamente 2 commits: 1 para SDD, 1 para implementação
- Squash via `git reset --soft` após cada grupo de fases

**Non-Goals:**
- Mudar a lógica interna das fases (prompts continuam instruindo commit normal)
- Alterar o fluxo de retry existente
- Modificar a estrutura dos artefatos SDD em si (conteúdo dos .md)

## Decisions

### 1. Slugify do título da issue

Criar função `slugify(title)` no `server.js`:
- Converter para lowercase
- Remover acentos (normalizar para ASCII)
- Substituir espaços e caracteres especiais por `-`
- Remover hífens consecutivos
- Truncar em 50 caracteres (cortar na última palavra completa)
- Resultado: `42-corrige-erro-validacao-login`

Alternativa considerada: usar apenas o issueId (`docs/specs/42/`). Descartada porque perde contexto humano — difícil saber do que se trata ao navegar o diretório.

### 2. Paths dinâmicos para artefatos

`PHASE_ARTIFACTS` deixa de ser um objeto estático e passa a ser uma função `getPhaseArtifact(phaseName, job)` que retorna o path dinâmico.

O `specsDir(job)` gera o prefixo: `docs/specs/{issueId}-{slug}/`

Os prompts em `prompts.js` recebem o `specsDir` como parâmetro e instruem o Claude a usar esse diretório.

### 3. Squash com git reset --soft (Estratégia B)

Após a fase 3 (tasks) completar com sucesso:
```bash
git reset --soft origin/main
git add .
git commit -m "docs(sdd): specs para issue #{issueId} - {titulo}"
```

Após a fase 4 (implementation) completar com sucesso:
```bash
# Pegar hash do commit SDD (o único commit após o squash anterior)
SDD_HASH=$(git log --format=%H -1 origin/main..HEAD)
git reset --soft $SDD_HASH
git add .
git commit -m "fix: {titulo} #{issueId}"
```

O squash é executado pelo `server.js` via `child_process.execSync` no worktree, não pelo Claude.

Alternativa considerada: Estratégia A (instruir Claude a não commitar). Descartada porque requer mudanças maiores nos prompts e o Claude pode commitar mesmo assim.

### 4. Função de squash como utilitário

Criar duas funções:
- `squashSddCommits(worktreePath, job)` — chamada após fase 3
- `squashImplCommits(worktreePath, job)` — chamada após fase 4

Ambas usam `execSync` com `cwd: worktreePath`.

## Risks / Trade-offs

- **[Reset em estado sujo]** → Se houver arquivos não commitados no worktree no momento do squash, eles serão incluídos. Mitigação: o Claude deve ter commitado tudo; o `git add .` antes do commit garante que nada fica perdido.
- **[Mensagem de commit fixa]** → O squash perde as mensagens de commit individuais do Claude. Trade-off aceitável: as mensagens granulares ficam nos logs do server, e o PR tem mensagens limpas.
- **[Conflito com retry na fase 4]** → Se a fase 4 falhar e for retried, os commits parciais existem sobre o commit SDD. O novo squash após retry junta tudo normalmente. Sem risco.
