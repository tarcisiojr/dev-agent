## Context

Atualmente, cada issue processada pelo dev-agent faz `git clone` completo do repositório dentro de `/workspace/issue-{id}/`. O clone é feito pelo Claude Code como parte do prompt. Para repositórios com histórico extenso, isso adiciona minutos desnecessários ao processamento de cada issue.

A fila é sequencial (uma issue por vez), então não há concorrência no acesso ao repositório.

## Goals / Non-Goals

**Goals:**
- Eliminar clones repetidos do mesmo repositório
- Reduzir tempo de setup por issue (de minutos para segundos)
- Manter isolamento entre issues (cada uma em seu próprio diretório)

**Non-Goals:**
- Processamento paralelo de issues (fila continua sequencial)
- Cache de dependências (npm, pip, etc.) — escopo futuro
- Garbage collection automática de bare repos antigos

## Decisions

### 1. Bare clone como cache

Usar `git clone --bare` para o repositório central, armazenado em `/workspace/repos/<slug>/`.

**Alternativa**: clone normal como cache. Descartada porque bare clones são mais leves (sem working tree) e são a forma canônica de usar worktrees.

**Slug**: derivado do `repoIdentifier` do job, substituindo `/` por `-`. Ex: `tarcisiojr/ai-toolkit` → `tarcisiojr-ai-toolkit`.

### 2. Worktree por issue

Criar worktree em `/workspace/worktrees/issue-{id}/` com `git worktree add -b fix/issue-{id} <path> origin/main`.

O Claude Code recebe o worktree já preparado com a branch criada e o código presente. O prompt não instrui mais a clonar.

### 3. Fetch antes de cada worktree

Executar `git fetch origin` no bare repo antes de criar a worktree, garantindo que o código está atualizado.

### 4. Limpeza após execução

Após o Claude Code terminar (sucesso, falha ou timeout):
1. `git worktree remove /workspace/worktrees/issue-{id}/`
2. O bare repo permanece para reuso

### 5. Preparação feita pelo server.js, não pelo Claude Code

O clone, fetch e worktree são gerenciados pelo `server.js` (Node.js via `child_process.execSync`). O Claude Code recebe o diretório pronto e foca apenas na implementação.

## Risks / Trade-offs

- **[Disco acumula bare repos]** → Aceitável para v1. Repos bare são compactos. Pode-se adicionar LRU futuramente.
- **[Fetch falha (rede)]** → Tratar erro e comentar na issue. Não tentar fallback para clone completo (mantém simplicidade).
- **[Branch já existe no bare repo]** → Pode acontecer se uma issue for re-processada. Deletar branch local antes de criar worktree: `git branch -D fix/issue-{id}` (ignore se não existir).
