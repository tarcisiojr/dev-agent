# Requisitos — Issue #12: Comentário duplicado em `executeReviewJob`

## Resumo do Problema

No arquivo `automation/server.js`, dentro da função `executeReviewJob`, existe um comentário duplicado: `// Ponto de verificação 2` aparece duas vezes seguidas — uma na linha ~916 (para inspeção do `diff`) e outra na linha ~927 (para inspeção do `existingComments`). Isso prejudica a legibilidade e a rastreabilidade do código, pois ambos os blocos fazem coisas diferentes mas possuem o mesmo rótulo.

**Localização exata:**
- `automation/server.js:916` — `// Ponto de verificação 2 — verificar diff antes de passar ao Claude`
- `automation/server.js:927` — `// Ponto de verificação 2 — verificar existingComments antes de passar ao Claude`

## Requisitos Funcionais

1. O comentário na linha 916 deve identificar de forma única o ponto de verificação de injeção sobre o `diff`. Pode permanecer como `// Ponto de verificação 2` (já tem sufixo descritivo) ou ser renomeado para algo como `// Verificação de injeção no diff`.
2. O comentário na linha 927 deve ser renomeado para identificar de forma única o ponto de verificação de injeção sobre os `existingComments`. Deve ser numerado sequencialmente como `// Ponto de verificação 3` ou receber um nome descritivo como `// Verificação de injeção nos comentários existentes`.
3. Nenhum outro comportamento de runtime deve ser alterado — apenas os textos dos comentários.

## Requisitos Não-Funcionais

- **Legibilidade:** Após a correção, cada ponto de verificação dentro de `executeReviewJob` deve ter um identificador único e autoexplicativo.
- **Consistência:** O estilo do comentário corrigido deve seguir o padrão já utilizado nos demais pontos de verificação do arquivo (ex: `// Ponto de verificação 1 — review job: verificar title` na linha ~1086).

## Escopo

### Incluído
- Correção dos dois comentários duplicados em `automation/server.js` dentro de `executeReviewJob` (linhas ~916 e ~927).

### Excluído
- Qualquer alteração de lógica, comportamento ou estrutura do código.
- Outros arquivos que não sejam `automation/server.js`.
- Refatoração de outros comentários no arquivo.

## Critérios de Aceitação

1. O arquivo `automation/server.js` não deve conter dois comentários com o texto `// Ponto de verificação 2` idêntico (ou com o mesmo número de sequência repetido na mesma função).
2. O comentário referente à verificação de `diff` e o comentário referente à verificação de `existingComments` devem ser distintos e identificáveis.
3. Nenhum teste existente deve falhar após a alteração.
4. O comportamento em runtime de `executeReviewJob` deve ser idêntico ao anterior (a mudança é puramente cosmética).
