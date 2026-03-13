# Design Técnico — Issue #11: Tratamento de erros em `blockJob` (commentFn)

## 1. Contexto e Estado Atual

### Função afetada

**Arquivo:** `automation/server.js`
**Função:** `blockJob` (linha 380)

```js
async function blockJob(job, field, detectionResult, commentFn) {
  // ...
  job.status = 'blocked';
  job.blockedReason = { ... };
  upsertJob(job);          // job persiste como 'blocked' ← já OK

  const message = [ ... ].join('\n');

  await commentFn(job, message);  // ← exceção não tratada ← BUG
}
```

Se `commentFn` lançar uma exceção (timeout, rate limit, credencial inválida), o erro se propaga para o caller. Nos callers dentro de `handleWebhook`, isso impede que a resposta HTTP seja enviada ao GitHub/GitLab, causando retentativas e potencial processamento duplicado.

### Callers de `blockJob`

| Local | Linha | Caller | commentFn |
|-------|-------|--------|-----------|
| `handleWebhook` | 1089 | título da issue/PR com injection | `commentOnPR` |
| `handleWebhook` | 1136 | campos da issue com injection | `commentOnIssue` |
| `executeReviewJob` | 919 | diff com injection | `commentOnPR` |
| `executeReviewJob` | 931 | comentários existentes com injection | `commentOnPR` |

### Funções `commentOnPR` e `commentOnIssue`

Ambas já possuem `try/catch` interno para logar falhas de HTTP, mas não para falhas de rede (ex: `ECONNREFUSED`, `ETIMEDOUT`) que podem lançar antes de obter uma resposta. Portanto, o `try/catch` em `blockJob` serve como camada de segurança adicional independente.

---

## 2. Abordagem Técnica

### Solução escolhida: `try/catch` cirúrgico em `blockJob`

Envolver apenas a chamada `await commentFn(job, message)` em um bloco `try/catch` dentro de `blockJob`. O erro capturado é logado e silenciado — não relançado.

```js
try {
  await commentFn(job, message);
} catch (err) {
  console.error(`[security] ${jobTag(job)} Falha ao postar comentário de bloqueio:`, err.message);
}
```

**Justificativa:**
- O job já foi persistido com `status: 'blocked'` antes da chamada — o estado interno está correto.
- O comentário na issue/PR é notificação *best-effort*: sua falha não invalida o bloqueio.
- A mudança é mínima, cirúrgica e não altera callers nem outras funções.
- Alinha com o padrão já adotado em outros pontos do código (linhas 241, 752, etc.) onde falhas de comentário são logadas e silenciadas.

### Alternativas consideradas e descartadas

| Alternativa | Motivo do descarte |
|-------------|-------------------|
| Adicionar `try/catch` nos callers de `blockJob` | Replicação desnecessária; não corrige o problema na raiz |
| Implementar retry automático para `commentFn` | Fora do escopo; complexidade desnecessária para notificação best-effort |
| Propagar o erro e tratar no `handleWebhook` | Aumentaria complexidade do caller sem benefício; o handler já tem lógica própria |
| Modificar `commentOnPR`/`commentOnIssue` para nunca lançar | Essas funções possuem semântica própria e são usadas em outros contextos |

---

## 3. Componentes Modificados

### `automation/server.js`

**Mudança:** Envolver `await commentFn(job, message)` em `try/catch` dentro de `blockJob`.

**Antes (linha 403):**
```js
await commentFn(job, message);
```

**Depois:**
```js
try {
  await commentFn(job, message);
} catch (err) {
  console.error(`[security] ${jobTag(job)} Falha ao postar comentário de bloqueio:`, err.message);
}
```

Nenhum outro arquivo precisa ser modificado.

---

## 4. Modelos de Dados

Nenhuma alteração de modelo de dados. O campo `job.blockedReason` e `job.status = 'blocked'` permanecem inalterados e são persistidos antes da tentativa de comentário.

---

## 5. Decisões Técnicas

### D-01 — Prefixo de log `[security]`
Mantido consistente com o log existente na mesma função (linha 383–385). Facilita grep/filtro em logs operacionais para eventos de segurança.

### D-02 — Logar apenas `err.message`, não o stack completo
Segue o padrão existente no código (ex: linhas 94, 241, 752). O stack completo não é necessário para diagnóstico de falhas de API; `err.message` contém informação suficiente (ex: "API rate limit exceeded", "ETIMEDOUT").

### D-03 — Não relançar a exceção
O requisito RF-01 e RF-04 são explícitos: `blockJob` deve resolver normalmente mesmo com falha de `commentFn`. Relançar destruiria a semântica de best-effort.

### D-04 — Não modificar callers
O requisito RNF-03 (escopo mínimo) determina que apenas `blockJob` seja alterado. Os callers em `handleWebhook` e `executeReviewJob` já enviam suas respostas/continuam o fluxo após o retorno de `blockJob` — nenhuma mudança necessária lá.

---

## 6. Riscos e Trade-offs

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Falha silenciosa não detectada em produção | Baixo | Log de nível `error` garante observabilidade (RNF-02) |
| Comentário de bloqueio nunca postado sem alerta ao admin | Baixo | Log com `[security]` + `jobTag` permite identificar job e plataforma |
| Mudança quebrar testes existentes | Muito baixo | A mudança apenas adiciona `try/catch`; comportamento em sucesso é idêntico |

### Trade-off principal
Silenciar erros de `commentFn` significa que o usuário que abriu a issue/PR pode não receber o comentário de bloqueio. Isso é aceitável porque:
1. O job já está bloqueado no sistema interno.
2. A ausência do comentário é preferível a duplicação de eventos via retry do webhook.
3. O log de erro permite investigação e reenvio manual se necessário.
