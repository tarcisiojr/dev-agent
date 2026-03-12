## ADDED Requirements

### Requirement: Pipeline de 4 fases
O sistema SHALL executar cada job em 4 fases sequenciais: `requirements`, `design`, `tasks`, `implementation`. Cada fase SHALL ser um spawn separado do Claude Code.

#### Scenario: Execução completa de um job
- **WHEN** um job inicia processamento
- **THEN** o sistema SHALL executar as fases na ordem: requirements → design → tasks → implementation, avançando apenas quando a fase anterior produzir seu artefato com sucesso

### Requirement: Fase requirements
O sistema SHALL spawnar o Claude Code com um prompt que instrui a analisar a issue e gerar `docs/specs/REQUIREMENTS.md` no worktree, separando requisitos funcionais e não-funcionais.

#### Scenario: Geração de requisitos
- **WHEN** a fase requirements inicia
- **THEN** o Claude SHALL receber o título, descrição da issue e acesso ao código do repo, e produzir `docs/specs/REQUIREMENTS.md`

#### Scenario: Verificação do artefato
- **WHEN** o spawn do Claude termina com exit code 0
- **THEN** o sistema SHALL verificar que `docs/specs/REQUIREMENTS.md` existe no worktree antes de marcar a fase como concluída

### Requirement: Fase design
O sistema SHALL spawnar o Claude Code com um prompt que instrui a ler `docs/specs/REQUIREMENTS.md` e gerar `docs/specs/DESIGN.md` com arquitetura, modelos de dados e decisões técnicas.

#### Scenario: Geração de design
- **WHEN** a fase design inicia
- **THEN** o Claude SHALL receber referência ao REQUIREMENTS.md e produzir `docs/specs/DESIGN.md`

### Requirement: Fase tasks
O sistema SHALL spawnar o Claude Code com um prompt que instrui a ler REQUIREMENTS.md e DESIGN.md e gerar `docs/specs/TASKS.md` com checklist de tarefas atômicas no formato `- [ ] <descrição>`.

#### Scenario: Geração de tarefas
- **WHEN** a fase tasks inicia
- **THEN** o Claude SHALL produzir `docs/specs/TASKS.md` com tarefas no formato checkbox markdown

### Requirement: Fase implementation
O sistema SHALL spawnar o Claude Code com um prompt que instrui a ler todos os artefatos SDD e implementar as tarefas listadas em TASKS.md, fazendo commit a cada task e marcando `- [x]` no TASKS.md.

#### Scenario: Implementação task por task
- **WHEN** a fase implementation inicia
- **THEN** o Claude SHALL implementar cada task pendente (`- [ ]`) do TASKS.md, fazer commit e marcar como `- [x]`

#### Scenario: Continuação de implementação parcial
- **WHEN** a fase implementation inicia e já existem tasks marcadas como `- [x]`
- **THEN** o Claude SHALL continuar a partir da primeira task pendente (`- [ ]`)

### Requirement: Prompts especializados por fase
Cada fase SHALL ter um prompt builder dedicado que inclui: contexto da issue, instrução específica da fase, referência aos artefatos anteriores e regra de autonomia máxima.

#### Scenario: Prompt inclui regra de autonomia
- **WHEN** qualquer prompt de fase é gerado
- **THEN** o prompt SHALL instruir o Claude a tomar decisões sozinho, sem pedir input ao usuário, e a documentar decisões tomadas

### Requirement: Artefatos no diretório docs/specs
Todos os artefatos SDD SHALL ser criados em `docs/specs/` dentro do worktree, para que sejam incluídos no PR como documentação.

#### Scenario: Estrutura de diretório no worktree
- **WHEN** a primeira fase inicia
- **THEN** o sistema SHALL garantir que o diretório `docs/specs/` existe no worktree

### Requirement: Push e PR na conclusão
Ao concluir a fase implementation com todas as tasks marcadas, o prompt SHALL instruir o Claude a fazer push da branch e abrir PR/MR.

#### Scenario: Todas as tasks concluídas
- **WHEN** o Claude termina a fase implementation e todas as tasks estão `- [x]`
- **THEN** o Claude SHALL fazer push e abrir PR/MR conforme a plataforma (gh/glab)
