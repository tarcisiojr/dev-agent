# Design Técnico — Issue #12: Comentário duplicado em `executeReviewJob`

## Contexto e Estado Atual

No arquivo `automation/server.js`, a função `executeReviewJob` contém dois pontos de verificação de injeção de prompt (prompt injection) com identificadores idênticos:

- **Linha 916:** `// Ponto de verificação 2 — verificar diff antes de passar ao Claude`
- **Linha 927:** `// Ponto de verificação 2 — verificar existingComments antes de passar ao Claude`

Ambos têm o mesmo número de sequência (`2`), o que prejudica legibilidade e rastreabilidade. O padrão existente no arquivo usa numeração sequencial com sufixo descritivo, conforme evidenciado por:

- Linha 1086: `// Ponto de verificação 1 — review job: verificar title`
- Linha 1128: `// Ponto de verificação 1 — issue job: verificar title e description`

## Abordagem Técnica

Alterar **apenas o texto** do comentário na linha 927, renumerando de `2` para `3` para manter sequencialidade dentro de `executeReviewJob`:

**Antes:**
```js
// Ponto de verificação 2 — verificar existingComments antes de passar ao Claude
```

**Depois:**
```js
// Ponto de verificação 3 — verificar existingComments antes de passar ao Claude
```

O comentário da linha 916 permanece inalterado — já está correto como `// Ponto de verificação 2`.

### Justificativa

- Segue o padrão já estabelecido no arquivo (numeração sequencial + sufixo descritivo).
- Alteração mínima: apenas o número `2` → `3` no segundo comentário.
- Zero impacto em runtime — comentários não afetam execução.

## Componentes / Arquivos Modificados

| Arquivo | Linha | Tipo de Alteração |
|---|---|---|
| `automation/server.js` | 927 | Texto de comentário (`2` → `3`) |

Nenhum outro arquivo será criado ou modificado.

## Modelos de Dados

Não aplicável — alteração puramente cosmética em comentário.

## Decisões Técnicas

### Alternativa A (escolhida): renumerar o segundo comentário para `3`
- Mantém consistência com o padrão sequencial do arquivo.
- Mínima alteração (1 caractere).

### Alternativa B: usar nomes descritivos sem numeração
- Ex: `// Verificação de injeção no diff` e `// Verificação de injeção nos comentários existentes`
- Descartada: foge do padrão `// Ponto de verificação N — ...` já consolidado no arquivo.

### Alternativa C: alterar ambos os comentários
- Desnecessário; o primeiro já está correto e legível.
- Descartada para manter o escopo mínimo.

## Riscos e Trade-offs

- **Risco:** Nenhum. Comentários não afetam compilação, testes ou runtime.
- **Trade-off:** A numeração ficará 1, 2, 3 dentro de `executeReviewJob`, enquanto outras funções do mesmo arquivo também usam `1` como ponto inicial — isso é aceitável pois o contexto (nome da função) delimita o escopo de cada sequência.
