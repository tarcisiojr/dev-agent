## ADDED Requirements

### Requirement: Comentário de início
O sistema SHALL comentar na issue quando um job inicia processamento.

#### Scenario: Job inicia
- **WHEN** um job começa a ser processado
- **THEN** o sistema SHALL comentar na issue: `🤖 Analisando issue...`

### Requirement: Comentário a cada transição de fase
O sistema SHALL comentar na issue quando cada fase do pipeline SDD é concluída com sucesso.

#### Scenario: Fase requirements concluída
- **WHEN** a fase requirements termina com sucesso
- **THEN** o sistema SHALL comentar: `📋 Requisitos definidos`

#### Scenario: Fase design concluída
- **WHEN** a fase design termina com sucesso
- **THEN** o sistema SHALL comentar: `🏗️ Design definido`

#### Scenario: Fase tasks concluída
- **WHEN** a fase tasks termina com sucesso
- **THEN** o sistema SHALL comentar: `📝 N tarefas identificadas` onde N é o total de tasks no TASKS.md

### Requirement: Comentário de progresso por task
O sistema SHALL comentar na issue a cada task concluída durante a fase implementation.

#### Scenario: Task concluída durante implementation
- **WHEN** a fase implementation completa uma task (detectada via polling do TASKS.md ou no final da fase)
- **THEN** o sistema SHALL comentar: `⚙️ Task N/M concluída` onde N é o índice e M o total

### Requirement: Comentário de conclusão
O sistema SHALL comentar na issue ao final do pipeline, indicando sucesso, falha ou timeout.

#### Scenario: Pipeline concluído com sucesso
- **WHEN** a fase implementation termina com exit code 0 e PR/MR foi criado
- **THEN** o sistema SHALL comentar: `✅ PR criado. Por favor, revise as mudanças.`

#### Scenario: Pipeline falhou
- **WHEN** qualquer fase falha e retries estão esgotados
- **THEN** o sistema SHALL comentar: `🆘 Não consegui resolver após múltiplas tentativas. Preciso de ajuda humana.`

#### Scenario: Timeout
- **WHEN** qualquer fase excede o timeout de 30 minutos
- **THEN** o sistema SHALL comentar: `⏱️ Fase excedeu tempo limite. Retentando automaticamente...` (se retries disponíveis)
