# Tarefas — Issue #7: Guarda de tipo em `detectPromptInjection` e `normalizeContent`

## 1. Correção de Código

- [x] 1.1 Adicionar guarda de tipo `typeof content !== 'string'` em `normalizeContent` em `automation/promptInjectionDetector.js` (linha ~59)
- [x] 1.2 Adicionar guarda de tipo `typeof content !== 'string'` em `detectPromptInjection` em `automation/promptInjectionDetector.js` (linha ~73)

## 2. Testes

- [x] 2.1 Adicionar casos de teste para entradas não-string em `automation/promptInjectionDetector.test.js`: array vazio (`[]`), array com string (`['text']`), objeto literal (`{}`), número (`42`)
- [x] 2.2 Verificar que todos os testes existentes continuam passando via `node --test automation/promptInjectionDetector.test.js`
