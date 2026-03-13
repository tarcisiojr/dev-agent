# Tarefas — Issue #5: Ignorar arquivos MD do review

## 1. Constante de Configuração

- [x] 1.1 Adicionar constante `IGNORED_REVIEW_EXTENSIONS` em `automation/server.js` logo abaixo da constante `MAX_DIFF_SIZE` (linha ~281), com valor `['.md']`

## 2. Função de Filtragem

- [x] 2.1 Implementar função auxiliar `filterDiff(diff, ignoredExts)` em `automation/server.js`, que divide o diff em blocos por arquivo (`diff --git`), descarta blocos cujo caminho termine com extensão ignorada e retorna o diff filtrado
- [x] 2.2 Garantir que `filterDiff` trata corretamente edge cases: diff vazio (`''`), blocos sem caminho detectável (mantidos), e caminhos com aspas/caracteres especiais no formato git

## 3. Filtragem em `fetchPRDiff`

- [x] 3.1 Chamar `filterDiff(diff, IGNORED_REVIEW_EXTENSIONS)` dentro de `fetchPRDiff` (`automation/server.js` linha ~284), após obter o diff bruto do git e **antes** de aplicar o truncamento por `MAX_DIFF_SIZE`

## 4. Filtragem em `fetchDiffFileList`

- [x] 4.1 Aplicar filtro na lista retornada por `fetchDiffFileList` (`automation/server.js` linha ~346) para excluir arquivos cuja extensão esteja em `IGNORED_REVIEW_EXTENSIONS`, usando `.filter(f => !IGNORED_REVIEW_EXTENSIONS.some(ext => f.endsWith(ext)))`

## 5. Tratamento de Diff Vazio

- [x] 5.1 Adicionar verificação em `executeReviewJob` (`automation/server.js` linha ~835), logo após a chamada a `fetchPRDiff`, que detecta diff vazio ou só-espaços, posta comentário no PR informando que apenas arquivos de documentação foram alterados, define `job.status = 'done'`, persiste o job e encerra a função sem invocar o Claude
