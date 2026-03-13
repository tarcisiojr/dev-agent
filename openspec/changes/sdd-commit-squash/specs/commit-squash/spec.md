## ADDED Requirements

### Requirement: Squash de commits SDD após fase 3
O sistema DEVE executar um squash de todos os commits das fases 1-3 (requirements, design, tasks) em um único commit após a conclusão bem-sucedida da fase 3 (tasks).

#### Scenario: Squash SDD bem-sucedido
- **WHEN** a fase 3 (tasks) completa com sucesso
- **THEN** o sistema executa `git reset --soft origin/main` seguido de `git commit` com mensagem `docs(sdd): specs para issue #{issueId} - {titulo}` no worktree

#### Scenario: Nenhum commit SDD para squash
- **WHEN** a fase 3 completa mas não há commits novos na branch (origin/main..HEAD vazio)
- **THEN** o sistema pula o squash e prossegue normalmente

### Requirement: Squash de commits de implementação após fase 4
O sistema DEVE executar um squash de todos os commits da fase 4 (implementation) em um único commit após a conclusão bem-sucedida da fase 4.

#### Scenario: Squash de implementação bem-sucedido
- **WHEN** a fase 4 (implementation) completa com sucesso
- **THEN** o sistema identifica o hash do commit SDD (primeiro commit após origin/main), executa `git reset --soft {sddHash}` seguido de `git commit` com mensagem `fix: {titulo} #{issueId}` no worktree

#### Scenario: Retry da fase 4 com commits parciais
- **WHEN** a fase 4 falha, é retried e completa com sucesso
- **THEN** o squash junta todos os commits parciais (das tentativas anteriores e da atual) em um único commit sobre o commit SDD

### Requirement: PR com exatamente 2 commits
Após as fases de squash, a branch DEVE conter exatamente 2 commits em relação a origin/main.

#### Scenario: Estrutura de commits do PR
- **WHEN** a fase 5 (finalize) faz push da branch
- **THEN** o PR contém commit 1 com artefatos SDD e commit 2 com código de implementação
