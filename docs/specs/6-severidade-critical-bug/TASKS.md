# Tarefas — Issue #6: handleWebhook deve ser declarada como async

## 1. Verificação do Estado Atual

- [x] 1.1 Verificar que `handleWebhook` em `automation/server.js` está declarada como `async function handleWebhook(headers, body, res)`
- [x] 1.2 Verificar que o chamador em `req.on('end', ...)` encadeia `.catch()` na chamada de `handleWebhook`
- [x] 1.3 Confirmar que os dois pontos com `await blockJob(...)` estão dentro de uma função `async` válida

## 2. Implementação do Fix (automation/server.js)

- [x] 2.1 Alterar declaração de `handleWebhook` de síncrona para `async` (linha ~1047 em `automation/server.js`)
- [x] 2.2 Encadear `.catch((err) => { ... })` na chamada `handleWebhook(req.headers, body, res)` dentro do handler `req.on('end', ...)` (linha ~1037 em `automation/server.js`)
- [x] 2.3 Garantir que o `.catch()` loga o erro via `console.error` e responde com HTTP 500 e `{ error: 'Internal error' }` quando `!res.headersSent`

## 3. Validação dos Pontos de await

- [x] 3.1 Confirmar que `await blockJob(...)` no fluxo de PR/review job (detecção em `title`) está corretamente aguardado após o fix
- [x] 3.2 Confirmar que `await blockJob(...)` no fluxo de issue job (detecção em `title` e `description`) está corretamente aguardado após o fix

## 4. Testes e Critérios de Aceitação

- [x] 4.1 Executar `npm test` em `automation/` e confirmar que todos os testes existentes passam (CA-07)
- [x] 4.2 Verificar manualmente (ou via teste) que servidor inicia sem `SyntaxError` (CA-01)
- [x] 4.3 Verificar que webhook com prompt injection em título de PR retorna `{ status: 'blocked', reason: 'prompt_injection' }` e não enfileira o job (CA-04)
- [x] 4.4 Verificar que webhook com prompt injection em título de issue retorna `{ status: 'blocked', reason: 'prompt_injection' }` e não enfileira o job (CA-02)
- [x] 4.5 Verificar que webhook com prompt injection em descrição de issue retorna `{ status: 'blocked', reason: 'prompt_injection' }` e não enfileira o job (CA-03)
- [x] 4.6 Verificar que webhook legítimo (sem prompt injection) continua sendo enfileirado normalmente com `{ status: 'queued' }` (CA-05)
- [x] 4.7 Verificar que erros internos retornam HTTP 500 com `{ error: 'Internal error' }` (CA-06)
