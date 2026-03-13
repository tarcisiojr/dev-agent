# Design Técnico — Issue #5: Ignorar arquivos MD do review

## Contexto e Estado Atual

O fluxo de code review é iniciado em `executeReviewJob` (`automation/server.js:835`) e segue estas etapas:

1. `fetchPRDiff` (linha 284) — clona o repositório, faz checkout na branch fonte e retorna o diff bruto contra a branch base via `git diff origin/<target>...HEAD`.
2. `fetchDiffFileList` (linha 346) — retorna a lista de arquivos modificados via `git diff --name-only`.
3. O diff é passado a `buildCodeReviewPrompt`, que o envia ao Claude para análise.

Atualmente, **nenhum filtro** é aplicado antes de enviar o diff ao Claude: arquivos `.md` são incluídos na análise, consumindo tokens e potencialmente gerando comentários irrelevantes sobre documentação.

---

## Abordagem Técnica

### Estratégia escolhida: filtragem do diff em memória, pós-geração

Após o `git diff` produzir o diff completo, aplicar uma função de filtragem que:
1. Divide o diff em blocos por arquivo (cada bloco começa com `diff --git a/...`).
2. Descarta blocos cujo caminho termine com extensão ignorada (ex.: `.md`).
3. Retorna o diff filtrado para uso subsequente.

A filtragem acontece dentro de `fetchPRDiff`, antes de qualquer truncamento por tamanho — garantindo que o limite de 500 KB se aplique somente a conteúdo relevante.

A mesma lógica de extensões ignoradas é aplicada em `fetchDiffFileList` para manter consistência entre lista de arquivos e diff.

**Por que não usar `git diff -- ':(exclude)*.md'`?**
Seria possível usar um pathspec de exclusão diretamente no comando git. Porém, a filtragem em memória é preferível porque:
- Centraliza a lógica de exclusão em um único lugar (JS), independente de flags de git.
- Facilita adicionar extensões futuras sem alterar strings de shell.
- Evita diferenças de comportamento entre versões do git.

---

## Componentes e Arquivos Modificados

Apenas **`automation/server.js`** será modificado. Não serão criados novos arquivos.

### 1. Constante `IGNORED_REVIEW_EXTENSIONS` (nova)

```js
const IGNORED_REVIEW_EXTENSIONS = ['.md'];
```

Localização: logo abaixo da constante `MAX_DIFF_SIZE` (linha 281), agrupando as constantes de review.

Esta constante centraliza as extensões ignoradas, atendendo ao RNF-02 (manutenibilidade).

### 2. Função auxiliar `filterDiff(diff, ignoredExts)` (nova)

```js
function filterDiff(diff, ignoredExts) { ... }
```

**Algoritmo:**
- Divide o diff em blocos usando a expressão regular `/(?=^diff --git )/m` como separador.
- Para cada bloco, extrai o caminho do arquivo da linha `diff --git a/<path> b/<path>`.
- Descarta o bloco se o caminho terminar com uma das extensões em `ignoredExts`.
- Concatena e retorna os blocos restantes.

**Tratamento de edge cases:**
- Diff vazio (`''`): retorna `''` sem processar.
- Bloco sem caminho detectável: mantido (comportamento conservador).

### 3. Modificação de `fetchPRDiff` (linha 284)

Após obter o diff bruto do git e **antes** de aplicar o truncamento por `MAX_DIFF_SIZE`, aplicar:

```js
diff = filterDiff(diff, IGNORED_REVIEW_EXTENSIONS);
```

O truncamento permanece após a filtragem, pois o diff filtrado ainda pode ser grande para PRs com muitos arquivos de código.

### 4. Modificação de `fetchDiffFileList` (linha 346)

Após obter a lista via `git diff --name-only`, filtrar arquivos com extensão ignorada:

```js
.filter(f => !IGNORED_REVIEW_EXTENSIONS.some(ext => f.endsWith(ext)))
```

### 5. Tratamento de diff vazio em `executeReviewJob` (linha 835)

Após chamar `fetchPRDiff`, verificar se o diff resultante está vazio:

```js
if (!diff || diff.trim() === '') {
  await commentOnPR(job, '📄 Este PR contém apenas arquivos de documentação (.md). Nenhum arquivo de código para revisar.');
  job.status = 'done';
  upsertJob(job);
  return;
}
```

Este bloco é inserido antes da chamada a `fetchExistingComments` e `buildCodeReviewPrompt`, evitando invocação desnecessária do Claude.

---

## Modelos de Dados

Sem alterações em estruturas de dados. Nenhum campo novo no objeto `job` é necessário.

---

## Decisões Técnicas

| Decisão | Escolha | Alternativa considerada | Justificativa |
|---|---|---|---|
| Onde filtrar | Em memória, dentro de `fetchPRDiff` | Pathspec do git (`:(exclude)*.md`) | Centralização em JS; independente de versão do git |
| Quando filtrar | Antes do truncamento por tamanho | Depois do truncamento | Garante que o limite de 500KB incide sobre conteúdo relevante |
| Onde centralizar extensões | Constante `IGNORED_REVIEW_EXTENSIONS` | Constante inline / env var | Simples, sem over-engineering; env var fora do escopo |
| Resposta para diff vazio | Comentar no PR e encerrar com `status: done` | Encerrar silenciosamente / status `skipped` | Comunicação transparente ao usuário; `done` é semanticamente correto (nenhuma ação necessária) |

---

## Riscos e Trade-offs

### Risco 1 — Falso negativo no parsing do diff
O algoritmo usa `diff --git a/<path>` para identificar o arquivo. Caminhos com espaços ou caracteres especiais são representados com aspas pelo git; a regex precisará cobrir ambos os formatos (`diff --git a/foo.md` e `diff --git "a/foo bar.md"`).

**Mitigação:** Implementar extração de caminho que trate aspas e escape de caracteres conforme o formato padrão do git.

### Risco 2 — Diff vazio em PRs apenas-MD
Tratar como `done` e comentar no PR é a abordagem mais clara, mas o job não reaparecerá na fila para revisão posterior caso arquivos de código sejam adicionados ao PR depois. Entretanto, re-adicionar o label `ai-review` dispara um novo job, então o comportamento é aceitável.

### Trade-off — Filtragem apenas de `.md`
Arquivos `.mdx`, `.rst`, `.txt` não são filtrados (RF-04). A constante `IGNORED_REVIEW_EXTENSIONS` é facilmente extensível no futuro.

---

## Resumo das Alterações

| Arquivo | Tipo | Descrição |
|---|---|---|
| `automation/server.js` | Modificação | Adicionar constante `IGNORED_REVIEW_EXTENSIONS` |
| `automation/server.js` | Modificação | Adicionar função `filterDiff` |
| `automation/server.js` | Modificação | Chamar `filterDiff` dentro de `fetchPRDiff` |
| `automation/server.js` | Modificação | Filtrar extensões em `fetchDiffFileList` |
| `automation/server.js` | Modificação | Tratar diff vazio em `executeReviewJob` |
