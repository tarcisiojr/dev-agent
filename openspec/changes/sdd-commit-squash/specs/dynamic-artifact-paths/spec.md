## ADDED Requirements

### Requirement: Slugify do título da issue
O sistema DEVE gerar um slug a partir do título da issue para compor o nome do diretório de artefatos SDD.

#### Scenario: Título com acentos e caracteres especiais
- **WHEN** o título da issue é "Corrige erro de validação no login!"
- **THEN** o slug gerado é "corrige-erro-de-validacao-no-login"

#### Scenario: Título longo truncado
- **WHEN** o título da issue excede 50 caracteres após slugify
- **THEN** o slug é truncado em 50 caracteres na última palavra completa, sem hífen final

#### Scenario: Título com múltiplos espaços e caracteres especiais
- **WHEN** o título contém espaços múltiplos, tabs ou caracteres como `@#$%`
- **THEN** todos são substituídos por um único hífen

### Requirement: Diretório de artefatos nomeado por issue
O sistema DEVE salvar artefatos SDD em `docs/specs/{issueId}-{slug}/` em vez do path fixo `docs/specs/`.

#### Scenario: Geração do diretório de artefatos
- **WHEN** o pipeline processa a issue #42 com título "Corrige erro de validação"
- **THEN** os artefatos são salvos em `docs/specs/42-corrige-erro-de-validacao/REQUIREMENTS.md`, `docs/specs/42-corrige-erro-de-validacao/DESIGN.md` e `docs/specs/42-corrige-erro-de-validacao/TASKS.md`

### Requirement: Prompts instruem paths dinâmicos
Os prompts de cada fase DEVEM instruir o Claude a usar o diretório dinâmico em vez do fixo `docs/specs/`.

#### Scenario: Prompt de requirements com path dinâmico
- **WHEN** a fase 1 (requirements) é executada para issue #42
- **THEN** o prompt instrui o Claude a criar o arquivo em `docs/specs/42-{slug}/REQUIREMENTS.md`

#### Scenario: Prompt de design referencia path dinâmico
- **WHEN** a fase 2 (design) é executada
- **THEN** o prompt instrui o Claude a ler requirements de `docs/specs/42-{slug}/REQUIREMENTS.md` e gerar design em `docs/specs/42-{slug}/DESIGN.md`
