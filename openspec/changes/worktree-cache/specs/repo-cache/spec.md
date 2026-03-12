## ADDED Requirements

### Requirement: Cache de repositório via bare clone
O sistema SHALL manter um bare clone de cada repositório processado em `/workspace/repos/<slug>/`, onde `<slug>` é o `repoIdentifier` com `/` substituído por `-`.

#### Scenario: Primeiro acesso a um repositório
- **WHEN** uma issue chega para um repositório que nunca foi processado
- **THEN** o sistema executa `git clone --bare <repoUrl> /workspace/repos/<slug>/`

#### Scenario: Acesso subsequente a um repositório já cacheado
- **WHEN** uma issue chega para um repositório que já possui bare clone
- **THEN** o sistema executa `git fetch origin` no bare repo existente sem re-clonar

### Requirement: Worktree isolado por issue
O sistema SHALL criar um git worktree em `/workspace/worktrees/issue-{id}/` a partir do bare clone, com branch `fix/issue-{id}` baseada em `origin/main`.

#### Scenario: Criação de worktree para issue
- **WHEN** o bare repo está atualizado (clone ou fetch concluído)
- **THEN** o sistema executa `git worktree add -b fix/issue-{id} /workspace/worktrees/issue-{id}/ origin/main` no bare repo

#### Scenario: Branch já existe de execução anterior
- **WHEN** a branch `fix/issue-{id}` já existe no bare repo (re-processamento de issue)
- **THEN** o sistema deleta a branch existente antes de criar a worktree

### Requirement: Claude Code recebe worktree pronto
O sistema SHALL executar o Claude Code com `cwd` apontando para o diretório do worktree. O prompt SHALL indicar que o código já está clonado e a branch já está criada, instruindo o Claude a NÃO clonar o repositório.

#### Scenario: Prompt adaptado para worktree
- **WHEN** o Claude Code é invocado para uma issue
- **THEN** o prompt informa que o repositório já está clonado e a branch `fix/issue-{id}` já está ativa

### Requirement: Limpeza de worktree após execução
O sistema SHALL remover o worktree após a execução do Claude Code (sucesso, falha ou timeout). O bare repo SHALL permanecer para reuso.

#### Scenario: Limpeza após sucesso
- **WHEN** o Claude Code termina com exit code 0
- **THEN** o sistema executa `git worktree remove /workspace/worktrees/issue-{id}/` e mantém o bare repo

#### Scenario: Limpeza após falha
- **WHEN** o Claude Code termina com exit code diferente de 0 ou por timeout
- **THEN** o sistema executa `git worktree remove --force /workspace/worktrees/issue-{id}/` e mantém o bare repo
