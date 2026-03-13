# Requisitos — Issue #5: Ignorar arquivos MD do review

## Resumo do Problema

Durante o processo de code review automatizado, o agente analisa o diff completo de um PR, incluindo arquivos Markdown (`.md`). Arquivos de documentação raramente contêm bugs, vulnerabilidades de segurança ou problemas de performance — os focos principais do review automatizado. Incluí-los gera ruído desnecessário, consome tokens e tempo de processamento, e pode produzir comentários irrelevantes sobre conteúdo textual que não é código executável.

## Requisitos Funcionais

### RF-01 — Filtrar arquivos `.md` do diff de review
O sistema deve excluir arquivos com extensão `.md` do diff enviado ao Claude para análise de code review.

### RF-02 — Filtrar arquivos `.md` da lista de arquivos modificados
A lista de arquivos retornada por `fetchDiffFileList` também deve excluir arquivos `.md`, pois essa lista pode ser usada para análise de impacto (busca de chamadores, etc.).

### RF-03 — Manter comportamento quando nenhum arquivo não-MD é alterado
Se um PR contiver apenas arquivos `.md`, o sistema deve lidar graciosamente com o diff vazio — seja ignorando o review ou postando uma mensagem adequada ao invés de invocar o Claude com diff vazio.

### RF-04 — Não impactar outros tipos de arquivo
Apenas arquivos `.md` devem ser filtrados. Arquivos `.mdx`, `.rst`, `.txt` e outros não devem ser afetados a menos que especificado futuramente.

## Requisitos Não-Funcionais

### RNF-01 — Performance
A filtragem deve ser feita antes de passar o diff ao Claude, reduzindo o tamanho do payload processado e, consequentemente, o custo de tokens e tempo de resposta.

### RNF-02 — Manutenibilidade
A lista de extensões a ignorar deve estar centralizada em um único local no código (constante ou configuração), facilitando adições futuras.

## Escopo

### Incluído
- Filtragem de arquivos `.md` no diff gerado por `fetchPRDiff` em `automation/server.js`
- Filtragem de arquivos `.md` na lista retornada por `fetchDiffFileList` em `automation/server.js`
- Tratamento do caso de diff vazio após filtragem (PR contendo apenas arquivos `.md`)

### Excluído
- Filtragem de outros tipos de arquivo de documentação (`.rst`, `.txt`, `.mdx`, etc.) — pode ser adicionado futuramente
- Modificação do pipeline SDD (fases de requirements, design, tasks, implementation, finalize) — essas fases trabalham com código, não com diffs de PR
- Configuração dinâmica via variável de ambiente ou arquivo de config (fora do escopo desta issue)

## Critérios de Aceitação

### CA-01
**Dado** um PR que modifica arquivos `.md` e arquivos de código,
**Quando** o review for executado,
**Então** o diff enviado ao Claude não deve conter nenhuma entrada de arquivo `.md` (linhas `diff --git`, `--- a/`, `+++ b/` referentes a arquivos `.md`).

### CA-02
**Dado** um PR que modifica apenas arquivos `.md`,
**Quando** o review for executado,
**Então** o sistema não deve invocar o Claude com um diff vazio — deve postar uma mensagem informando que não há arquivos de código a revisar e encerrar o job com status `done`.

### CA-03
**Dado** um PR que não contém nenhum arquivo `.md`,
**Quando** o review for executado,
**Então** o comportamento deve ser idêntico ao atual (sem regressão).

### CA-04
**Dado** um PR que modifica arquivos `.mdx` ou outros formatos similares,
**Quando** o review for executado,
**Então** esses arquivos **não** devem ser filtrados (apenas `.md` é excluído).

### CA-05
**Dado** a lista de extensões ignoradas,
**Quando** um desenvolvedor precisar adicionar novas extensões no futuro,
**Então** deve existir uma única constante/variável no código onde essa adição pode ser feita.
