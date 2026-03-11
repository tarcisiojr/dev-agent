## ADDED Requirements

### Requirement: Servidor HTTP na porta 9000
O sistema SHALL iniciar um servidor HTTP na porta 9000 que aceita apenas requisições `POST /webhook`. Qualquer outra rota ou método SHALL retornar status 404.

#### Scenario: Request válido na rota correta
- **WHEN** uma requisição POST é enviada para `/webhook`
- **THEN** o servidor processa o payload e retorna status 200

#### Scenario: Rota inexistente
- **WHEN** uma requisição é enviada para qualquer rota diferente de `/webhook`
- **THEN** o servidor retorna status 404

#### Scenario: Método não permitido
- **WHEN** uma requisição GET, PUT ou DELETE é enviada para `/webhook`
- **THEN** o servidor retorna status 404

### Requirement: Detecção automática de plataforma
O sistema SHALL detectar a plataforma de origem (GitLab ou GitHub) pelos headers HTTP do request.

#### Scenario: Request do GitLab
- **WHEN** o request contém o header `x-gitlab-token`
- **THEN** o sistema usa o parser de payload GitLab

#### Scenario: Request do GitHub
- **WHEN** o request contém o header `x-github-event`
- **THEN** o sistema usa o parser de payload GitHub

#### Scenario: Plataforma não reconhecida
- **WHEN** o request não contém nenhum header de plataforma conhecida
- **THEN** o sistema retorna status 400 e loga o erro

### Requirement: Validação de token do webhook GitLab
O sistema SHALL validar o header `x-gitlab-token` contra a variável de ambiente `GITLAB_SECRET`.

#### Scenario: Token válido
- **WHEN** o valor de `x-gitlab-token` é igual a `GITLAB_SECRET`
- **THEN** o sistema continua o processamento

#### Scenario: Token inválido
- **WHEN** o valor de `x-gitlab-token` é diferente de `GITLAB_SECRET`
- **THEN** o sistema retorna status 401 e loga a tentativa

### Requirement: Validação de assinatura HMAC do GitHub
O sistema SHALL validar o header `x-hub-signature-256` usando HMAC SHA256 com a variável `GITHUB_WEBHOOK_SECRET`.

#### Scenario: Assinatura válida
- **WHEN** o HMAC SHA256 do body com `GITHUB_WEBHOOK_SECRET` corresponde ao header `x-hub-signature-256`
- **THEN** o sistema continua o processamento

#### Scenario: Assinatura inválida
- **WHEN** o HMAC não corresponde
- **THEN** o sistema retorna status 401 e loga a tentativa

### Requirement: Filtro por evento de issue
O sistema SHALL processar apenas eventos relacionados a issues.

#### Scenario: Evento de issue do GitLab
- **WHEN** o payload contém `object_kind === "issue"`
- **THEN** o sistema continua o processamento

#### Scenario: Evento de issue do GitHub
- **WHEN** o header `x-github-event` é `"issues"`
- **THEN** o sistema continua o processamento

#### Scenario: Outro tipo de evento
- **WHEN** o evento não é de issue
- **THEN** o sistema retorna 200 e ignora silenciosamente

### Requirement: Filtro por label ai-fix adicionada
O sistema SHALL processar apenas quando a label `ai-fix` foi ADICIONADA no evento atual, não quando já existia.

#### Scenario: Label ai-fix adicionada no GitLab
- **WHEN** `changes.labels.current` contém `ai-fix` E `changes.labels.previous` não contém `ai-fix`
- **THEN** o sistema continua o processamento

#### Scenario: Label ai-fix adicionada no GitHub
- **WHEN** `action === "labeled"` E `label.name === "ai-fix"`
- **THEN** o sistema continua o processamento

#### Scenario: Label ai-fix já existia
- **WHEN** a label `ai-fix` já estava na issue antes do evento
- **THEN** o sistema retorna 200 e ignora

### Requirement: Validação de usuário autorizado
O sistema SHALL verificar se o usuário que adicionou a label está na lista `ALLOWED_USERS`.

#### Scenario: Usuário autorizado no GitLab
- **WHEN** `user.username` do payload está em `ALLOWED_USERS`
- **THEN** o sistema continua o processamento

#### Scenario: Usuário autorizado no GitHub
- **WHEN** `sender.login` do payload está em `ALLOWED_USERS`
- **THEN** o sistema continua o processamento

#### Scenario: Usuário não autorizado
- **WHEN** o usuário não está em `ALLOWED_USERS`
- **THEN** o sistema retorna 200, loga o evento e ignora

### Requirement: Extração de dados do issue
O sistema SHALL extrair os dados necessários do payload para montar o prompt e feedback.

#### Scenario: Dados extraídos do GitLab
- **WHEN** o payload é do GitLab
- **THEN** o sistema extrai: `object_attributes.iid` (id), `object_attributes.title` (título), `object_attributes.description` (descrição), `project.git_http_url` (URL do repo), `project.id` (project ID)

#### Scenario: Dados extraídos do GitHub
- **WHEN** o payload é do GitHub
- **THEN** o sistema extrai: `issue.number` (id), `issue.title` (título), `issue.body` (descrição), `repository.clone_url` (URL do repo), `repository.full_name` (repo identifier)

### Requirement: Resposta imediata ao webhook
O sistema SHALL responder com status 200 imediatamente após enfileirar a issue, sem aguardar a execução do Claude Code.

#### Scenario: Resposta rápida
- **WHEN** o webhook passa por todas as validações
- **THEN** o sistema responde 200 com body `{ "status": "queued" }` em menos de 1 segundo
