## ADDED Requirements

### Requirement: Fila sequencial de execução
O sistema SHALL manter uma fila em memória e processar apenas uma issue por vez.

#### Scenario: Issue enfileirada com fila vazia
- **WHEN** uma issue é adicionada à fila e não há execução em andamento
- **THEN** o sistema inicia o processamento imediatamente

#### Scenario: Issue enfileirada com execução em andamento
- **WHEN** uma issue é adicionada à fila e já há uma execução em andamento
- **THEN** a issue aguarda na fila até a execução atual terminar

#### Scenario: Execução termina com fila não vazia
- **WHEN** a execução atual termina e há issues na fila
- **THEN** o sistema inicia o processamento da próxima issue

### Requirement: Diretórios isolados por issue
O sistema SHALL criar um diretório isolado para cada issue em `/workspace/issue-{id}/`.

#### Scenario: Novo diretório criado
- **WHEN** o processamento de uma issue inicia
- **THEN** o sistema cria o diretório `/workspace/issue-{id}/` se não existir e define como `cwd` do processo Claude

#### Scenario: Diretório já existe de execução anterior
- **WHEN** o diretório `/workspace/issue-{id}/` já existe
- **THEN** o sistema reutiliza o diretório existente (permite git pull em vez de clone)

### Requirement: Execução do Claude Code via spawn
O sistema SHALL executar o Claude Code CLI via `child_process.spawn` com o prompt passado via stdin.

#### Scenario: Execução iniciada
- **WHEN** o sistema inicia o processamento de uma issue
- **THEN** o sistema executa `claude -p - --allowedTools 'Bash,Read,Write,Edit,Glob,Grep' --dangerously-skip-permissions --max-turns 50` com o prompt no stdin

#### Scenario: Prompt montado corretamente
- **WHEN** o prompt é montado para o Claude
- **THEN** o prompt MUST conter: plataforma (gitlab/github), URL do repositório, ID da issue, título, descrição, instruções para criar branch `fix/issue-{id}`, rodar testes, fazer commit/push e abrir MR/PR

### Requirement: Timeout de execução
O sistema SHALL impor um timeout de 30 minutos para cada execução do Claude Code.

#### Scenario: Execução dentro do tempo
- **WHEN** o Claude Code termina antes de 30 minutos
- **THEN** o sistema processa o resultado normalmente

#### Scenario: Execução excede o timeout
- **WHEN** o Claude Code não termina em 30 minutos
- **THEN** o sistema mata o processo (SIGTERM), loga o timeout e comenta na issue que houve timeout

### Requirement: Comentário de início na issue
O sistema SHALL comentar na issue quando o processamento começar.

#### Scenario: Comentário de início no GitLab
- **WHEN** o processamento inicia para uma issue do GitLab
- **THEN** o sistema cria um comentário na issue via API do GitLab com mensagem indicando que o Claude iniciou o trabalho

#### Scenario: Comentário de início no GitHub
- **WHEN** o processamento inicia para uma issue do GitHub
- **THEN** o sistema cria um comentário na issue via API do GitHub com mensagem indicando que o Claude iniciou o trabalho

### Requirement: Comentário de resultado na issue
O sistema SHALL comentar na issue quando o processamento terminar, indicando sucesso ou falha.

#### Scenario: Sucesso no GitLab
- **WHEN** o Claude Code termina com exit code 0
- **THEN** o sistema comenta na issue do GitLab indicando sucesso

#### Scenario: Sucesso no GitHub
- **WHEN** o Claude Code termina com exit code 0
- **THEN** o sistema comenta na issue do GitHub indicando sucesso

#### Scenario: Falha
- **WHEN** o Claude Code termina com exit code diferente de 0
- **THEN** o sistema comenta na issue indicando falha

#### Scenario: Timeout
- **WHEN** a execução excede o timeout de 30 minutos
- **THEN** o sistema comenta na issue indicando que houve timeout

### Requirement: Logging de execução
O sistema SHALL logar no console o início, fim e resultado de cada execução.

#### Scenario: Log de início
- **WHEN** o processamento de uma issue inicia
- **THEN** o sistema loga: plataforma, ID da issue, título, usuário que trigou

#### Scenario: Log de fim
- **WHEN** o processamento termina
- **THEN** o sistema loga: ID da issue, exit code, duração da execução
