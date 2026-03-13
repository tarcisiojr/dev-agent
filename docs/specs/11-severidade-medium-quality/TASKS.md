# Tarefas — Issue #11: Tratamento de erros em `blockJob` (commentFn)

## 1. Implementação

- [ ] 1.1 Envolver `await commentFn(job, message)` em `try/catch` dentro de `blockJob` em `automation/server.js` (linha ~403), logando o erro com `console.error` usando prefixo `[security]` e `jobTag(job)`, sem relançar a exceção

## 2. Testes

- [ ] 2.1 Verificar que os testes existentes em `automation/promptInjectionDetector.test.js` continuam passando após a mudança
- [ ] 2.2 Adicionar teste unitário para `blockJob` que simula falha de `commentFn` (ex: `commentFn` rejeita com erro "API timeout") e verifica que a função resolve normalmente sem propagar o erro
- [ ] 2.3 Adicionar teste que verifica que `console.error` é chamado com prefixo `[security]` quando `commentFn` falha
- [ ] 2.4 Adicionar teste que verifica que `upsertJob` é chamado com `status: 'blocked'` mesmo quando `commentFn` falha

## 3. Validação

- [ ] 3.1 Confirmar que todos os callers de `blockJob` em `handleWebhook` (linhas 1089 e 1136) e `executeReviewJob` (linhas 919 e 931) continuam funcionando sem modificação
- [ ] 3.2 Confirmar que nenhum outro arquivo além de `automation/server.js` foi modificado (escopo mínimo RNF-03)
