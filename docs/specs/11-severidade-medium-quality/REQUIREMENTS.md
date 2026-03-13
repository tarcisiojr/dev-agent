# Requisitos — Issue #11: Tratamento de erros em `blockJob` (commentFn)

## Resumo do Problema

A função `blockJob` em `automation/server.js` (linha 380) chama `await commentFn(job, message)` sem envolver a chamada em um bloco `try/catch`. Isso significa que erros da API do GitHub/GitLab (timeout, rate limit, credencial inválida, erro de rede) se propagam para o caller.

O problema é especialmente crítico quando `blockJob` é chamado dentro de `handleWebhook` (linhas 1089 e 1136). Se a chamada à API falhar, o erro sobe pelo stack sem que nenhuma resposta HTTP seja enviada ao webhook do GitHub/GitLab, fazendo com que a plataforma considere a requisição como falha e execute retentativas — potencialmente gerando processamento duplicado do mesmo evento.

O job já foi persistido com `status: 'blocked'` antes de `commentFn` ser chamado. Portanto, o comentário na issue/PR é uma operação de notificação *best-effort* e não deve comprometer o fluxo de resposta HTTP.

### Contexto do Código

```
blockJob(job, field, detectionResult, commentFn)
  ├── loga detecção de prompt injection
  ├── atualiza job.status = 'blocked' e persiste via upsertJob(job)  ← já feito
  └── await commentFn(job, message)  ← pode lançar exceção ← BUG AQUI
```

Callers de `blockJob` em `handleWebhook`:
- Linha 1089: `await blockJob(job, 'title', titleCheckReview, commentOnPR)`
- Linha 1136: `await blockJob(job, field, result, commentOnIssue)`

Callers em `executeReviewJob`:
- Linha 919: `await blockJob(job, 'diff', diffCheck, commentOnPR)`
- Linha 931: `await blockJob(job, 'existingComments', commentsCheck, commentOnPR)`

---

## Requisitos Funcionais

### RF-01 — Isolar falha da notificação de bloqueio
A função `blockJob` DEVE envolver a chamada `await commentFn(job, message)` em um bloco `try/catch`, de modo que erros de rede ou de API não se propaguem ao caller.

### RF-02 — Logar falha na notificação de bloqueio
Se `commentFn` lançar uma exceção, `blockJob` DEVE registrar o erro no log com o prefixo `[security]`, incluindo o `jobTag(job)` e `err.message`, mas NÃO relançar a exceção.

### RF-03 — Garantir persistência do status antes da notificação
O job DEVE continuar sendo persistido com `status: 'blocked'` via `upsertJob(job)` **antes** da tentativa de `commentFn`. Essa ordem não deve ser alterada.

### RF-04 — Manter resposta HTTP ao webhook mesmo se API falhar
Quando `blockJob` é chamado dentro de `handleWebhook`, o handler DEVE sempre enviar uma resposta HTTP `200` (com body `{ status: 'blocked', reason: 'prompt_injection' }`) após o retorno de `blockJob`, independentemente do sucesso ou falha do comentário na plataforma.

---

## Requisitos Não-Funcionais

### RNF-01 — Resiliência
A indisponibilidade temporária das APIs do GitHub/GitLab (rate limit, timeout, credencial inválida) NÃO deve impedir que o sistema responda corretamente ao webhook e atualize o estado interno do job.

### RNF-02 — Observabilidade
Toda falha silenciada em `commentFn` DEVE produzir uma entrada de log de nível `error` com informação suficiente para diagnóstico (plataforma, repo, issue/PR ID, mensagem de erro).

### RNF-03 — Escopo mínimo
A correção deve ser cirúrgica: apenas a função `blockJob` precisa ser modificada. Nenhuma outra função deve ter seu comportamento alterado.

---

## Escopo

### Incluído
- Adicionar `try/catch` em torno de `await commentFn(job, message)` dentro de `blockJob`.
- Logar o erro capturado com `console.error`.

### Excluído
- Implementar retry automático para `commentFn` em caso de falha.
- Alterar a lógica de detecção de prompt injection.
- Modificar os callers de `blockJob`.
- Alterar o tratamento de erros em `commentOnIssue` ou `commentOnPR` (que já possuem seu próprio `try/catch`).
- Qualquer modificação de comportamento em outros fluxos do servidor.

---

## Critérios de Aceitação

### CA-01 — Sem propagação de erro
Dado que `commentFn` lança uma exceção (ex: erro de rede simulado), quando `blockJob` é chamado, então o erro NÃO deve se propagar para fora de `blockJob` (a função deve resolver normalmente).

### CA-02 — Log de falha registrado
Dado que `commentFn` lança uma exceção com mensagem "API timeout", quando `blockJob` é chamado, então o log DEVE conter uma entrada `console.error` com o prefixo `[security]` e a mensagem de erro.

### CA-03 — Job persiste como bloqueado
Dado que `commentFn` lança uma exceção, quando `blockJob` é chamado, então o job DEVE continuar com `status: 'blocked'` no `jobStore` (verificável via `upsertJob`).

### CA-04 — Webhook responde corretamente após falha da API
Dado que `blockJob` é chamado dentro de `handleWebhook` e `commentFn` lança exceção, quando o webhook recebe o evento, então a resposta HTTP DEVE ser `200` com body `{ status: 'blocked', reason: 'prompt_injection' }`.

### CA-05 — Testes existentes continuam passando
Todos os testes existentes em `automation/promptInjectionDetector.test.js` devem continuar passando após a mudança.
