## 1. Gerenciamento de bare clone

- [x] 1.1 Criar função `getRepoSlug(repoIdentifier)` que converte `owner/repo` em slug (`owner-repo`)
- [x] 1.2 Criar função `ensureBareRepo(repoUrl, slug)` que clona (se não existe) ou faz fetch (se existe) no diretório `/workspace/repos/<slug>/`
- [x] 1.3 Tratar erro de clone/fetch e logar mensagem descritiva

## 2. Gerenciamento de worktree

- [x] 2.1 Criar função `createWorktree(bareRepoPath, issueId)` que cria worktree em `/workspace/worktrees/issue-{id}/` com branch `fix/issue-{id}` baseada em `origin/main`
- [x] 2.2 Tratar caso de branch já existente (deletar antes de criar worktree)
- [x] 2.3 Criar função `removeWorktree(bareRepoPath, issueId)` que remove worktree e branch local após execução

## 3. Integração com executeJob

- [x] 3.1 Refatorar `executeJob()` para chamar `ensureBareRepo()` e `createWorktree()` antes de invocar Claude Code
- [x] 3.2 Alterar `cwd` do spawn do Claude Code para apontar ao diretório do worktree
- [x] 3.3 Chamar `removeWorktree()` no finally (após sucesso, falha ou timeout)
- [x] 3.4 Comentar na issue em caso de falha no setup (clone/fetch/worktree)

## 4. Atualização do prompt

- [x] 4.1 Alterar `buildPrompt()` para remover instrução de clone e informar que o código já está presente e a branch já está ativa
- [x] 4.2 Atualizar `automation/CLAUDE.md` para refletir o novo fluxo (código já clonado)
