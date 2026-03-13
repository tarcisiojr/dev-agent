# Requisitos — Issue #6: handleWebhook deve ser declarada como async

## Resumo do Problema

A função `handleWebhook` em `automation/server.js` foi originalmente declarada como função síncrona (`function handleWebhook(...)`), mas o código interno utiliza `await blockJob(...)` em dois pontos distintos (detecção de prompt injection em review jobs e em issue jobs).

Este é um bug crítico com dois cenários de falha dependendo da versão do Node.js:

- **Node.js v16+**: `await` fora de uma função `async` é um `SyntaxError` que impede o processo de iniciar completamente — o servidor não sobe.
- **Node.js < v16**: `await` seria tratado como identificador, a Promise retornada por `blockJob` nunca seria aguardada, e jobs com prompt injection detectado seriam enfileirados normalmente — a feature de segurança se tornaria completamente ineficaz.

### Contexto Adicional

O bug foi introduzido pelo fix da issue #3 (proteção contra prompt injection), que adicionou chamadas `await blockJob(...)` dentro de `handleWebhook` sem converter a função para `async`. O caller do webhook também precisava ser ajustado para tratar a Promise retornada.

**Status atual**: O commit `aa5724b` já aplicou o fix na branch `main`. Esta fase de Requirements documenta os requisitos para validação e rastreabilidade do pipeline SDD.

---

## Requisitos Funcionais

### RF-01: Declaração assíncrona de handleWebhook
A função `handleWebhook` em `automation/server.js` deve ser declarada como `async`:
```js
async function handleWebhook(headers, body, res) { ... }
```

### RF-02: Chamador deve tratar a Promise retornada
O código que invoca `handleWebhook` (dentro do handler HTTP em `req.on('end', ...)`) deve tratar a Promise retornada. A abordagem correta é usar `.catch()` para capturar erros não tratados:
```js
handleWebhook(req.headers, body, res).catch((err) => {
  console.error('[erro] Falha ao processar webhook:', err.message);
  if (!res.headersSent) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal error' }));
  }
});
```

### RF-03: Comportamento correto do await blockJob
Todas as chamadas `await blockJob(...)` dentro de `handleWebhook` devem ser corretamente aguardadas, garantindo que:
- O job seja marcado como `blocked` no jobStore antes de responder ao webhook
- O comentário de notificação seja postado na issue/PR antes de responder
- A resposta HTTP retorne `{ status: 'blocked', reason: 'prompt_injection' }` somente após a conclusão do bloqueio

### RF-04: Pontos de verificação de prompt injection ativos
Os dois pontos de verificação devem funcionar corretamente:
1. **Review job (PR)**: verificação do campo `title` antes de enfileirar um job de review
2. **Issue job**: verificação dos campos `title` e `description` antes de enfileirar um job de fix

---

## Requisitos Não-Funcionais

### RNF-01: Sem regressão de comportamento
A mudança de síncrona para assíncrona não deve alterar nenhum comportamento observável além de corrigir o bug — tempo de resposta, formato de resposta HTTP e lógica de roteamento devem permanecer iguais.

### RNF-02: Compatibilidade com Node.js
A correção deve funcionar nas versões de Node.js suportadas pelo projeto (atualmente indicadas no ambiente de execução). A declaração `async/await` é suportada desde Node.js v7.6.

### RNF-03: Segurança — proteção contra prompt injection efetiva
Após a correção, a feature de bloqueio de prompt injection (introduzida na issue #3) deve ser efetiva: jobs com conteúdo malicioso detectado NÃO devem ser enfileirados.

---

## Escopo

### Incluído
- Alteração da declaração de `handleWebhook` para `async`
- Ajuste do chamador para tratar a Promise (`.catch()`)
- Verificação de que todas as chamadas `await blockJob(...)` dentro de `handleWebhook` funcionam corretamente

### Excluído
- Refatoração de outras funções no servidor
- Alterações na lógica de detecção de prompt injection (`detectPromptInjection`, `blockJob`)
- Mudanças nos testes existentes além do necessário para refletir o comportamento corrigido
- Adição de novos pontos de verificação de prompt injection além dos já existentes

---

## Critérios de Aceitação

### CA-01: Servidor inicializa sem erros
Dado que o servidor é iniciado com `node server.js`,
Quando o processo é inicializado,
Então não deve haver `SyntaxError` relacionado a `await` fora de função `async`.

### CA-02: Webhook com prompt injection em título de issue é bloqueado
Dado um webhook de issue com label `ai-fix` onde o título contém padrão de prompt injection,
Quando o webhook é recebido,
Então a resposta deve ser `{ status: 'blocked', reason: 'prompt_injection' }` (HTTP 200),
E o job NÃO deve ser enfileirado,
E o jobStore deve registrar o job com `status: 'blocked'`,
E um comentário de notificação deve ser postado na issue.

### CA-03: Webhook com prompt injection em descrição de issue é bloqueado
Dado um webhook de issue com label `ai-fix` onde a descrição contém padrão de prompt injection,
Quando o webhook é recebido,
Então a resposta deve ser `{ status: 'blocked', reason: 'prompt_injection' }` (HTTP 200),
E o job NÃO deve ser enfileirado.

### CA-04: Webhook com prompt injection em título de PR é bloqueado
Dado um webhook de PR com label `ai-review` onde o título contém padrão de prompt injection,
Quando o webhook é recebido,
Então a resposta deve ser `{ status: 'blocked', reason: 'prompt_injection' }` (HTTP 200),
E o job NÃO deve ser enfileirado.

### CA-05: Webhook legítimo continua sendo enfileirado
Dado um webhook de issue com label `ai-fix` sem conteúdo de prompt injection,
Quando o webhook é recebido,
Então a resposta deve ser `{ status: 'queued' }` (HTTP 200),
E o job deve ser enfileirado normalmente.

### CA-06: Erros internos retornam HTTP 500
Dado que ocorra uma exceção dentro de `handleWebhook`,
Quando o webhook é processado,
Então a resposta deve ser HTTP 500 com `{ error: 'Internal error' }`,
E o erro deve ser logado no console.

### CA-07: Testes existentes passam sem modificação de comportamento
Dado que os testes em `automation/` sejam executados com `npm test`,
Quando a suite é rodada após a correção,
Então todos os testes devem passar.
