## ADDED Requirements

### Requirement: Clonar repositório e preparar branch do PR
O sistema SHALL clonar o repositório e fazer checkout na branch do PR para análise, em um diretório de trabalho isolado.

#### Scenario: Setup do repositório para review
- **WHEN** job de review inicia execução
- **THEN** o sistema clona o repositório em diretório isolado e faz checkout na branch source do PR

### Requirement: Obter diff do PR contra branch base
O sistema SHALL obter o diff entre a branch do PR e a branch base (target) para fornecer ao Claude como entrada de análise.

#### Scenario: Diff obtido com sucesso
- **WHEN** repositório está clonado e branch ativa
- **THEN** o sistema executa `git diff {target}...HEAD` e captura o resultado

#### Scenario: Diff muito grande
- **WHEN** diff excede 500KB
- **THEN** o sistema trunca o diff e inclui aviso no comment do PR de que o review foi parcial

### Requirement: Buscar comentários existentes do PR
O sistema SHALL buscar comentários de review existentes no PR via API da plataforma antes de spawnar o Claude, para evitar repetição de problemas já discutidos.

#### Scenario: Buscar comments no GitHub
- **WHEN** plataforma é GitHub
- **THEN** o sistema consulta `GET /repos/{owner}/{repo}/pulls/{number}/comments` e formata como contexto textual

#### Scenario: Buscar discussions no GitLab
- **WHEN** plataforma é GitLab
- **THEN** o sistema consulta `GET /projects/{id}/merge_requests/{iid}/discussions` e formata como contexto textual

#### Scenario: PR sem comentários anteriores
- **WHEN** PR não tem comentários de review
- **THEN** o contexto de comentários é informado como vazio no prompt

### Requirement: Construir prompt de review com contexto completo
O sistema SHALL construir um prompt para o Claude contendo o diff, comentários existentes e instruções de análise, solicitando output em JSON estruturado.

#### Scenario: Prompt inclui diff e comentários existentes
- **WHEN** diff e comentários foram obtidos
- **THEN** o prompt inclui o diff completo, lista de comentários existentes com autor e conteúdo, e instrução explícita para não repetir problemas já cobertos

#### Scenario: Prompt instrui análise de impacto
- **WHEN** prompt é construído
- **THEN** o prompt instrui o Claude a verificar contratos alterados (assinaturas de funções, APIs, interfaces) e buscar consumidores no repositório que seriam afetados

### Requirement: Claude retorna JSON estruturado com review
O Claude MUST retornar um JSON válido contendo `verdict` (APPROVE ou REQUEST_CHANGES), `summary` (resumo textual) e `comments` (array de inline comments com path, line, severity, category e body).

#### Scenario: Review com problemas encontrados
- **WHEN** Claude encontra problemas no diff
- **THEN** retorna JSON com `verdict: "REQUEST_CHANGES"`, summary descritivo e array de comments com severidade e categoria

#### Scenario: Review sem problemas
- **WHEN** Claude não encontra problemas significativos no diff
- **THEN** retorna JSON com `verdict: "APPROVE"`, summary positivo e array de comments vazio ou com observações informativas

#### Scenario: JSON inválido retornado
- **WHEN** output do Claude não é JSON válido
- **THEN** o sistema trata como falha e aplica retry (até maxRetries)

### Requirement: Categorias e severidades do review
Os comments do review MUST usar categorias e severidades padronizadas para facilitar a triagem.

#### Scenario: Categorias suportadas
- **WHEN** Claude gera um comment
- **THEN** a categoria é uma de: `bug`, `security`, `breaking_change`, `performance`, `quality`

#### Scenario: Severidades suportadas
- **WHEN** Claude gera um comment
- **THEN** a severidade é uma de: `critical`, `high`, `medium`, `low`
