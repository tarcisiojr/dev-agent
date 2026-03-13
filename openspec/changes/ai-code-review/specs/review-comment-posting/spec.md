## ADDED Requirements

### Requirement: Postar inline review comments no GitHub
O sistema SHALL postar os comments do review como inline comments no PR do GitHub usando a API de PR reviews, em uma única request batch.

#### Scenario: Review com comments postado no GitHub
- **WHEN** Claude retorna JSON com comments e plataforma é GitHub
- **THEN** o sistema posta via `POST /repos/{owner}/{repo}/pulls/{number}/reviews` com `event` (APPROVE ou REQUEST_CHANGES), `body` (summary) e `comments[]` contendo `path`, `line` e `body` para cada comment

#### Scenario: Review sem comments no GitHub
- **WHEN** Claude retorna JSON com comments vazio e verdict APPROVE
- **THEN** o sistema posta review com event APPROVE e body contendo apenas o summary

### Requirement: Postar inline review comments no GitLab
O sistema SHALL postar os comments do review como discussions inline no MR do GitLab, uma request por comment.

#### Scenario: Review com comments postado no GitLab
- **WHEN** Claude retorna JSON com comments e plataforma é GitLab
- **THEN** o sistema posta cada comment via `POST /projects/{id}/merge_requests/{iid}/discussions` com `position` contendo `position_type: "text"`, `new_path`, `new_line`, `base_sha`, `head_sha`, `start_sha`

#### Scenario: Review summary postado no GitLab
- **WHEN** review do GitLab é concluído
- **THEN** o sistema posta um comment geral (nota) no MR com o summary e veredito

### Requirement: Formatar corpo do comment com severidade e categoria
O corpo de cada inline comment MUST incluir indicadores visuais de severidade e categoria para facilitar a leitura.

#### Scenario: Formato do comment
- **WHEN** comment é postado
- **THEN** o body segue o formato: emoji de severidade + `**[Severidade: X]**` + `**Categoria**` + quebra de linha + corpo da análise

#### Scenario: Emojis de severidade
- **WHEN** severidade é `critical`
- **THEN** emoji é 🔴
- **WHEN** severidade é `high`
- **THEN** emoji é 🟠
- **WHEN** severidade é `medium`
- **THEN** emoji é 🟡
- **WHEN** severidade é `low`
- **THEN** emoji é 🔵

### Requirement: Comentar na PR ao iniciar e finalizar review
O sistema SHALL postar um comentário geral no PR ao iniciar o review e outro ao finalizar.

#### Scenario: Comentário de início
- **WHEN** job de review inicia execução
- **THEN** o sistema comenta no PR: "🤖 **Claude Code** está revisando este PR..."

#### Scenario: Comentário de conclusão com sucesso
- **WHEN** review é concluído com sucesso
- **THEN** o sistema comenta no PR com resumo: veredito, quantidade de comments por severidade, duração

#### Scenario: Comentário de falha
- **WHEN** review falha após todas as tentativas de retry
- **THEN** o sistema comenta no PR: "🆘 Não consegui completar o review. Preciso de ajuda humana."

### Requirement: Tratar erros de API ao postar comments
O sistema SHALL tratar erros de API ao postar comments, logando o erro sem interromper o fluxo.

#### Scenario: Erro ao postar comment individual
- **WHEN** API retorna erro ao postar um comment inline
- **THEN** o sistema loga o erro e continua postando os comments restantes

#### Scenario: Erro ao postar review batch no GitHub
- **WHEN** API do GitHub retorna erro ao postar o review
- **THEN** o sistema trata como falha da fase e aplica retry
