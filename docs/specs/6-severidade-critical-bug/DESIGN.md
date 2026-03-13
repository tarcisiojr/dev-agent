# Design Técnico — Issue #6: handleWebhook deve ser declarada como async

## 1. Contexto e Estado Atual

### Estado antes do fix (pré-commit `aa5724b`)

A função `handleWebhook` em `automation/server.js` era declarada como síncrona:

```js
function handleWebhook(headers, body, res) { ... }
```

Internamente, porém, ela continha dois usos de `await`:

- **Linha ~1089** (PR/review job): `await blockJob(job, 'title', titleCheckReview, commentOnPR)`
- **Linha ~1136** (issue job): `await blockJob(job, field, result, commentOnIssue)`

O chamador no handler HTTP também não tratava nenhuma Promise:

```js
req.on('end', () => {
  handleWebhook(req.headers, body, res);  // Promise ignorada
});
```

### Estado após o fix (commit `aa5724b` — estado atual no código)

`handleWebhook` é declarada como `async` (linha 1047):

```js
async function handleWebhook(headers, body, res) { ... }
```

O chamador trata a Promise com `.catch()` (linha 1037):

```js
handleWebhook(req.headers, body, res).catch((err) => {
  console.error('[erro] Falha ao processar webhook:', err.message);
  if (!res.headersSent) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal error' }));
  }
});
```

---

## 2. Análise do Bug

### Cenário 1 — Node.js v16+

`await` fora de uma função `async` (exceto em ES Modules top-level) é um `SyntaxError` em tempo de parse. O processo Node.js lança o erro ao carregar o arquivo e **nunca inicializa**. O servidor simplesmente não sobe.

### Cenário 2 — Node.js < v16

`await` como identificador common (não-reservado em contexto síncrono antigo) faz com que `await blockJob(...)` seja avaliado como expressão que ignora a Promise retornada. O job seria enfileirado normalmente mesmo quando prompt injection for detectado — a feature de segurança introduzida na issue #3 seria completamente ineficaz.

---

## 3. Abordagem Técnica

### Decisão: Mínima e cirúrgica

A correção exige exatamente **duas mudanças** no arquivo `automation/server.js`:

| # | Local | Mudança |
|---|-------|---------|
| 1 | Declaração de `handleWebhook` | Adicionar `async` à declaração da função |
| 2 | Chamada de `handleWebhook` no handler `req.on('end', ...)` | Encadear `.catch()` na chamada para capturar rejeições da Promise |

Nenhuma outra alteração é necessária: a lógica interna, o fluxo de roteamento, os formatos de resposta HTTP e as funções auxiliares (`blockJob`, `detectPromptInjection`, `commentOnIssue`, `commentOnPR`) permanecem inalterados.

### Por que `.catch()` e não `await` no chamador?

O handler `req.on('end', callback)` é uma callback síncrona do Node.js — não pode ser declarada `async` sem risco de silenciar erros (uma `async` callback passada para `req.on` torna a Promise resultado invisível para o emissor de eventos). O padrão correto é encadear `.catch()` para garantir que rejeições sejam capturadas e tratadas, retornando HTTP 500 com body `{ error: 'Internal error' }`.

Alternativa descartada: tornar a callback `async`:
```js
req.on('end', async () => { await handleWebhook(...); });
```
Embora funcione na prática para este caso, não é idiomático — erros não capturados dentro de uma `async` callback de EventEmitter podem produzir `UnhandledPromiseRejection` dependendo da versão do Node.js e da configuração. O `.catch()` explícito é mais robusto e legível.

---

## 4. Componentes Modificados

### `automation/server.js`

Único arquivo alterado. Duas linhas modificadas:

**Mudança 1 — Declaração da função (linha 1047 no estado atual):**
```js
// Antes:
function handleWebhook(headers, body, res) {

// Depois:
async function handleWebhook(headers, body, res) {
```

**Mudança 2 — Chamador (dentro do handler `req.on('end', ...)`):**
```js
// Antes:
req.on('end', () => {
  handleWebhook(req.headers, body, res);
});

// Depois:
req.on('end', () => {
  handleWebhook(req.headers, body, res).catch((err) => {
    console.error('[erro] Falha ao processar webhook:', err.message);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal error' }));
    }
  });
});
```

### Arquivos não modificados

- `automation/promptInjectionDetector.js` — lógica de detecção inalterada
- `automation/jobStore.js` — persistência inalterada
- `automation/prompts.js` — builders de prompt inalterados
- Qualquer arquivo de teste existente (sem modificação de comportamento)

---

## 5. Modelos de Dados

Nenhuma mudança em modelos de dados. O shape do `job` object, o formato do `jobStore`, e os payloads de resposta HTTP permanecem idênticos.

---

## 6. Fluxo de Execução (pós-fix)

```
POST /webhook
  └─► req.on('end', () => {
        handleWebhook(...).catch(errorHandler)   ← Promise retornada e capturada
          │
          ├─► [PR event + ai-review label]
          │     └─► detectPromptInjection(title)
          │           ├─ detected → await blockJob(...)  ← agora corretamente aguardado
          │           │             res.end({ status: 'blocked' })
          │           └─ clean   → enqueue(job)
          │                        res.end({ status: 'queued' })
          │
          └─► [Issue event + ai-fix label]
                └─► detectPromptInjection(title) + detectPromptInjection(description)
                      ├─ detected → await blockJob(...)  ← agora corretamente aguardado
                      │             res.end({ status: 'blocked' })
                      └─ clean   → enqueue(job)
                                   res.end({ status: 'queued' })
      })
```

---

## 7. Decisões Técnicas

| Decisão | Escolha | Alternativa Descartada | Justificativa |
|---------|---------|------------------------|---------------|
| Escopo da correção | Apenas `handleWebhook` + chamador | Refatorar toda a função | Minimiza risco de regressão; o bug é pontual |
| Tratamento de erros no chamador | `.catch()` explícito | `async` callback no `req.on` | Mais idiomático; evita `UnhandledPromiseRejection` silenciosos |
| Resposta HTTP em erro interno | `500 { error: 'Internal error' }` | Re-throw / sem resposta | Garante que o cliente receba uma resposta mesmo em caso de falha |
| Guard `res.headersSent` | Verificar antes de escrever | Sempre escrever | Previne erro `Cannot set headers after they are sent` |

---

## 8. Riscos e Trade-offs

### Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Regressão em fluxos síncronos de `handleWebhook` | Baixa | `async` em função sem `await` é transparente — comportamento idêntico |
| `.catch()` mascarar erros legítimos | Baixa | O `.catch()` loga o erro via `console.error` antes de responder com 500 |
| Dupla resposta HTTP (`res.end` + `.catch` tentando escrever) | Baixa | Guard `res.headersSent` previne a condição |

### Trade-offs aceitos

- A função `handleWebhook` passa a retornar uma `Promise`, mas como o chamador trata corretamente com `.catch()`, não há efeito observável para os clientes do webhook.
- Nenhum teste novo é criado nesta fase de Design; a validação é delegada à suite existente (critério CA-07) e aos critérios de aceitação funcionais (CA-01 a CA-06).

---

## 9. Compatibilidade

- `async/await` é suportado desde **Node.js v7.6** (janeiro 2017).
- O projeto utiliza constructs `async/await` em diversas outras funções do mesmo arquivo (`processNext`, `executeJob`, `commentOnIssue`, etc.), confirmando que o ambiente suporta a feature.
- Nenhuma dependência nova é introduzida.

---

## 10. Status de Implementação

O fix foi aplicado no commit `aa5724b` na branch `fix/issue-6`. Este documento registra o design para fins de rastreabilidade e validação no pipeline SDD.
