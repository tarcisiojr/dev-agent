## ADDED Requirements

### Requirement: Detectar evento de Pull Request no webhook
O sistema SHALL detectar eventos de Pull Request (GitHub) e Merge Request (GitLab) recebidos no endpoint `/webhook`, diferenciando-os de eventos de issue.

#### Scenario: Evento pull_request do GitHub
- **WHEN** webhook recebe request com header `x-github-event: pull_request`
- **THEN** o sistema identifica como evento de PR da plataforma GitHub

#### Scenario: Evento merge_request do GitLab
- **WHEN** webhook recebe request com payload `object_kind: merge_request`
- **THEN** o sistema identifica como evento de MR da plataforma GitLab

#### Scenario: Evento ignorado não-PR
- **WHEN** webhook recebe evento que não é issue nem PR/MR
- **THEN** o sistema retorna status 200 com `{ status: "ignored" }`

### Requirement: Filtrar por label ai-review adicionada
O sistema SHALL processar apenas eventos onde a label `ai-review` foi adicionada ao PR/MR, ignorando outros eventos de PR.

#### Scenario: Label ai-review adicionada no GitHub
- **WHEN** evento `pull_request` com action `labeled` e label.name `ai-review`
- **THEN** o sistema aceita o evento para processamento

#### Scenario: Label ai-review adicionada no GitLab
- **WHEN** evento `merge_request` com label `ai-review` presente em `changes.labels.current` mas não em `changes.labels.previous`
- **THEN** o sistema aceita o evento para processamento

#### Scenario: PR sem label ai-review
- **WHEN** evento de PR/MR sem a label `ai-review` sendo adicionada
- **THEN** o sistema ignora o evento e retorna `{ status: "ignored", reason: "ai-review label not added" }`

### Requirement: Validar usuário autorizado para review
O sistema SHALL validar que o usuário que adicionou a label está na lista `ALLOWED_USERS`, reutilizando a mesma lógica de autorização do fluxo ai-fix.

#### Scenario: Usuário autorizado
- **WHEN** usuário na lista ALLOWED_USERS adiciona label ai-review
- **THEN** o sistema aceita e enfileira o job de review

#### Scenario: Usuário não autorizado
- **WHEN** usuário fora da lista ALLOWED_USERS adiciona label ai-review
- **THEN** o sistema ignora o evento e retorna `{ status: "ignored", reason: "user not authorized" }`

### Requirement: Extrair dados do Pull Request
O sistema SHALL extrair do payload os dados necessários para o review: número do PR, título, branch source, branch target, URL do repositório, identificador do repositório e usuário.

#### Scenario: Extração de dados do GitHub
- **WHEN** evento de PR do GitHub é aceito
- **THEN** o sistema extrai `pull_request.number`, `pull_request.title`, `pull_request.head.ref`, `pull_request.base.ref`, `repository.clone_url`, `repository.full_name`, `sender.login`

#### Scenario: Extração de dados do GitLab
- **WHEN** evento de MR do GitLab é aceito
- **THEN** o sistema extrai `object_attributes.iid`, `object_attributes.title`, `object_attributes.source_branch`, `object_attributes.target_branch`, `project.git_http_url`, `project.path_with_namespace`, `user.username`

### Requirement: Enfileirar job de review
O sistema SHALL criar um job com `type: 'review'` e enfileirá-lo na fila sequencial existente, reutilizando a infraestrutura de fila, job store e retry.

#### Scenario: Job de review enfileirado
- **WHEN** evento de PR com ai-review é validado
- **THEN** o sistema cria job com `type: 'review'`, status `queued`, e adiciona à fila
- **THEN** o webhook retorna `{ status: "queued" }`
