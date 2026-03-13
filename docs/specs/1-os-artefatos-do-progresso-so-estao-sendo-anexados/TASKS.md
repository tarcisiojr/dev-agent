# Tarefas — Issue #1: Artefatos nos comentários de progresso por fase

## 1. Leitura e Entendimento do Código

- [ ] 1.1 Ler `automation/server.js` nas regiões relevantes: função `readPhaseArtifact` (~linha 397), bloco `if/else if` de comentários de progresso (~linhas 612–626) e bloco de montagem do comentário final (~linhas 639–660)

## 2. Implementação

- [ ] 2.1 Adicionar função auxiliar `buildArtifactBlock(issueDir, phaseName, job)` em `automation/server.js` imediatamente após a função `readPhaseArtifact` (~linha 406), com mapeamento de labels e retorno de bloco `<details>` ou string vazia se artefato ausente
- [ ] 2.2 Atualizar o branch `phaseName === 'tasks'` no bloco `if/else if` de comentários de progresso (~linha 614) para concatenar `buildArtifactBlock(issueDir, phaseName, job)` ao texto do `commentOnIssue`
- [ ] 2.3 Atualizar o branch `else` (fases `requirements` e `design`) no bloco `if/else if` de comentários de progresso (~linha 621) para concatenar `buildArtifactBlock(issueDir, phaseName, job)` ao texto do `commentOnIssue`
- [ ] 2.4 Remover o loop de montagem de `sddBlock` (variável, loop `for` e concatenação `sddBlock` na chamada `commentOnIssue`) do comentário final em `automation/server.js` (~linhas 639–648)

## 3. Verificação

- [ ] 3.1 Confirmar que os branches `phaseName === 'implementation'` e `phaseName === 'finalize'` em `automation/server.js` permanecem sem artefato (comportamento inalterado)
- [ ] 3.2 Revisar o diff completo de `automation/server.js` garantindo que apenas as 3 regiões descritas no design foram tocadas e que nenhuma lógica de execução de fases, retry ou squash foi alterada
