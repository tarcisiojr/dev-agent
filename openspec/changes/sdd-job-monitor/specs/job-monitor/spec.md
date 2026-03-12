## ADDED Requirements

### Requirement: Recovery de jobs na inicialização
O sistema SHALL ler `jobs.json` na inicialização e re-enfileirar jobs que não foram concluídos.

#### Scenario: Job com status running encontrado na inicialização
- **WHEN** o servidor inicia e encontra um job com status `running` no jobs.json
- **THEN** o sistema SHALL marcar o job como `interrupted`, incrementar retryCount da fase atual e re-enfileirar o job para retomar da última fase completa

#### Scenario: Job com status queued encontrado na inicialização
- **WHEN** o servidor inicia e encontra um job com status `queued` no jobs.json
- **THEN** o sistema SHALL re-enfileirar o job mantendo seu estado original

#### Scenario: Jobs concluídos ou falhados são ignorados
- **WHEN** o servidor inicia e encontra jobs com status `done`, `failed` ou `needs_help`
- **THEN** o sistema SHALL ignorar esses jobs (não re-enfileirar)

### Requirement: Retry automático com limite
O sistema SHALL retentar automaticamente fases que falharam, com limite de 3 tentativas por fase.

#### Scenario: Fase falha e retry está dentro do limite
- **WHEN** uma fase falha (exit code != 0 ou timeout) e retryCount da fase < 3
- **THEN** o sistema SHALL incrementar retryCount, marcar status como `queued` e re-enfileirar para retomar da fase que falhou

#### Scenario: Fase falha e limite de retries atingido
- **WHEN** uma fase falha e retryCount da fase >= 3
- **THEN** o sistema SHALL marcar o status do job como `needs_help` e comentar na issue pedindo intervenção humana

### Requirement: Retomada da última fase completa
O sistema SHALL retomar jobs interrompidos a partir da última fase completada com sucesso, sem reexecutar fases anteriores.

#### Scenario: Job interrompido na fase design com requirements completo
- **WHEN** um job é retomado e a fase `requirements` está marcada como `done` e `design` como `running`
- **THEN** o sistema SHALL iniciar a execução a partir da fase `design`, sem reexecutar `requirements`

#### Scenario: Job interrompido na fase implementation
- **WHEN** um job é retomado na fase `implementation`
- **THEN** o sistema SHALL iniciar a fase `implementation` e o prompt SHALL instruir o Claude a continuar das tasks pendentes no TASKS.md
