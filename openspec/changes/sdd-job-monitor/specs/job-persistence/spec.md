## ADDED Requirements

### Requirement: Persistência de jobs em arquivo JSON
O sistema SHALL persistir o estado de todos os jobs em `/workspace/jobs.json`. Cada job SHALL conter: id, issueId, platform, repoIdentifier, repoUrl, title, description, status, phase, currentTask, totalTasks, retryCount, createdAt, updatedAt e um mapa de fases com seus estados.

#### Scenario: Novo job é persistido ao ser enfileirado
- **WHEN** um webhook válido chega e o job é criado
- **THEN** o sistema SHALL gravar o job em `jobs.json` com status `queued` e phase `null`

#### Scenario: Estado é atualizado a cada transição de fase
- **WHEN** uma fase do pipeline é concluída com sucesso
- **THEN** o sistema SHALL atualizar o job em `jobs.json` com a fase marcada como `done`, avançar para a próxima phase e atualizar o timestamp `updatedAt`

#### Scenario: Estado é atualizado a cada task concluída
- **WHEN** uma task da fase implementation é concluída
- **THEN** o sistema SHALL atualizar `currentTask` e `updatedAt` no `jobs.json`

### Requirement: Escrita atômica do jobs.json
O sistema SHALL usar escrita atômica (write-to-temp + rename) para evitar corrupção do arquivo em caso de crash durante escrita.

#### Scenario: Crash durante escrita
- **WHEN** o processo morre durante a escrita do `jobs.json`
- **THEN** o arquivo original SHALL permanecer intacto (a escrita parcial fica no arquivo temporário)

### Requirement: Geração de ID único para jobs
O sistema SHALL gerar IDs de job no formato `{platform}-{slug}-{issueId}` (ex: `github-tarcisiojr-ai-toolkit-42`).

#### Scenario: ID é derivado dos dados da issue
- **WHEN** um job é criado a partir de um webhook
- **THEN** o ID SHALL ser composto de platform, repoIdentifier convertido em slug e issueId
